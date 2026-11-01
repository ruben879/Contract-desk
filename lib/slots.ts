import { applies, hasAddendum as has, isMissing as missing, type Conditions, type DealContext } from "@/lib/rules";

const hasOrMissing = (k: Parameters<typeof has>[0]) => (c: DealContext) => has(k)(c) || missing(k)(c);

// Labeled document slots on every deal. Same conditions as checklist tasks, so a slot appears
// only when the file needs it (an HOA slot only with the HOA addendum, and so on).
// The reader files incoming documents into these keys; an agent can move any of them.

export type SlotRule = Conditions & { key: string; label: string; many?: boolean; hint?: string };

export const SLOT_RULES: SlotRule[] = [
  { key: "contract", label: "Executed contract" },
  { key: "third_party_financing", label: "Third Party Financing Addendum", when: hasOrMissing("third_party_financing") },
  { key: "hoa_addendum", label: "HOA addendum", when: hasOrMissing("hoa") },
  { key: "lead_based_paint", label: "Lead-based paint addendum", when: hasOrMissing("lead_based_paint") },
  { key: "other_addenda", label: "Other addenda", many: true },
  { key: "sellers_disclosure", label: "Seller's Disclosure", when: (c) => c.seller_disclosure !== "not_required" },
  { key: "amendments", label: "Amendments", many: true },
  { key: "earnest_receipt", label: "Earnest money and option fee receipts", many: true },
  { key: "hoa_documents", label: "HOA documents and resale certificate", many: true, when: has("hoa") },
  { key: "inspections", label: "Inspection reports", many: true, sides: ["buyer", "both"] },
  { key: "title_commitment", label: "Title commitment" },
  { key: "survey", label: "Survey or T-47 affidavit", many: true },
  { key: "lender_documents", label: "Lender documents", many: true, when: has("third_party_financing") },
  { key: "settlement_statement", label: "Settlement statement" },
  { key: "other", label: "Other documents", many: true },
];

export const SLOT_KEYS = SLOT_RULES.map((s) => s.key);
export const SLOT_LABEL = Object.fromEntries(SLOT_RULES.map((s) => [s.key, s.label])) as Record<string, string>;

/** Slots this deal needs. Slots that hold a document always show, even if the deal no longer needs them. */
export function slotsFor(ctx: DealContext | null, filled: Set<string>) {
  return SLOT_RULES.filter((s) => filled.has(s.key) || (ctx ? applies(s, ctx) : s.key === "contract" || s.key === "other"));
}

/** Readable list for the reader's instructions. */
export const SLOT_GUIDE = SLOT_RULES.map((s) => `${s.key}: ${s.label}`).join("; ");
