import {
  concatTransformationMatrix, drawObject, PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRadioGroup, PDFRef,
  PDFStream, PDFTextField, popGraphicsState, pushGraphicsState, StandardFonts,
} from "pdf-lib";

// Low-level form handling. Render writes values into a form's existing blank (AcroForm) fields
// and nothing else: no text, layout, or page changes (TAC §537.11(h)).

export type FieldType = "text" | "check" | "radio" | "signature" | "other";
export type FieldInfo = {
  name: string; type: FieldType; page: number;
  rect: [number, number, number, number]; // x, y, width, height in PDF points
  maxLength?: number | null; options?: string[];
};

/**
 * Some official PDFs (the fillable 20-19, rev 05-04-2026) list their fields in /AcroForm/Fields
 * as objects that are NOT the widgets drawn on the pages, so values written through the field
 * list never show. Point the field list at the widgets actually on the pages. Internal wiring only;
 * nothing drawn on any page changes.
 */
export function wireFieldsToPages(pdf: PDFDocument) {
  const acro = pdf.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (!acro) return;
  const roots: PDFRef[] = [];
  const seen = new Set<string>();
  for (const page of pdf.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      let ref = annots.get(i) as PDFRef;
      let dict = pdf.context.lookup(ref) as PDFDict;
      if (dict?.get(PDFName.of("Subtype"))?.toString() !== "/Widget") continue;
      while (dict.get(PDFName.of("Parent"))) { ref = dict.get(PDFName.of("Parent")) as PDFRef; dict = pdf.context.lookup(ref) as PDFDict; }
      if (!seen.has(ref.toString())) { seen.add(ref.toString()); roots.push(ref); }
    }
  }
  acro.set(PDFName.of("Fields"), pdf.context.obj(roots));
}

export async function loadForm(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  wireFieldsToPages(pdf);
  return pdf;
}

/** Every fillable field, with its page and box. Used for the registry check and the Form Library mapper. */
export function inventory(pdf: PDFDocument): FieldInfo[] {
  const pageOf = new Map<PDFDict, number>();
  pdf.getPages().forEach((p, i) => {
    const annots = p.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    for (let k = 0; k < (annots?.size() ?? 0); k++) pageOf.set(pdf.context.lookup(annots!.get(k)) as PDFDict, i + 1);
  });
  const out: FieldInfo[] = [];
  for (const f of pdf.getForm().getFields()) {
    const type: FieldType = f instanceof PDFTextField ? "text" : f instanceof PDFCheckBox ? "check" : f instanceof PDFRadioGroup ? "radio"
      : f.constructor.name === "PDFSignature" ? "signature" : "other";
    const w = f.acroField.getWidgets()[0];
    const r = w?.getRectangle() ?? { x: 0, y: 0, width: 0, height: 0 };
    out.push({
      name: f.getName(), type, page: w ? pageOf.get(w.dict) ?? 0 : 0,
      rect: [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10) as FieldInfo["rect"],
      ...(type === "text" ? { maxLength: (f as PDFTextField).getMaxLength() ?? null } : {}),
      ...(type === "radio" ? { options: (f as PDFRadioGroup).getOptions() } : {}),
    });
  }
  return out;
}

export function fillableFieldCount(pdf: PDFDocument) {
  return pdf.getForm().getFields().filter((f) => f instanceof PDFTextField || f instanceof PDFCheckBox || f instanceof PDFRadioGroup).length;
}

export type FieldValues = Record<string, string | boolean>;

/**
 * Write values into blank fields, then flatten so the packet is one plain PDF that any signing
 * system accepts (and fields from different forms can't collide). Flattening draws each field's
 * value where the field was; the form's own text and drawing are untouched.
 * Returns the names actually written, for the audit of what was filled.
 */
