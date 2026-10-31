import { ADDENDUM_KEYS, DISCLOSURE_STATUSES, FINANCING_TYPES } from "@/lib/addenda";
import { SLOT_KEYS } from "@/lib/slots";
import { DOC_KINDS, FIELD_KEYS, type FieldKey } from "./schema";

// What the reader is asked to return (structured output, output_config.format), and the
// converters back to the app's own shape (schema.ts).
//
// The structured-output grammar allows only a handful of "value or null" fields per request,
// so nothing on the wire is nullable: every value carries a `found` flag, and "nothing" is
// "", 0, or []. The converters turn those back into nulls. Every object lists all its
// properties as required and sets additionalProperties: false, as the API requires.

type Json = Record<string, unknown>;
const obj = (properties: Record<string, Json>, description?: string): Json => ({
  type: "object", ...(description ? { description } : {}), properties,
  required: Object.keys(properties), additionalProperties: false,
});
const S: Json = { type: "string" }, N: Json = { type: "number" }, I: Json = { type: "integer" };
const A: Json = { type: "array", items: { type: "string" } };
const D: Json = { type: "string", description: "YYYY-MM-DD" };
const CONF: Json = { type: "string", enum: ["high", "medium", "low"] };

const LOC: Record<string, Json> = {
  doc: { type: "integer", description: "Document number (1-based, as labeled). 0 if not found." },
  page: { type: "integer", description: "Page within that document (1-based). 0 if not found." },
  quote: { type: "string", description: "Exact words copied from the page that contain the value, 3 to 12 words, verbatim. Empty if not found." },
  box: { type: "array", items: N, description: "Approximate region of the value on the page: [left, top, right, bottom] as fractions 0-1 of page width/height, origin top-left. Empty array if unknown." },
  source: { type: "string", description: "Paragraph reference, e.g. 'Para 5B'. Empty if none." },
};

const FIELDS: Record<FieldKey, [Json, string]> = {
  contract_form: [S, "Main contract form name and number, e.g. 'TREC One to Four Family Residential Contract (Resale) 20-18'"],
  buyers: [A, "Buyer names exactly as written"],
  sellers: [A, "Seller names exactly as written"],
  property_street: [S, "Street address"], property_city: [S, "City"], property_state: [S, "Two-letter state"],
  property_zip: [S, "ZIP code"], property_county: [S, "County"],
  legal_description: [S, "Lot, block, addition / legal description"],
  sales_price: [N, "Total sales price (Para 3C)"], financed_amount: [N, "Sum of financing (Para 3B)"],
  financing_type: [{ type: "string", enum: [...FINANCING_TYPES] }, "Cash if no financing; otherwise loan type from the financing addendum"],
  effective_date: [D, "Effective date filled in by the broker on the execution page. Not found if blank."],
  closing_date: [D, "Closing date (Para 9A)"],
  earnest_money: [N, "Earnest money amount (Para 5A)"], option_fee: [N, "Option fee (Para 5A/5B)"],
  option_period_days: [I, "Number of days in the option period (Para 5B)"],
  survey_days: [I, "Days to deliver survey/T-47 if stated (Para 6C)"],
  seller_disclosure: [{ type: "string", enum: [...DISCLOSURE_STATUSES] }, "Seller's Disclosure Notice box checked in Para 7B"],
  title_company: [S, "Title company name"], escrow_officer: [S, "Escrow officer name if stated"],
  listing_broker_firm: [S, "Listing broker firm (broker information page)"],
  listing_broker_license: [S, "Listing broker firm license number"],
  listing_agent_name: [S, "Listing associate name"], listing_agent_license: [S, "Listing associate license number"],
  listing_agent_email: [S, "Listing associate email"], listing_agent_phone: [S, "Listing associate phone"],
  buyer_broker_firm: [S, "Other/buyer's broker firm"], buyer_broker_license: [S, "Buyer's broker firm license number"],
  buyer_agent_name: [S, "Buyer's associate name"], buyer_agent_license: [S, "Buyer's associate license number"],
  buyer_agent_email: [S, "Buyer's associate email"], buyer_agent_phone: [S, "Buyer's associate phone"],
  lender_name: [S, "Lender name if it appears anywhere"],
};

const ADDENDUM = obj({
  key: { type: "string", enum: [...ADDENDUM_KEYS] }, name: S,
  form_number: { type: "string", description: "Form number, or empty" },
  doc: { type: "integer", description: "0 if unknown" }, page: { type: "integer", description: "0 if unknown" },
  evidence: { type: "string", enum: ["attached", "checked_only"] },
});
const DOCUMENTS: Json = {
  type: "array", description: "One entry per document sent: what it is and which file slot it belongs in.",
  items: obj({
    doc: I, kind: { type: "string", enum: [...DOC_KINDS] }, name: S,
    slot: { type: "string", enum: [...SLOT_KEYS, "none"] },
  }),
};

const schemaOf = (properties: Record<string, Json>) => ({ type: "json_schema" as const, schema: obj(properties) });

// One flat list of found fields: the grammar stays the same size however many fields exist.
// (The per-field version, 319 properties, was refused by the API as "compiled grammar too large".)
export const extractionFormat = schemaOf({
  fields: {
    type: "array",
    description: "One entry per contract field you found. Leave out fields that are blank, illegible, or not in the documents.",
    items: obj({
      field: { type: "string", enum: [...FIELD_KEYS] },
      value: { type: "string", description: "The value as text: dates YYYY-MM-DD, money and day counts as digits only, several names separated by '; '." },
      confidence: CONF,
      ...LOC,
    }),
  },
  addenda: { type: "array", description: "Every addendum or form in the packet, plus any addendum box checked in Para 22 that is not attached (evidence: checked_only).", items: ADDENDUM },
  documents: DOCUMENTS,
  warnings: { type: "array", items: S, description: "Anything unclear: blank fields, handwriting you could not read, conflicting values, missing initials." },
});

