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
  option_period_days: int, survey_days: int, hoa_info_days: int,
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

export const DOC_KINDS = ["contract", "amendment", "addendum", "disclosure", "notice", "other"] as const;
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
