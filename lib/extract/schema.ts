import { z } from "zod";
import { ADDENDUM_KEYS, DISCLOSURE_STATUSES, FINANCING_TYPES } from "@/lib/addenda";
import { SLOT_KEYS } from "@/lib/slots";

// Every extracted value carries WHERE it came from: which document, which page, the exact
// words on that page, and an approximate box. The review screen uses this to highlight
// the spot in the PDF next to each field.

const confidence = z.enum(["high", "medium", "low"]).catch("low");
const box = z.tuple([z.number(), z.number(), z.number(), z.number()])
  .refine((b) => b.every((n) => n >= 0 && n <= 1) && b[2] > b[0] && b[3] > b[1])
  .nullable().catch(null);

export const Location = z.object({
  doc: z.number().int().min(1).nullable().catch(null),   // 1-based, in the order documents were sent
  page: z.number().int().min(1).nullable().catch(null),  // 1-based page within that document
  quote: z.string().nullable().catch(null),              // verbatim text on the page that holds the value
  box,                                                   // [x0, y0, x1, y1], 0-1, top-left origin, approximate
  source: z.string().nullable().catch(null),             // paragraph reference, e.g. "Para 5B"
});
export type SourceLocation = z.infer<typeof Location>;

const EMPTY = { value: null, confidence: "low", doc: null, page: null, quote: null, box: null, source: null } as const;
const field = <T extends z.ZodTypeAny>(value: T) =>
  Location.extend({ value: value.nullable().catch(null), confidence }).catch(EMPTY as never);

const str = z.string();
const num = z.coerce.number();
const int = z.coerce.number().int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Field key -> value type. Shared by the first read and amendment re-reads. */
export const FIELD_TYPES = {
  contract_form: str,
  buyers: z.array(str),
  sellers: z.array(str),
  property_street: str, property_city: str, property_state: str, property_zip: str, property_county: str,
  legal_description: str,
  sales_price: num, financed_amount: num,
  financing_type: z.enum(FINANCING_TYPES),
  effective_date: isoDate, closing_date: isoDate,
  earnest_money: num, option_fee: num,
  option_period_days: int, survey_days: int,
  seller_disclosure: z.enum(DISCLOSURE_STATUSES),
  title_company: str, escrow_officer: str,
  listing_broker_firm: str, listing_broker_license: str,
  listing_agent_name: str, listing_agent_license: str, listing_agent_email: str, listing_agent_phone: str,
  buyer_broker_firm: str, buyer_broker_license: str,
  buyer_agent_name: str, buyer_agent_license: str, buyer_agent_email: str, buyer_agent_phone: str,
  lender_name: str,
} as const;
export type FieldKey = keyof typeof FIELD_TYPES;
export const FIELD_KEYS = Object.keys(FIELD_TYPES) as FieldKey[];

const DOC_KINDS = ["contract", "amendment", "addendum", "disclosure", "notice", "other"] as const;
const Addendum = z.object({
  key: z.enum(ADDENDUM_KEYS as [string, ...string[]]).catch("other"),
  name: z.string().catch(""),
  form_number: z.string().nullable().catch(null),
  doc: z.number().int().nullable().catch(null),
  page: z.number().int().nullable().catch(null),
  evidence: z.enum(["attached", "checked_only"]).catch("attached"),
});
const DocKind = z.object({
  doc: z.number().int(), kind: z.enum(DOC_KINDS).catch("other"), name: z.string().catch(""),
  slot: z.enum(SLOT_KEYS as [string, ...string[]]).nullable().catch(null),
});

type Values = { [K in FieldKey]: z.infer<(typeof FIELD_TYPES)[K]> };
export type ExtractedField<T> = SourceLocation & { value: T | null; confidence: "high" | "medium" | "low" };
export type Extraction = { [K in FieldKey]: ExtractedField<Values[K]> } & {
  addenda: z.infer<typeof Addendum>[];
  documents: z.infer<typeof DocKind>[];
  warnings: string[];
};

