import { PDFDocument } from "pdf-lib";
import { fillableFieldCount, inventory, loadForm, type FieldInfo } from "./acroform";
import { CATALOG_BY_KEY, TERM_CATALOG } from "@/lib/offer/terms";

// Form Library: blank fillable PDFs a broker adds for their own brokerage.

/** Versioned by us; not editable in the app. Stored with every acceptance. */
export const TXR_ACK_VERSION = "txr-ack-2026-11-03";
export const TXR_ACK_TEXT =
  "This form is published by Texas REALTORS (TXR). Contract Desk does not license TXR forms. By uploading it, your brokerage confirms it holds the rights to use this form in this system and accepts responsibility for that use.";

export type FieldMapEntry = { term: string } | { blank: true };
export type FieldMap = Record<string, FieldMapEntry>;

export class UploadRefused extends Error {}

/** Upload checks, in the brief's order: (a) a PDF, (b) at least one fillable field. (c) is the TXR acknowledgment, checked by the caller. */
export async function checkUpload(bytes: Uint8Array): Promise<{ fields: FieldInfo[]; pageCount: number }> {
  const head = new TextDecoder().decode(bytes.slice(0, 1024));
  if (!head.includes("%PDF-")) throw new UploadRefused("That file isn't a PDF. Upload the form as a PDF.");
  let pdf: PDFDocument;
  try { pdf = await loadForm(bytes); }
  catch { throw new UploadRefused("That PDF couldn't be opened. If it's password-protected, save an unlocked copy and upload that."); }
  if (fillableFieldCount(pdf) === 0)
    throw new UploadRefused("This PDF has no fillable fields, so it's a flat or scanned copy and can't be filled in. Upload the fillable original of the form.");
  return { fields: inventory(pdf).filter((f) => f.type !== "other"), pageCount: pdf.getPageCount() };
}

/** Fields that need a mapping decision (signatures are signed, never filled). */
export const mappable = (fields: FieldInfo[]) => fields.filter((f) => f.type === "text" || f.type === "check" || f.type === "radio");

export function mappingComplete(fields: FieldInfo[], map: FieldMap) {
  return mappable(fields).every((f) => {
    const m = map[f.name];
    return !!m && ("blank" in m || CATALOG_BY_KEY.has(m.term));
  });
}
export const unmappedCount = (fields: FieldInfo[], map: FieldMap) => mappable(fields).filter((f) => !map[f.name]).length;

/** New revision: keep decisions only for fields whose names are identical; everything else starts unmapped. */
export function carryOverMap(oldMap: FieldMap, newFields: FieldInfo[]): FieldMap {
  const names = new Set(mappable(newFields).map((f) => f.name));
  return Object.fromEntries(Object.entries(oldMap).filter(([name]) => names.has(name)));
}

const tokens = (s: string) => s.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^a-z0-9]+/).filter((t) => t.length > 1);
const SYNONYMS: Record<string, string[]> = {
  buyers: ["buyer", "buyers", "purchaser"], sellers: ["seller", "sellers"],
  property_address_line: ["property", "address", "street", "concerning"], property_city: ["city"], property_zip: ["zip"],
  property_county: ["county"], sales_price: ["sales", "price", "purchase"], earnest_money: ["earnest"],
  option_fee: ["option", "fee"], closing_date: ["closing"], title_company: ["title", "escrow"],
};
const NEVER = /sign|initial|date ?signed|^date|effective|receipt|executed/i;

/** A starting suggestion for one field. Never saved until the mapper confirms it. */
export function suggestFor(f: FieldInfo): { term: string } | { blank: true } {
  if (f.type === "signature" || NEVER.test(f.name)) return { blank: true };
  const words = new Set(tokens(f.name));
  let best: { key: string; score: number } | null = null;
  for (const c of TERM_CATALOG) {
    const cand = new Set([...tokens(c.label), ...tokens(c.key.replace("extra:", "")), ...(SYNONYMS[c.key] ?? [])]);
    const score = [...words].filter((w) => cand.has(w)).length / Math.max(1, Math.min(words.size, 4));
    if (score > (best?.score ?? 0)) best = { key: c.key, score };
  }
  return best && best.score >= 0.5 ? { term: best.key } : { blank: true };
}

/** (c) of the upload checks: a TXR-class form can't be saved without the acknowledgment. */
export function needsAcknowledgment(formClass: "TREC" | "TXR" | "Brokerage", previousClass?: "TREC" | "TXR" | "Brokerage" | null) {
  return formClass === "TXR" && previousClass !== "TXR";
}

/** Forms an agent can pick on the Terms screen: mapping complete, not archived. */
export function usableForms<F extends { archived: boolean; current: { mapping_complete: boolean } | null }>(forms: F[]) {
  return forms.filter((f) => !f.archived && f.current?.mapping_complete);
}

/**
 * Mini-fields an offer must ask for because a picked Uploaded form maps them and the Terms screen
 * doesn't already collect them. Each Term once, however many forms map it.
 */
export function miniFieldTerms(maps: FieldMap[]) {
  const keys = new Set<string>();
  for (const m of maps) for (const e of Object.values(m)) if ("term" in e && CATALOG_BY_KEY.get(e.term)?.onScreen === false) keys.add(e.term);
  return [...keys].map((k) => CATALOG_BY_KEY.get(k)!);
}
