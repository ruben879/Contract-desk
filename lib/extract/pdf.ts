import { extractText, getDocumentProxy } from "unpdf";

export type PdfInfo = { pageCount: number; text: string; isScanned: boolean };

// A PDF counts as a scan when most pages have almost no text layer.
// Scanned pages are still read: the model receives the PDF pages as images and does the OCR.
const MIN_CHARS_PER_PAGE = 200;

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const textPages = pages.filter((p) => p.replace(/\s+/g, "").length >= MIN_CHARS_PER_PAGE).length;
  return {
    pageCount: totalPages,
    text: pages.map((p, i) => `--- page ${i + 1} ---\n${p}`).join("\n"),
    isScanned: textPages < Math.ceil(totalPages / 2),
  };
}
