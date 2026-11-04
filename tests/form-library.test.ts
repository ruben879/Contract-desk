import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { photosToPdf } from "@/lib/photos";
import { checkUpload, carryOverMap, mappingComplete, miniFieldTerms, needsAcknowledgment, suggestFor, UploadRefused, unmappedCount, usableForms, TXR_ACK_TEXT, type FieldMap } from "@/lib/forms/library";
import { packetParts, p22Values, renderPacket, type UploadedFormForRender } from "@/lib/offer/render";
import { P22_SLOTS } from "@/lib/forms/registry";
import { brookhollowTerms } from "./fixtures/brookhollow-offer";

const fillable = () => new Uint8Array(fs.readFileSync("forms/trec/TREC-49-1.pdf"));
const scanned = async () => photosToPdf([{ bytes: new Uint8Array(fs.readFileSync("tests/fixtures/photo1.jpg")), type: "image/jpeg" }]);

describe("upload checks", () => {
  it("a flat scanned PDF is refused with the fillable-original message", async () => {
    const err = await checkUpload(await scanned()).catch((e) => e);
    expect(err).toBeInstanceOf(UploadRefused);
    expect(err.message).toMatch(/no fillable fields.*fillable original/);
  });
  it("a non-PDF is refused", async () => {
    await expect(checkUpload(new TextEncoder().encode("hello"))).rejects.toThrow(/isn't a PDF/);
  });
  it("a fillable PDF is accepted, with its fields listed", async () => {
    const { fields, pageCount } = await checkUpload(fillable());
    expect(pageCount).toBe(1);
    expect(fields.length).toBe(11);
  });
  it("TXR needs the acknowledgment on upload and whenever the class becomes TXR", () => {
    expect(needsAcknowledgment("TXR")).toBe(true);
    expect(needsAcknowledgment("TXR", "Brokerage")).toBe(true);
    expect(needsAcknowledgment("TXR", "TXR")).toBe(false);
    expect(needsAcknowledgment("Brokerage")).toBe(false);
    expect(TXR_ACK_TEXT).toBe("This form is published by Texas REALTORS (TXR). Contract Desk does not license TXR forms. By uploading it, your brokerage confirms it holds the rights to use this form in this system and accepts responsibility for that use.");
  });
});

describe("mapping", () => {
  it("a form with any field neither mapped nor marked blank is not offered", async () => {
    const { fields } = await checkUpload(fillable());
    const partial: FieldMap = { "Street Address and City": { term: "property_address_line" } };
    expect(mappingComplete(fields, partial)).toBe(false);
    expect(unmappedCount(fields, partial)).toBe(6);
    const full: FieldMap = Object.fromEntries(fields.filter((f) => f.type !== "signature").map((f) => [f.name, { blank: true } as const]));
    expect(mappingComplete(fields, full)).toBe(true);
    const forms = [
      { id: "a", archived: false, current: { mapping_complete: false } },
      { id: "b", archived: false, current: { mapping_complete: true } },
      { id: "c", archived: true, current: { mapping_complete: true } },
    ];
    expect(usableForms(forms).map((f) => f.id)).toEqual(["b"]);
  });
  it("suggestions are only suggestions, and signatures suggest leave blank", async () => {
    const { fields } = await checkUpload(fillable());
    expect(suggestFor(fields.find((f) => f.name === "Street Address and City")!)).toEqual({ term: "property_address_line" });
    expect(suggestFor({ name: "Buyer Signature", type: "text", page: 1, rect: [0, 0, 0, 0] })).toEqual({ blank: true });
  });
  it("a new revision keeps decisions only for identical field names", () => {
    const oldMap: FieldMap = { "Street Address and City": { term: "property_address_line" }, "Old Name": { blank: true } };
    const newFields = [
      { name: "Street Address and City", type: "text" as const, page: 1, rect: [0, 0, 1, 1] as [number, number, number, number] },
      { name: "Renamed Field", type: "text" as const, page: 1, rect: [0, 0, 1, 1] as [number, number, number, number] },
    ];
    const carried = carryOverMap(oldMap, newFields);
    expect(carried).toEqual({ "Street Address and City": { term: "property_address_line" } });
    expect(mappingComplete(newFields, carried)).toBe(false);
  });
});

async function uploadedForm(over: Partial<UploadedFormForRender> = {}): Promise<UploadedFormForRender> {
  const { fields } = await checkUpload(fillable());
  const fieldMap: FieldMap = Object.fromEntries(fields.filter((f) => f.type !== "signature").map((f) => [f.name, { blank: true } as const]));
  fieldMap["Street Address and City"] = { term: "property_address_line" };
  fieldMap["than"] = { term: "sales_price" };
  return {
    formId: "f1", versionId: "v1", displayName: "Our Brokerage Form", p22Slot: null, bytes: fillable(), fieldMap,
    fieldTypes: Object.fromEntries(fields.map((f) => [f.name, f.type])), ...over,
  };
}

describe("uploaded forms in the Packet", () => {
  it("a Term entered once fills every form that maps it", async () => {
    const r = await renderPacket(brookhollowTerms(), [await uploadedForm()]);
    expect(r.contractValues["undefined_5"]).toBe("425,000.00");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(r.bytes) }).promise;
    const last = await doc.getPage(doc.numPages);
    const text = (await last.getTextContent()).items.map((i: any) => i.str).join(" ");
    expect(text).toContain("425,000.00");
    expect(text).toContain("17 W Brookhollow Dr");
  }, 60_000);
  it("no Term is asked twice: mini-fields are only for Terms the screen doesn't collect, deduplicated", () => {
    const a: FieldMap = { x: { term: "sales_price" }, y: { term: "extra:repairs" } };
    const b: FieldMap = { z: { term: "extra:repairs" }, w: { term: "extra:seller_concession" } };
    expect(miniFieldTerms([a, b]).map((c) => c.key)).toEqual(["extra:repairs", "extra:seller_concession"]);
  });
  it("a form assigned to a Paragraph 22 slot is in the Packet exactly when its box is checked", async () => {
    const slot = P22_SLOTS.find((s) => s.key === "sale_of_other_property")!;
    const u = await uploadedForm({ p22Slot: "sale_of_other_property" });
    const withIt = packetParts(brookhollowTerms(), [u]);
    expect(withIt.some((p) => p.kind === "uploaded")).toBe(true);
    expect(p22Values(withIt)[slot.field]).toBe(true);
    const without = packetParts(brookhollowTerms(), []);
    expect(p22Values(without)[slot.field]).toBe(false);
    // Packet order: Paragraph 22 order (Sale of Other Property comes before HOA)
    expect(withIt.map((p) => p.title)).toEqual([
      "One to Four Family Residential Contract (Resale)", "Our Brokerage Form",
      "Addendum for Property Subject to Mandatory Membership in a Property Owners Association",
    ]);
  });
  it("an unassigned uploaded form goes at the end, in pick order", async () => {
    const a = await uploadedForm({ formId: "a", displayName: "First pick" });
    const b = await uploadedForm({ formId: "b", displayName: "Second pick" });
    expect(packetParts(brookhollowTerms(), [a, b]).slice(-2).map((p) => p.title)).toEqual(["First pick", "Second pick"]);
  });
});
