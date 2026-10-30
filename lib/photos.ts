import { PDFDocument } from "pdf-lib";

// Photos of paper pages become a PDF (one photo per page), so storage, the reader, and the
// source viewer treat them exactly like a scanned document.

export const PHOTO_TYPES = ["image/jpeg", "image/png"];
export const isPhoto = (name: string, type?: string | null) =>
  (type && type.startsWith("image/")) || /\.(jpe?g|png|heic|heif|webp)$/i.test(name);

export async function photosToPdf(photos: { bytes: Uint8Array; type: string }[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const p of photos) {
    const img = p.type === "image/png" ? await pdf.embedPng(p.bytes) : await pdf.embedJpg(p.bytes);
    // Fit on a US Letter page at 72 dpi, keeping the photo's proportions.
    const W = 612, H = 792;
    const scale = Math.min(W / img.width, H / img.height);
    const w = img.width * scale, h = img.height * scale;
    const page = pdf.addPage([W, H]);
    page.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  }
  return pdf.save();
}