export const ExtractionSchema = z.object({
  ...Object.fromEntries(FIELD_KEYS.map((k) => [k, field(FIELD_TYPES[k] as z.ZodTypeAny)])),
  addenda: z.array(Addendum).catch([]),
  documents: z.array(DocKind).catch([]),
  warnings: z.array(z.string()).catch([]),
}) as unknown as z.ZodType<Extraction>;

// ---------- Amendment re-read: only what changed ----------
export const ChangeSchema = z.object({
  changes: z.array(Location.extend({
    key: z.enum([...FIELD_KEYS, "option_period_end_date"] as unknown as [string, ...string[]]),
    value: z.unknown(),
    confidence,
  })).catch([]),
  addenda_added: z.array(Addendum).catch([]),
  addenda_removed: z.array(z.enum(ADDENDUM_KEYS as [string, ...string[]])).catch([]),
  documents: z.array(DocKind).catch([]),
  summary: z.string().catch(""),
  warnings: z.array(z.string()).catch([]),
});
export type ChangeResult = z.infer<typeof ChangeSchema>;

// ---------- JSON schemas for the tool calls ----------
const LOC_PROPS = {
  doc: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Document number (1-based, as labeled)" },
  page: { anyOf: [{ type: "integer" }, { type: "null" }], description: "Page within that document (1-based)" },
  quote: { anyOf: [{ type: "string" }, { type: "null" }], description: "Exact words copied from the page that contain the value, 3 to 12 words, verbatim including punctuation" },
  box: { anyOf: [{ type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 }, { type: "null" }], description: "Approximate region of the value on the page: [left, top, right, bottom] as fractions 0-1 of page width/height, origin top-left" },
  source: { anyOf: [{ type: "string" }, { type: "null" }], description: "Paragraph reference, e.g. 'Para 5B'" },
};
const LOC_REQ = ["doc", "page", "quote", "box", "source"];

const fieldJson = (type: object, description: string) => ({
  type: "object",
  description,
  properties: { value: { anyOf: [type, { type: "null" }] }, confidence: { type: "string", enum: ["high", "medium", "low"] }, ...LOC_PROPS },
  required: ["value", "confidence", ...LOC_REQ],
});
const S = { type: "string" }, N = { type: "number" }, I = { type: "integer" }, D = { type: "string", description: "YYYY-MM-DD" };
const A = { type: "array", items: { type: "string" } };

