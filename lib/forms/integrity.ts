import { loadForm, inventory } from "./acroform";

// Proof that Render only wrote into blanks: compare each rendered page with the official blank
// page, text item by text item. Every word the form prints must still be there, same place;
// every new word must sit inside one of the form's own fill-in fields.

type Item = { s: string; x: number; y: number };
async function pageItems(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false }).promise;
  const pages: { size: [number, number]; items: Item[] }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [, , w, h] = page.view;
    const tc = await page.getTextContent();
    pages.push({
      size: [Math.round(w), Math.round(h)],
      items: tc.items.filter((it: any) => "str" in it && it.str.trim()).map((it: any) => ({ s: it.str, x: it.transform[4], y: it.transform[5] })),
    });
  }
  await doc.destroy();
  return pages;
}

export type IntegrityReport = { ok: boolean; problems: string[]; added: number };

/** Compare `rendered` pages [offset, offset + blank pages) against the official blank form. */
export async function compareToBlank(blank: Uint8Array, rendered: Uint8Array, offset = 0): Promise<IntegrityReport> {
  const [b, r] = await Promise.all([pageItems(blank), pageItems(rendered)]);
  const fields = inventory(await loadForm(blank));
  const problems: string[] = [];
  let added = 0;
  const key = (i: Item) => `${i.s}@${Math.round(i.x * 2)}/${Math.round(i.y * 2)}`;
  b.forEach((bp, idx) => {
    const rp = r[offset + idx];
    if (!rp) { problems.push(`page ${idx + 1} missing`); return; }
    if (rp.size.join("x") !== bp.size.join("x")) problems.push(`page ${idx + 1} size changed`);
    const have = new Map<string, number>();
    rp.items.forEach((i) => have.set(key(i), (have.get(key(i)) ?? 0) + 1));
    for (const i of bp.items) {
      const k = key(i);
      if (!have.get(k)) problems.push(`page ${idx + 1}: printed text "${i.s}" moved or missing`);
      else have.set(k, have.get(k)! - 1);
    }
    const boxes = fields.filter((f) => f.page === idx + 1);
    for (const [k, n] of have) {
      if (!n) continue;
      const item = rp.items.find((i) => key(i) === k)!;
      const inside = boxes.some(({ rect: [x, y, w, h] }) => item.x >= x - 3 && item.x <= x + w + 3 && item.y >= y - 4 && item.y <= y + h + 4);
      if (!inside) problems.push(`page ${idx + 1}: added text "${item.s}" outside any blank`);
      else added += n;
    }
  });
  return { ok: problems.length === 0, problems, added };
}