/** Field guide for the reader's instructions (descriptions moved out of the grammar). */
export const FIELD_GUIDE = FIELD_KEYS.map((k) => `- ${k}: ${FIELDS[k][1]}${FIELDS[k][0].enum ? ` (one of: ${(FIELDS[k][0].enum as string[]).join(", ")})` : ""}`).join("\n");

export const changesFormat = schemaOf({
  changes: {
    type: "array", description: "One entry per term the new documents change. Omit terms that are unchanged or only restated.",
    items: obj({
      key: { type: "string", enum: [...FIELD_KEYS, "option_period_end_date"], description: "Use option_period_end_date when an amendment extends the option period to a specific date." },
      value_text: { type: "string", description: "New value as text: dates YYYY-MM-DD, money as digits only (312000), day counts as digits, several names separated by '; '. Empty if the term is removed." },
      confidence: CONF, ...LOC,
    }),
  },
  addenda_added: { type: "array", items: ADDENDUM, description: "Addenda or disclosures newly added to the deal by these documents (e.g. a signed Seller's Disclosure, a new financing addendum)" },
  addenda_removed: { type: "array", items: { type: "string", enum: [...ADDENDUM_KEYS] }, description: "Addenda these documents remove or terminate" },
  documents: DOCUMENTS,
  summary: { type: "string", description: "One plain sentence: what these documents do. E.g. 'Amendment moves closing to Dec 11 and lowers the price to $312,000.'" },
  warnings: { type: "array", items: S, description: "Missing signatures or initials, unclear handwriting, terms you could not map to a field (e.g. repair lists)." },
});

export const triageFormat = schemaOf({
  documents: DOCUMENTS,
  is_new_contract: { type: "boolean", description: "True only if a main purchase contract form (e.g. TREC One to Four Family Residential Contract) is among these documents" },
  property_street: { type: "string", description: "Street address of the property exactly as written (house number and street). Empty if not readable or documents disagree." },
  property_city: { type: "string", description: "Empty if unknown" },
  property_zip: { type: "string", description: "Empty if unknown" },
  address_confidence: CONF,
  summary: { type: "string", description: "One plain sentence: what this is, e.g. 'Amendment moving closing to Dec 11'" },
});

// ---------- Wire -> app shape ----------
const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const pos = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);
const loc = (x: any) => ({
  doc: pos(x?.doc), page: pos(x?.page), quote: str(x?.quote), source: str(x?.source),
  box: Array.isArray(x?.box) && x.box.length === 4 ? x.box : null,
});
const addendum = (a: any) => ({ ...a, form_number: str(a?.form_number), doc: pos(a?.doc), page: pos(a?.page) });
const documents = (ds: any) => (Array.isArray(ds) ? ds.map((d) => ({ ...d, slot: d?.slot === "none" ? null : d?.slot })) : []);

const RANK = { high: 3, medium: 2, low: 1 } as const;
const NUMERIC = new Set(["sales_price", "financed_amount", "earnest_money", "option_fee", "option_period_days", "survey_days"]);
const LISTS = new Set(["buyers", "sellers"]);
const ENUMS = new Set(["financing_type", "seller_disclosure"]);

/** Text from the reader -> the field's own type. Bad values are rejected later by the app schema. */
export function typedValue(field: string, text: string): unknown {
  const t = text.trim();
  if (t === "") return null;
  if (LISTS.has(field)) return t.split(";").map((x) => x.trim()).filter(Boolean);
  if (NUMERIC.has(field)) { const n = Number(t.replace(/[$,\s]/g, "")); return Number.isFinite(n) ? n : t; }
  if (ENUMS.has(field)) return t.toLowerCase().replace(/[\s-]+/g, "_");
  return t;
}

export function extractionFromWire(raw: any) {
  const best = new Map<string, any>();
  for (const f of Array.isArray(raw?.fields) ? raw.fields : []) {
    if (!f || !FIELD_KEYS.includes(f.field) || typeof f.value !== "string" || f.value.trim() === "") continue;
    const prev = best.get(f.field);
    if (!prev || (RANK[f.confidence as keyof typeof RANK] ?? 0) > (RANK[prev.confidence as keyof typeof RANK] ?? 0)) best.set(f.field, f);
  }
  const out: Record<string, unknown> = {};
  for (const k of FIELD_KEYS) {
    const f = best.get(k);
    out[k] = f
      ? { value: typedValue(k, f.value), confidence: f.confidence, ...loc(f) }
      : { value: null, confidence: "low", doc: null, page: null, quote: null, box: null, source: null };
  }
  return { ...out, addenda: (raw?.addenda ?? []).map(addendum), documents: documents(raw?.documents), warnings: raw?.warnings ?? [] };
}

export function changesFromWire(raw: any) {
  const changes = (raw?.changes ?? []).map((c: any) => {
    const value = typedValue(c?.key, typeof c?.value_text === "string" ? c.value_text : "");
    return { key: c?.key, value, confidence: c?.confidence, ...loc(c) };
  });
  return { ...raw, changes, addenda_added: (raw?.addenda_added ?? []).map(addendum), documents: documents(raw?.documents) };
}

export function triageFromWire(raw: any) {
  return {
    ...raw, documents: documents(raw?.documents),
    property_street: str(raw?.property_street), property_city: str(raw?.property_city), property_zip: str(raw?.property_zip),
  };
}
