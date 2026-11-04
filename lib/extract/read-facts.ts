import { callStructured, docBlocks, type PdfInput } from "./read-contract";
import { splitLegal, type ParsedImport } from "@/lib/offer/ren-import";
import type { OfferAddendum, OfferTerms } from "@/lib/offer/terms";

// "Fill from a document": the intake reader aimed at offer FACTS. A FlexMLS listing print is the
// design target; an appraisal district printout or a prior contract reads too.
//
// Facts only. This list is everything the reader can return: there is no key for a price,
// earnest money, option terms or a closing date, so a list price can never become the offer price.
// Only high and medium confidence values are used; anything else stays blank and is listed.

export const FACT_KEYS = [
  "sellers", "property_street", "property_city", "property_state", "property_zip", "property_county",
  "legal_description", "lot", "block", "subdivision", "year_built", "hoa_mandatory", "hoa_name",
  "title_company", "title_company_address", "listing_broker_firm", "listing_broker_license", "listing_broker_address", "listing_broker_phone",
  "listing_agent_name", "listing_agent_license", "listing_agent_email", "listing_agent_phone", "mls_number",
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

const GUIDE: Record<FactKey, string> = {
  sellers: "Owner(s) of record or seller name(s) exactly as written (an estate, trust or company as styled). Several separated by '; '.",
  property_street: "Street address (house number and street)", property_city: "City", property_state: "Two-letter state",
  property_zip: "ZIP code", property_county: "County",
  legal_description: "Legal description exactly as written",
  lot: "Lot number, if shown separately", block: "Block, if shown separately", subdivision: "Subdivision or addition name, if shown separately",
  year_built: "Year built (four digits)",
  hoa_mandatory: "Whether membership in an owners association is mandatory: 'yes' or 'no', only if the document says so",
  hoa_name: "Owners association name, if shown",
  title_company: "Title company exactly as named in the document (e.g. a 'Title Company' or 'Preferred Title' field)",
  title_company_address: "That title company's address, only if the document prints it",
  listing_broker_firm: "Listing brokerage / office name", listing_broker_license: "Listing office license number",
  listing_broker_address: "Listing office address", listing_broker_phone: "Listing office phone",
  listing_agent_name: "Listing agent name", listing_agent_license: "Listing agent license number",
  listing_agent_email: "Listing agent email", listing_agent_phone: "Listing agent phone (prefer the agent's direct or cell number)",
  mls_number: "MLS / listing number",
};
export const FACT_LABELS: Record<FactKey, string> = {
  sellers: "Seller", property_street: "Street address", property_city: "City", property_state: "State", property_zip: "ZIP",
  property_county: "County", legal_description: "Legal description", lot: "Lot", block: "Block", subdivision: "Addition",
  year_built: "Year built", hoa_mandatory: "HOA", hoa_name: "Association name", title_company: "Title company", title_company_address: "Title company address",
  listing_broker_firm: "Listing brokerage", listing_broker_license: "Listing brokerage license", listing_broker_address: "Listing brokerage address", listing_broker_phone: "Listing brokerage phone",
  listing_agent_name: "Listing agent", listing_agent_license: "Listing agent license", listing_agent_email: "Listing agent email",
  listing_agent_phone: "Listing agent phone", mls_number: "MLS number",
};

const SYSTEM = `You read documents a Texas real estate agent uses to write an offer: usually a FlexMLS listing detail print, sometimes an appraisal district (CAD) record or a prior contract.

Rules:
- Report FACTS about the property, the seller of record, the title company named in the document, and the listing side. Nothing else.
- Never report a price of any kind, earnest money, option terms, dates, or anything negotiated. There is no field for them; leave them out.
- Extract only what is written. Never guess or fill from general knowledge. Leave out anything blank, illegible or absent.
- Confidence: "high" when printed clearly in a labeled field; "medium" when clear but you had to choose between two candidates; "low" when unsure. Conflicting values in the document: report the one in the most specific field with "medium" and add a warning.
- Seller: a listing often shows the owner of record ("Owner", "Owner Name", "Legal Owner"). Report it as written. Don't use the listing agent or brokerage as the seller.

Fields to look for (report each one you find in "fields"; leave out what isn't there):
${FACT_KEYS.map((k) => `- ${k}: ${GUIDE[k]}`).join("\n")}`;

type Json = Record<string, unknown>;
const obj = (properties: Record<string, Json>): Json => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
export const factsFormat = {
  type: "json_schema" as const,
  schema: obj({
    fields: {
      type: "array",
      description: "One entry per fact you found. Leave out facts that are blank, illegible, or not in the document.",
      items: obj({
        field: { type: "string", enum: [...FACT_KEYS] },
        value: { type: "string", description: "The value as text. Several names separated by '; '." },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        page: { type: "integer", description: "Page it was on (1-based). 0 if unsure." },
      }),
    },
    warnings: { type: "array", items: { type: "string" }, description: "Anything unclear or conflicting, one short line each." },
  }),
};

export type FactsRead = { facts: Partial<Record<FactKey, string>>; unsure: FactKey[]; warnings: string[] };

/** Reader answer -> facts at or above the bar, and the facts it was unsure of. */
export function factsFromWire(raw: any): FactsRead {
  const rank = { high: 3, medium: 2, low: 1 } as Record<string, number>;
  const best = new Map<FactKey, { value: string; confidence: string }>();
  for (const f of Array.isArray(raw?.fields) ? raw.fields : []) {
    if (!f || !(FACT_KEYS as readonly string[]).includes(f.field) || typeof f.value !== "string" || !f.value.trim()) continue;
    const prev = best.get(f.field);
    if (!prev || (rank[f.confidence] ?? 0) > (rank[prev.confidence] ?? 0)) best.set(f.field, { value: f.value.trim(), confidence: f.confidence });
  }
  const facts: Partial<Record<FactKey, string>> = {};
  const unsure: FactKey[] = [];
  for (const [k, f] of best) {
    if ((rank[f.confidence] ?? 0) >= rank.medium) facts[k] = f.value; else unsure.push(k);
  }
  return { facts, unsure, warnings: Array.isArray(raw?.warnings) ? raw.warnings.filter((w: unknown) => typeof w === "string") : [] };
}

export async function readOfferFacts(pdf: PdfInput): Promise<FactsRead & { model: string }> {
  const { result, model } = await callStructured(
    SYSTEM,
    [...docBlocks([pdf]), { type: "text", text: "Record the property, seller, title company and listing-side facts in this document." }],
    factsFormat, factsFromWire, (x) => x as FactsRead,
  );
  return { ...result, model };
}

/** The facts the Terms screen shows, for the "could not read" note. */
const WANTED: FactKey[] = ["sellers", "property_street", "property_city", "property_zip", "property_county", "legal_description", "year_built", "title_company", "listing_broker_firm", "listing_agent_name", "listing_agent_email", "listing_agent_phone"];

/**
 * Facts -> the same shape the Ren import places, so both use one blanks-only placement.
 * Addenda are never included here: an HOA or pre-1978 house only becomes a suggestion.
 */
export function factsToImport(read: FactsRead): { parsed: ParsedImport; could_not_read: string[]; suggestions: OfferAddendum[] } {
  const f = read.facts;
  const v: Partial<OfferTerms> = {};
  const problems = [...read.warnings];
  const set = <K extends keyof OfferTerms>(k: K, x: OfferTerms[K] | null | undefined) => { if (x != null && x !== "") v[k] = x as OfferTerms[K]; };
  if (f.sellers) set("sellers", f.sellers.split(";").map((x) => x.trim()).filter(Boolean));
  set("property_street", f.property_street);
  set("property_city", f.property_city);
  set("property_zip", f.property_zip?.match(/\d{5}/)?.[0] ?? null);
  set("property_county", f.property_county?.replace(/\s+county$/i, ""));
  if (f.legal_description) {
    const parts = splitLegal(f.legal_description);
    if (parts) { set("lot", parts.lot); set("block", parts.block); set("subdivision", parts.subdivision); }
    else problems.push(`Legal description "${f.legal_description}" doesn't split into lot, block and addition. Type them on the Terms screen.`);
  }
  set("lot", f.lot); set("block", f.block); set("subdivision", f.subdivision?.replace(/\s+Addition$/i, ""));
  const year = Number(f.year_built?.match(/\b(1[89]\d\d|20\d\d)\b/)?.[1]);
  if (Number.isFinite(year)) set("year_built", year);
  set("title_company", f.title_company);
  set("title_company_address", f.title_company_address);
  set("listing_broker_firm", f.listing_broker_firm);
  set("listing_broker_license", f.listing_broker_license);
  set("listing_broker_address", f.listing_broker_address);
  set("listing_agent_name", f.listing_agent_name);
  set("listing_agent_license", f.listing_agent_license);
  set("listing_agent_email", f.listing_agent_email);
  set("listing_agent_phone", f.listing_agent_phone);
  if (f.property_state && f.property_state.toUpperCase() !== "TX") problems.push(`The document says the property is in ${f.property_state}. The TREC forms are for Texas property.`);

  const suggestions: OfferAddendum[] = [];
  if (/^y(es)?$|mandatory|required/i.test(f.hoa_mandatory ?? "")) suggestions.push("hoa");
  if (Number.isFinite(year) && year < 1978) suggestions.push("lead_based_paint");

  const could_not_read = WANTED.filter((k) => !f[k] && !(k === "legal_description" && f.lot && f.subdivision)).map((k) => (read.unsure.includes(k) ? `${FACT_LABELS[k]} (unclear, left blank)` : FACT_LABELS[k]));
  return {
    parsed: { values: v, addenda: [], unknown: [], unused: [], problems, prepared: null, mls_number: f.mls_number ?? null },
    could_not_read, suggestions,
  };
}