export async function fillForm(pdf: PDFDocument, values: FieldValues) {
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const written: string[] = [];
  for (const [name, v] of Object.entries(values)) {
    if (v === "" || v === false || v == null) continue;
    const f = form.getFieldMaybe(name);
    if (!f) throw new Error(`Field "${name}" is not on this form`);
    if (f instanceof PDFTextField) {
      const max = f.getMaxLength();
      const text = String(v);
      if (max && text.length > max) throw new Error(`"${text}" is longer than field "${name}" allows (${max})`);
      f.setText(text);
    } else if (f instanceof PDFCheckBox) {
      if (v === true) f.check();
    } else if (f instanceof PDFRadioGroup) {
      f.select(String(v));
    } else continue;
    written.push(name);
  }
  form.updateFieldAppearances(font);
  flattenFields(pdf);
  return written;
}

/**
 * Draw each field's current appearance onto its page, then remove the fields.
 * (pdf-lib's own flatten mishandles checkboxes: it points at the on/off appearance dictionary
 * instead of the appearance for the box's state, so checked boxes vanish and strict readers
 * report "XObject is wrong type".) Unchecked boxes and empty text draw nothing.
 */
export function flattenFields(pdf: PDFDocument) {
  const ctx = pdf.context;
  for (const page of pdf.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    const keep: PDFRef[] = [];
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i) as PDFRef;
      const w = ctx.lookup(ref) as PDFDict;
      if (w?.get(PDFName.of("Subtype"))?.toString() !== "/Widget") { keep.push(ref); continue; }
      // Only filled fields are drawn: a checked box, or text with a value. Empty fields and unchecked
      // boxes draw nothing, so the page shows exactly the printed form there.
      const fieldDict = (() => { let d = w; while (!d.get(PDFName.of("FT")) && d.get(PDFName.of("Parent"))) d = ctx.lookup(d.get(PDFName.of("Parent"))!) as PDFDict; return d; })();
      const ft = fieldDict.get(PDFName.of("FT"))?.toString();
      const as = w.get(PDFName.of("AS"))?.toString();
      if (ft === "/Btn" && (!as || as === "/Off")) continue;
      if (ft === "/Tx") { const v = fieldDict.lookup(PDFName.of("V")); if (!v || v.toString() === "()" || v.toString() === "<>") continue; }
      if (ft === "/Sig") continue;
      const ap = w.lookupMaybe(PDFName.of("AP"), PDFDict);
      let normalRef = ap?.get(PDFName.of("N"));
      const normal = normalRef ? ctx.lookup(normalRef) : undefined;
      if (normal instanceof PDFDict && !(normal instanceof PDFStream)) {
        const state = w.get(PDFName.of("AS"));
        normalRef = state ? normal.get(state as PDFName) : undefined; // e.g. /On, or nothing for /Off
      }
      const stream = normalRef ? ctx.lookup(normalRef) : undefined;
      if (!(stream instanceof PDFStream) || !(normalRef instanceof PDFRef)) continue;
      const rect = (w.lookup(PDFName.of("Rect"), PDFArray)).asArray().map((n) => (n as PDFNumber).asNumber());
      const [rx1, ry1, rx2, ry2] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])];
      const bbox = stream.dict.lookupMaybe(PDFName.of("BBox"), PDFArray)?.asArray().map((n) => (n as PDFNumber).asNumber()) ?? [0, 0, rx2 - rx1, ry2 - ry1];
      const [bx1, by1, bx2, by2] = bbox;
      const sx = bx2 - bx1 ? (rx2 - rx1) / (bx2 - bx1) : 1;
      const sy = by2 - by1 ? (ry2 - ry1) / (by2 - by1) : 1;
      const name = page.node.newXObject("FlatField", normalRef);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, rx1 - bx1 * sx, ry1 - by1 * sy), drawObject(name), popGraphicsState());
    }
    if (keep.length) page.node.set(PDFName.of("Annots"), ctx.obj(keep)); else page.node.delete(PDFName.of("Annots"));
  }
  const acro = pdf.catalog.lookupMaybe(PDFName.of("AcroForm"), PDFDict);
  if (acro) pdf.catalog.delete(PDFName.of("AcroForm"));
}
