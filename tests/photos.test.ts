import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import { photosToPdf, isPhoto } from "@/lib/photos";
import { inspectPdf } from "@/lib/extract/pdf";

const dir = __dirname + "/fixtures";
describe("photos become a scanned-style PDF", () => {
  it("one page per photo, letter size, flagged as a scan", async () => {
    const bytes = await photosToPdf([
      { bytes: new Uint8Array(fs.readFileSync(dir + "/photo1.jpg")), type: "image/jpeg" },
      { bytes: new Uint8Array(fs.readFileSync(dir + "/photo2.png")), type: "image/png" },
    ]);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    const info = await inspectPdf(bytes);
    expect(info.isScanned).toBe(true);
  });
  it("recognizes phone photo names and types", () => {
    expect(isPhoto("IMG_0042.HEIC")).toBe(true);
    expect(isPhoto("x", "image/jpeg")).toBe(true);
    expect(isPhoto("contract.pdf", "application/pdf")).toBe(false);
  });
});
