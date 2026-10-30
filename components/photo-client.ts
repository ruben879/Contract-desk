"use client";
import { photosToPdf } from "@/lib/photos";

// Browser side: decode any photo the browser can show (including iPhone HEIC in Safari),
// shrink it to a sane size, re-encode as JPEG, then bundle all photos into one PDF.
async function toJpeg(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const max = 2200;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read that photo."))), "image/jpeg", 0.82));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function photosToPdfFile(files: File[]): Promise<File> {
  const pages = [];
  for (const f of files) pages.push({ bytes: await toJpeg(f), type: "image/jpeg" });
  const bytes = await photosToPdf(pages);
  const stamp = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).replace(" ", "-");
  return new File([bytes as BlobPart], `Photos ${stamp} (${files.length} page${files.length === 1 ? "" : "s"}).pdf`, { type: "application/pdf" });
}
