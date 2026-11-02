import { ADDENDA, DISCLOSURE_LABELS, FINANCING_LABELS, type AddendumKey, type DisclosureStatus, type FinancingType } from "@/lib/addenda";
import { daysBetween, formatDate, isValidISO, type ISODate } from "@/lib/dates";
import { FIELD_TYPES } from "@/lib/extract/schema";

// The confirmed deal terms: the transaction columns that only an agent's confirmation can write.
// Shared by the first confirm, later edits, and amendment re-reads, so all three save the same way.

export type Terms = {
  side: "buyer" | "seller" | "both" | null;
  contract_form: string | null;
  property_street: string | null; property_city: string | null; property_state: string | null;
  property_zip: string | null; property_county: string | null; legal_description: string | null;
  sales_price: number | null; financed_amount: number | null; financing_type: FinancingType | null;
  effective_date: ISODate | null; closing_date: ISODate | null;
  earnest_money: number | null; option_fee: number | null;
  option_period_days: number | null; survey_days: number | null;
  hoa_info_days: number | null;
  fin_approval_days: number | null;
  seller_disclosure: DisclosureStatus | null;
  addenda: AddendumKey[];
  /** Referenced by the contract but not in the file. null = no list confirmed yet (deals confirmed before Nov 2026). */
  missing_docs: AddendumKey[] | null;
};

type Kind = "text" | "money" | "date" | "days" | "financing" | "disclosure";
export const TERM_FIELDS: { key: Exclude<keyof Terms, "side" | "addenda" | "missing_docs">; label: string; kind: Kind }[] = [
  { key: "property_street", label: "Property address", kind: "text" },
  { key: "property_city", label: "City", kind: "text" },
  { key: "property_state", label: "State", kind: "text" },
  { key: "property_zip", label: "ZIP", kind: "text" },
  { key: "property_county", label: "County", kind: "text" },
  { key: "legal_description", label: "Legal description", kind: "text" },
  { key: "contract_form", label: "Contract form", kind: "text" },
  { key: "sales_price", label: "Sales price", kind: "money" },
  { key: "financed_amount", label: "Financed amount", kind: "money" },
  { key: "financing_type", label: "Financing", kind: "financing" },
  { key: "earnest_money", label: "Earnest money", kind: "money" },
  { key: "option_fee", label: "Option fee", kind: "money" },
  { key: "effective_date", label: "Effective date", kind: "date" },
  { key: "closing_date", label: "Closing date", kind: "date" },
  { key: "option_period_days", label: "Option period", kind: "days" },
  { key: "survey_days", label: "Survey", kind: "days" },
  { key: "hoa_info_days", label: "HOA information", kind: "days" },
  { key: "fin_approval_days", label: "Buyer approval (financing)", kind: "days" },
  { key: "seller_disclosure", label: "Seller's Disclosure", kind: "disclosure" },
];
export const TERM_KIND = Object.fromEntries(TERM_FIELDS.map((f) => [f.key, f.kind])) as Record<string, Kind>;
export const TERM_LABEL = Object.fromEntries(TERM_FIELDS.map((f) => [f.key, f.label])) as Record<string, string>;

export function termsFromTx(tx: Record<string, any>): Terms {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    side: tx.side ?? null, contract_form: tx.contract_form ?? null,
    property_street: tx.property_street ?? null, property_city: tx.property_city ?? null, property_state: tx.property_state ?? null,
    property_zip: tx.property_zip ?? null, property_county: tx.property_county ?? null, legal_description: tx.legal_description ?? null,
    sales_price: n(tx.sales_price), financed_amount: n(tx.financed_amount), financing_type: tx.financing_type ?? null,
    effective_date: tx.effective_date ?? null, closing_date: tx.closing_date ?? null,
    earnest_money: n(tx.earnest_money), option_fee: n(tx.option_fee),
    option_period_days: n(tx.option_period_days), survey_days: n(tx.survey_days), hoa_info_days: n(tx.hoa_info_days), fin_approval_days: n(tx.fin_approval_days),
    seller_disclosure: tx.seller_disclosure ?? null, addenda: (tx.addenda ?? []) as AddendumKey[],
    missing_docs: (tx.missing_docs ?? null) as AddendumKey[] | null,
  };
}

