import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { fillForm, loadForm, type FieldValues } from "@/lib/forms/acroform";
import { BUNDLED_FORMS, BUNDLED_SLOT, NEVER_FILL_20_19, P22_OTHER_TEXT_FIELD, P22_SLOTS, type BundledFormId, type P22Slot } from "@/lib/forms/registry";
import { termText, type OfferTerms } from "./terms";

// Render: values go into blank fields only; then the forms are merged into one Packet:
// the contract first, then each addendum in Paragraph 22 order, then standalone uploaded forms
// in the order the agent picked them. Paragraph 22's boxes are set from what is actually in the
// Packet, so a box can never be checked for a form that isn't there (or missing for one that is).

export type UploadedFormForRender = {
  formId: string; versionId: string; displayName: string; p22Slot: P22Slot | null;
  bytes: Uint8Array; fieldMap: Record<string, { term: string } | { blank: true }>;
  fieldTypes: Record<string, string>;
};
export type PacketPart =
  | { kind: "bundled"; id: BundledFormId; title: string; revision: string }
  | { kind: "uploaded"; formId: string; versionId: string; title: string; slot: P22Slot | null };
export type Blank = { id: string; form: string; label: string };

const bundledCache = new Map<BundledFormId, Uint8Array>();
/** The official PDF, checked against its pinned fingerprint so a swapped file can never render. */
export async function bundledBytes(id: BundledFormId): Promise<Uint8Array> {
  const hit = bundledCache.get(id);
  if (hit) return hit;
  const spec = BUNDLED_FORMS[id];
  const bytes = new Uint8Array(await readFile(path.join(process.cwd(), spec.file)));
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== spec.sha256) throw new Error(`${spec.file} does not match its pinned revision (${spec.revision})`);
  bundledCache.set(id, bytes);
  return bytes;
}

/** Which forms go in the Packet, in Packet order. */
export function packetParts(t: OfferTerms, uploaded: Pick<UploadedFormForRender, "formId" | "versionId" | "displayName" | "p22Slot">[]): PacketPart[] {
  const parts: PacketPart[] = [{ kind: "bundled", id: "TREC-20-19", title: BUNDLED_FORMS["TREC-20-19"].title, revision: BUNDLED_FORMS["TREC-20-19"].revision }];
  const slotted = new Map<string, PacketPart[]>();
  for (const a of t.addenda) {
    const id = BUNDLED_SLOT[a];
    slotted.set(a, [...(slotted.get(a) ?? []), { kind: "bundled", id, title: BUNDLED_FORMS[id].title, revision: BUNDLED_FORMS[id].revision }]);
  }
  const standalone: PacketPart[] = [];
  for (const u of uploaded) {
    const part: PacketPart = { kind: "uploaded", formId: u.formId, versionId: u.versionId, title: u.displayName, slot: u.p22Slot };
    if (u.p22Slot) slotted.set(u.p22Slot, [...(slotted.get(u.p22Slot) ?? []), part]);
    else standalone.push(part);
  }
  for (const s of P22_SLOTS) parts.push(...(slotted.get(s.key) ?? []));
  return [...parts, ...standalone];
}

/** Paragraph 22 boxes from the Packet's contents. */
export function p22Values(parts: PacketPart[]): FieldValues {
  const v: FieldValues = {};
  const occupied = new Set<string>();
  const others: string[] = [];
  for (const p of parts) {
    if (p.kind === "bundled" && p.id !== "TREC-20-19") occupied.add(Object.entries(BUNDLED_SLOT).find(([, id]) => id === p.id)![0]);
    if (p.kind === "uploaded" && p.slot) { occupied.add(p.slot); if (p.slot === "other") others.push(p.title); }
  }
  for (const s of P22_SLOTS) v[s.field] = occupied.has(s.key);
  if (others.length) v[P22_OTHER_TEXT_FIELD] = others.join("; ");
  return v;
}

function isEmpty(v: unknown) { return v == null || v === "" || v === false; }

async function renderBundled(id: BundledFormId, t: OfferTerms, extra: FieldValues) {
  const spec = BUNDLED_FORMS[id];
  const pdf = await loadForm(await bundledBytes(id));
  const values: FieldValues = {};
  for (const m of spec.map) { const v = m.value(t); if (!isEmpty(v)) values[m.field] = v as string | boolean; }
  Object.assign(values, extra);
  for (const f of NEVER_FILL_20_19) if (id === "TREC-20-19" && values[f]) throw new Error(`${f} must stay blank until execution`);

  const blanks: Blank[] = [];
  for (const m of spec.map) {
    if (m.usual?.(t) && isEmpty(values[m.field])) blanks.push({ id: `${id}:${m.field}`, form: `TREC ${spec.number}`, label: m.label });
  }
  for (const g of spec.groups) {
    if (g.usual(t) && !g.fields.some((f) => values[f] === true)) blanks.push({ id: `${id}:group:${g.id}`, form: `TREC ${spec.number}`, label: g.label });
  }
  await fillForm(pdf, values);
  return { pdf, blanks, values };
}

async function renderUploaded(u: UploadedFormForRender, t: OfferTerms) {
  const pdf = await loadForm(u.bytes);
  const values: FieldValues = {};
  const blanks: Blank[] = [];
  for (const [field, m] of Object.entries(u.fieldMap)) {
    const type = u.fieldTypes[field];
    if (type === "signature") continue;
    if ("blank" in m) { blanks.push({ id: `${u.formId}:${field}`, form: u.displayName, label: field }); continue; }
    const text = termText(t, m.term);
    if (type === "check") values[field] = text !== "" && text !== "0";
    else if (text !== "") values[field] = text;
    else blanks.push({ id: `${u.formId}:${field}`, form: u.displayName, label: field });
  }
  // Only write into fields that really are blank on the uploaded form.
  const form = pdf.getForm();
  for (const name of Object.keys(values)) {
    const f = form.getFieldMaybe(name);
    if (f instanceof PDFTextField && f.getText()) delete values[name];
    if (f instanceof PDFCheckBox && f.isChecked()) delete values[name];
  }
  await fillForm(pdf, values);
  return { pdf, blanks };
}

export async function renderPacket(t: OfferTerms, uploaded: UploadedFormForRender[]) {
  const parts = packetParts(t, uploaded);
  const out = await PDFDocument.create();
  const blanks: Blank[] = [];
  const byId = new Map(uploaded.map((u) => [u.formId, u]));
  let contractValues: FieldValues = {};
  for (const p of parts) {
    const r = p.kind === "bundled"
      ? await renderBundled(p.id, t, p.id === "TREC-20-19" ? p22Values(parts) : {})
      : await renderUploaded(byId.get(p.formId)!, t);
    if (p.kind === "bundled" && p.id === "TREC-20-19") contractValues = (r as Awaited<ReturnType<typeof renderBundled>>).values;
    blanks.push(...r.blanks);
    const pages = await out.copyPages(r.pdf, r.pdf.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
  }
  out.setTitle("Offer packet");
  out.setProducer("Contract Desk");
  const bytes = await out.save();
  return { bytes, parts, blanks, contractValues };
}
