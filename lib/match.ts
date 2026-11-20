// Does a document (or an offer) belong to this deal? Pure, so it's tested.
// Ruben, Nov 18: a document that matches the deal on nothing (property address, parties, and
// price all differ) is stopped at the door. Anything that matches on even one of the three, or
// that we can't tell about, goes through as before.

export type Verdict = "match" | "differ" | "unknown";

const SUFFIX: Record<string, string> = {
  street: "st", st: "st", avenue: "ave", ave: "ave", av: "ave", drive: "dr", dr: "dr", road: "rd", rd: "rd",
  lane: "ln", ln: "ln", court: "ct", ct: "ct", circle: "cir", cir: "cir", boulevard: "blvd", blvd: "blvd",
  place: "pl", pl: "pl", parkway: "pkwy", pkwy: "pkwy", highway: "hwy", hwy: "hwy", trail: "trl", trl: "trl",
  terrace: "ter", ter: "ter", way: "way", loop: "loop", cr: "cr",
};
const DIR: Record<string, string> = { north: "n", south: "s", east: "e", west: "w", n: "n", s: "s", e: "e", w: "w" };

/** "4002 97th Street" and "4002 97TH ST." read the same. Unit numbers and the city are left out. */
export function normalizeStreet(s: string | null | undefined): string | null {
  if (!s) return null;
  const words = s.toLowerCase().replace(/[.,#]/g, " ").replace(/\bcounty\s+road\b/g, "cr").split(/\s+/).filter(Boolean)
    .map((w) => DIR[w] ?? SUFFIX[w] ?? w);
  const cut = words.findIndex((w) => w === "unit" || w === "apt" || w === "suite" || w === "ste");
  const out = (cut >= 0 ? words.slice(0, cut) : words).join(" ").trim();
  return /^\d+[a-z]?\b/.test(out) ? out : null; // starts with a house number, or it isn't a street address
}

export function compareStreet(a: string | null | undefined, b: string | null | undefined): Verdict {
  const x = normalizeStreet(a), y = normalizeStreet(b);
  if (!x || !y) return "unknown";
  if (x === y) return "match";
  const [hx, ...rx] = x.split(" "), [hy, ...ry] = y.split(" ");
  if (hx !== hy) return "differ";
  // Same house number: the same street if one name holds the other ("97th st" vs "97th").
  const sx = rx.join(" "), sy = ry.join(" ");
  return sx.startsWith(sy) || sy.startsWith(sx) ? "match" : "differ";
}

const NOISE = new Set(["llc", "inc", "ltd", "lp", "co", "corp", "trust", "the", "and", "of", "jr", "sr", "ii", "iii", "estate", "company"]);
const nameWords = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !NOISE.has(w));

/** Any shared name word between the document's parties and the deal's (a last name, a company word) counts as a match. */
export function compareParties(docParties: string[], dealParties: string[]): Verdict {
  const a = new Set(docParties.flatMap(nameWords)), b = new Set(dealParties.flatMap(nameWords));
  if (!a.size || !b.size) return "unknown";
  for (const w of a) if (b.has(w)) return "match";
  return "differ";
}

/** Prices within a dollar match. (An amendment that changes the price still matches on address or parties.) */
export function comparePrice(docPrice: number | null | undefined, dealPrice: number | null | undefined): Verdict {
  if (docPrice == null || dealPrice == null || !(docPrice > 0) || !(dealPrice > 0)) return "unknown";
  return Math.abs(docPrice - dealPrice) < 1 ? "match" : "differ";
}

export type Seen = { property_street: string | null; parties: string[]; price: number | null };
export type Deal = { property_street: string | null; parties: string[]; price: number | null };
export type MatchResult = { address: Verdict; parties: Verdict; price: Verdict; mismatch: boolean };

/**
 * Stopped at the door only when nothing matches and the address plainly differs, plus at least
 * one of parties or price. A document with no address on it (an HOA letter, a receipt) is never stopped.
 */
export function matchDocument(seen: Seen, deal: Deal): MatchResult {
  const address = compareStreet(seen.property_street, deal.property_street);
  const parties = compareParties(seen.parties, deal.parties);
  const price = comparePrice(seen.price, deal.price);
  const all = [address, parties, price];
  const mismatch = !all.includes("match") && address === "differ" && (parties === "differ" || price === "differ");
  return { address, parties, price, mismatch };
}