export function formatTerm(key: string, v: unknown): string {
  if (v == null || v === "") return "Blank";
  switch (TERM_KIND[key]) {
    case "money": return Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
    case "date": return formatDate(String(v));
    case "days": return `${v} day${Number(v) === 1 ? "" : "s"}`;
    case "financing": return FINANCING_LABELS[v as FinancingType] ?? String(v);
    case "disclosure": return DISCLOSURE_LABELS[v as DisclosureStatus] ?? String(v);
    default: return String(v);
  }
}

export const addendumName = (k: string) => ADDENDA[k as AddendumKey] ?? k;

/** Field-by-field differences between two sets of terms (for the audit log and the diff screen). */
export function diffTerms(before: Terms, after: Terms) {
  const fields = TERM_FIELDS
    .filter((f) => (before[f.key] ?? null) !== (after[f.key] ?? null))
    .map((f) => ({ key: f.key, label: f.label, before: before[f.key], after: after[f.key] }));
  const added = after.addenda.filter((a) => !before.addenda.includes(a));
  const removed = before.addenda.filter((a) => !after.addenda.includes(a));
  return { fields, addenda: { added, removed }, side: before.side !== after.side ? { before: before.side, after: after.side } : null };
}

export type ProposedChange = {
  key: keyof Terms; label: string; before: unknown; after: unknown;
  confidence: "high" | "medium" | "low"; loc: { doc: number | null; page: number | null; quote: string | null; box: number[] | null; source: string | null };
  note?: string;
};

/**
 * Turn the reader's raw change list into proposed term changes against the current terms.
 * Values are coerced to the right type; anything that can't be coerced becomes a note instead,
 * so a bad read never lands as a value. People changes (title company, lender) become notes.
 */
export function proposeChanges(current: Terms, raw: { key: string; value: unknown; confidence: "high" | "medium" | "low"; doc: number | null; page: number | null; quote: string | null; box: number[] | null; source: string | null }[]) {
  const proposed: ProposedChange[] = [];
  const notes: string[] = [];
  for (const c of raw) {
    const loc = { doc: c.doc, page: c.page, quote: c.quote, box: c.box, source: c.source };
    if (c.key === "option_period_end_date") {
      if (isValidISO(c.value) && current.effective_date) {
        const days = daysBetween(current.effective_date, c.value);
        if (days > 0 && days !== current.option_period_days) {
          proposed.push({ key: "option_period_days", label: "Option period", before: current.option_period_days, after: days, confidence: c.confidence, loc,
            note: `Amendment sets the option period end to ${formatDate(c.value)}` });
        }
      } else notes.push(`Option period extended to ${String(c.value)}. Add the effective date so this can be applied.`);
      continue;
    }
    if (!(c.key in TERM_LABEL)) {
      if (c.value != null) notes.push(`${c.key.replace(/_/g, " ")} changes to ${Array.isArray(c.value) ? c.value.join(", ") : String(c.value)}. Update People if needed.`);
      continue;
    }
    const parsed = (FIELD_TYPES as Record<string, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>)[c.key].safeParse(c.value);
    if (!parsed.success) { notes.push(`Couldn't read the new ${TERM_LABEL[c.key].toLowerCase()} ("${String(c.value)}"). Check the document.`); continue; }
    const key = c.key as keyof Terms;
    if ((current[key] ?? null) === parsed.data) continue;
    proposed.push({ key, label: TERM_LABEL[c.key], before: current[key], after: parsed.data, confidence: c.confidence, loc });
  }
  return { proposed, notes };
}
