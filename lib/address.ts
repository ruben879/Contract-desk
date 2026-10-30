// Conservative property-address matching for routing emailed documents to a deal.
// Two addresses match only when the house number and street name agree, and nothing
// that both sides state (suffix, direction, unit, ZIP, city) conflicts.

const SUFFIX: Record<string, string> = {
  street: "st", st: "st", avenue: "ave", ave: "ave", av: "ave", drive: "dr", dr: "dr", road: "rd", rd: "rd",
  lane: "ln", ln: "ln", boulevard: "blvd", blvd: "blvd", court: "ct", ct: "ct", circle: "cir", cir: "cir",
  place: "pl", pl: "pl", parkway: "pkwy", pkwy: "pkwy", trail: "trl", trl: "trl", way: "way", terrace: "ter", ter: "ter",
  highway: "hwy", hwy: "hwy", loop: "loop", cove: "cv", cv: "cv", point: "pt", pt: "pt", square: "sq", sq: "sq",
};
const DIRECTION: Record<string, string> = {
  north: "n", n: "n", south: "s", s: "s", east: "e", e: "e", west: "w", w: "w",
  northeast: "ne", ne: "ne", northwest: "nw", nw: "nw", southeast: "se", se: "se", southwest: "sw", sw: "sw",
};
const UNIT = new Set(["apt", "apartment", "unit", "ste", "suite", "#", "no", "bldg", "building"]);

export type ParsedAddress = { number: string | null; dir: string | null; name: string; suffix: string | null; unit: string | null };

export function parseStreet(raw: string | null | undefined): ParsedAddress | null {
  if (!raw) return null;
  const tokens = raw.toLowerCase().replace(/#/g, " # ").replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;

  let unit: string | null = null;
  const u = tokens.findIndex((t) => UNIT.has(t));
  if (u >= 0) { unit = tokens.slice(u + 1).join("") || null; tokens.splice(u); }

  const number = /^\d+[a-z]?$/.test(tokens[0] ?? "") ? tokens.shift()! : null;
  let dir: string | null = null;
  if (tokens.length > 1 && DIRECTION[tokens[0]]) dir = DIRECTION[tokens.shift()!];
  if (tokens.length > 1 && DIRECTION[tokens[tokens.length - 1]]) dir ??= DIRECTION[tokens.pop()!];
  let suffix: string | null = null;
  if (tokens.length > 1 && SUFFIX[tokens[tokens.length - 1]]) suffix = SUFFIX[tokens.pop()!];
  const name = tokens.join(" ");
  return name ? { number, dir, name, suffix, unit } : null;
}

const conflict = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() !== b.trim().toLowerCase();

export type AddressLike = { street: string | null | undefined; city?: string | null; zip?: string | null };

export function sameProperty(a: AddressLike, b: AddressLike): boolean {
  const x = parseStreet(a.street), y = parseStreet(b.street);
  if (!x || !y || !x.number || !y.number) return false;          // no house number, no match
  if (x.number !== y.number || x.name !== y.name) return false;
  if (conflict(x.suffix, y.suffix) || conflict(x.dir, y.dir) || conflict(x.unit, y.unit)) return false;
  if (conflict(a.zip?.slice(0, 5), b.zip?.slice(0, 5)) || conflict(a.city, b.city)) return false;
  return true;
}

export type RouteDecision =
  | { action: "attach"; transactionId: string }
  | { action: "create" }
  | { action: "sort"; reason: string; candidates: string[] };

/**
 * Where an emailed batch of documents goes. Only an exact single match attaches; a contract
 * with no existing deal starts one; everything else waits for a person.
 */
export function routeIntake(input: {
  isContract: boolean;
  property: AddressLike | null;
  activeDeals: { id: string; street: string | null; city: string | null; zip: string | null }[];
}): RouteDecision {
  const { isContract, property, activeDeals } = input;
  const hasAddress = !!parseStreet(property?.street)?.number;
  const matches = hasAddress ? activeDeals.filter((d) => sameProperty(property!, d)).map((d) => d.id) : [];

  if (isContract) {
    if (!hasAddress) return { action: "create" }; // a new contract with an unreadable address still starts a deal; the agent confirms the address
    if (matches.length === 0) return { action: "create" };
    return { action: "sort", reason: "This looks like a new contract, but there's already an active deal at this address (re-sent copy or back-up contract?).", candidates: matches };
  }
  if (!hasAddress) return { action: "sort", reason: "Couldn't read a property address on these documents.", candidates: [] };
  if (matches.length === 1) return { action: "attach", transactionId: matches[0] };
  if (matches.length > 1) return { action: "sort", reason: `The address matches ${matches.length} active deals.`, candidates: matches };
  return { action: "sort", reason: "No active deal at this address.", candidates: [] };
}