const FIELD_DESCRIPTIONS: Record<FieldKey, [object, string]> = {
  contract_form: [S, "Main contract form name and number, e.g. 'TREC One to Four Family Residential Contract (Resale) 20-18'"],
  buyers: [A, "Buyer names exactly as written"],
  sellers: [A, "Seller names exactly as written"],
  property_street: [S, "Street address"], property_city: [S, "City"], property_state: [S, "Two-letter state"],
  property_zip: [S, "ZIP code"], property_county: [S, "County"],
  legal_description: [S, "Lot, block, addition / legal description"],
  sales_price: [N, "Total sales price (Para 3C)"], financed_amount: [N, "Sum of financing (Para 3B)"],
  financing_type: [{ type: "string", enum: [...FINANCING_TYPES] }, "Cash if no financing; otherwise loan type from the financing addendum"],
  effective_date: [D, "Effective date filled in by the broker on the execution page. Null if blank."],
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

const addendumJson = {
  type: "object",
  properties: {
    key: { type: "string", enum: [...ADDENDUM_KEYS] }, name: { type: "string" },
    form_number: { anyOf: [{ type: "string" }, { type: "null" }] },
    doc: { anyOf: [{ type: "integer" }, { type: "null" }] }, page: { anyOf: [{ type: "integer" }, { type: "null" }] },
    evidence: { type: "string", enum: ["attached", "checked_only"] },
  },
  required: ["key", "name", "form_number", "doc", "page", "evidence"],
};
const documentsJson = {
  type: "array",
  description: "One entry per document sent: what it is.",
  items: {
    type: "object",
    properties: {
      doc: { type: "integer" }, kind: { type: "string", enum: [...DOC_KINDS] }, name: { type: "string" },
      slot: { anyOf: [{ type: "string", enum: SLOT_KEYS }, { type: "null" }], description: "Which file slot this document belongs in" },
    },
    required: ["doc", "kind", "name", "slot"],
  },
};

export const extractionTool = {
  name: "record_contract",
  description: "Record every transaction detail found in this Texas real estate contract packet.",
  input_schema: {
    type: "object" as const,
    properties: {
      ...Object.fromEntries(FIELD_KEYS.map((k) => [k, fieldJson(FIELD_DESCRIPTIONS[k][0], FIELD_DESCRIPTIONS[k][1])])),
      addenda: { type: "array", description: "Every addendum or form in the packet, plus any addendum box checked in Para 22 that is not attached (evidence: checked_only).", items: addendumJson },
      documents: documentsJson,
      warnings: { type: "array", items: { type: "string" }, description: "Anything unclear: blank fields, handwriting you could not read, conflicting values, missing initials." },
    },
    required: [...FIELD_KEYS, "addenda", "documents", "warnings"],
  },
};

export const changesTool = {
  name: "record_changes",
  description: "Record how the NEW documents change the deal's current confirmed terms. Report only real changes.",
  input_schema: {
    type: "object" as const,
    properties: {
      changes: {
        type: "array",
        description: "One entry per term the new documents change. Omit terms that are unchanged or only restated.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: [...FIELD_KEYS, "option_period_end_date"], description: "Use option_period_end_date (YYYY-MM-DD) when an amendment extends the option period to a specific date." },
            value: { anyOf: [S, N, A, { type: "null" }], description: "New value: dates YYYY-MM-DD, money as numbers, names as an array" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            ...LOC_PROPS,
          },
          required: ["key", "value", "confidence", ...LOC_REQ],
        },
      },
      addenda_added: { type: "array", items: addendumJson, description: "Addenda or disclosures newly added to the deal by these documents (e.g. a signed Seller's Disclosure, a new financing addendum)" },
      addenda_removed: { type: "array", items: { type: "string", enum: [...ADDENDUM_KEYS] }, description: "Addenda these documents remove or terminate" },
      documents: documentsJson,
      summary: { type: "string", description: "One plain sentence: what these documents do. E.g. 'Amendment moves closing to Dec 11 and lowers the price to $312,000.'" },
      warnings: { type: "array", items: { type: "string" }, description: "Missing signatures or initials, unclear handwriting, terms you could not map to a field (e.g. repair lists)." },
    },
    required: ["changes", "addenda_added", "addenda_removed", "documents", "summary", "warnings"],
  },
};

// ---------- Triage: what arrived by email, and which property is it for ----------
export const TriageSchema = z.object({
  documents: z.array(DocKind).catch([]),
  is_new_contract: z.boolean().catch(false),
  property_street: z.string().nullable().catch(null),
  property_city: z.string().nullable().catch(null),
  property_zip: z.string().nullable().catch(null),
  address_confidence: confidence,
  summary: z.string().catch(""),
});
export type Triage = z.infer<typeof TriageSchema>;

export const triageTool = {
  name: "triage_documents",
  description: "Identify what these emailed real estate documents are and which property they concern.",
  input_schema: {
    type: "object" as const,
    properties: {
      documents: documentsJson,
      is_new_contract: { type: "boolean", description: "True only if a main purchase contract form (e.g. TREC One to Four Family Residential Contract) is among these documents" },
      property_street: { anyOf: [S, { type: "null" }], description: "Street address of the property, exactly as written (house number and street)" },
      property_city: { anyOf: [S, { type: "null" }] },
      property_zip: { anyOf: [S, { type: "null" }] },
      address_confidence: { type: "string", enum: ["high", "medium", "low"] },
      summary: { type: "string", description: "One plain sentence: what this is, e.g. 'Amendment moving closing to Dec 11'" },
    },
    required: ["documents", "is_new_contract", "property_street", "property_city", "property_zip", "address_confidence", "summary"],
  },
};
