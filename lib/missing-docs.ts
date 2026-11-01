import { ADDENDA, type AddendumKey } from "@/lib/addenda";

// Documents the contract refers to that aren't in the file: an addendum checked in Para 22
// but not attached, or a Seller's Disclosure the contract says the buyer received with no copy
// attached. The reader already notices these; this turns what it noticed into a list the agent
// confirms, and the checklist turns each confirmed item into a "get this in the file" task.

/** Forms that can be missing. Amendments and "other" are too vague to chase. */
export const MISSING_DOC_KEYS: AddendumKey[] = (Object.keys(ADDENDA) as AddendumKey[]).filter((k) => k !== "amendment" && k !== "other");

/** Which document slot the missing document goes into once it arrives. */
export const MISSING_DOC_SLOT: Partial<Record<AddendumKey, string>> = {
  third_party_financing: "third_party_financing",
  hoa: "hoa_addendum",
  lead_based_paint: "lead_based_paint",
  sellers_disclosure: "sellers_disclosure",
};
export const slotForMissing = (k: AddendumKey) => MISSING_DOC_SLOT[k] ?? "other_addenda";

/** Why the app thinks it's missing, in plain words. */
export const missingReason = (k: AddendumKey) =>
  k === "sellers_disclosure"
    ? "Para 7B says the buyer received it, but no copy is in the file"
    : "Checked in Para 22 but not attached";

type ReadLike = {
  addenda: { key: string; evidence: "attached" | "checked_only" }[];
  documents: { kind: string; slot: string | null }[];
  seller_disclosure: { value: string | null };
};

/** What the reader saw that's referenced but missing. Pure, so it's tested. */
export function deriveMissingDocs(ex: ReadLike | null): AddendumKey[] {
  if (!ex) return [];
  const attached = new Set(ex.addenda.filter((a) => a.evidence === "attached").map((a) => a.key));
  const out = new Set<AddendumKey>();
  for (const a of ex.addenda) {
    const k = a.key as AddendumKey;
    if (a.evidence === "checked_only" && MISSING_DOC_KEYS.includes(k) && !attached.has(k)) out.add(k);
  }
  const disclosureInFile = attached.has("sellers_disclosure") || ex.documents.some((d) => d.slot === "sellers_disclosure");
  if (ex.seller_disclosure.value === "received" && !disclosureInFile) out.add("sellers_disclosure");
  return MISSING_DOC_KEYS.filter((k) => out.has(k));
}

/** Missing documents that still need chasing: confirmed missing and not attached since. */
export const stillMissing = (missing: readonly string[] | null | undefined, addenda: readonly string[]) =>
  (missing ?? []).filter((k) => !addenda.includes(k)) as AddendumKey[];
