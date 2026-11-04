import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { decodePDFRawStream, PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import {
  STANDARD_OFFER_DEFAULTS as D, applyBrokerageDefaults, computedEarnest, computedOptionFee, emptyTerms, enforceRules, normalizeDefaults, normalizeTerms, type OfferTerms,
} from "@/lib/offer/terms";
import { renderPacket, type UploadedFormForRender } from "@/lib/offer/render";
import { checkUpload, type FieldMap } from "@/lib/forms/library";
import { compareToBlank } from "@/lib/forms/integrity";
import { brookhollowTerms } from "./fixtures/brookhollow-offer";

const gurrola = (over: Partial<OfferTerms> = {}) =>
  enforceRules(applyBrokerageDefaults({ ...emptyTerms(), buyers: ["Test Gurrola"], property_street: "2131 S Loop 289", property_city: "Lubbock", property_zip: "79423", sales_price: 135000, financing_type: "cash", ...over }, D, "Example Title Co"));

describe("brokerage computations", () => {
  it("earnest money is 1% of price rounded down to $100 ($135,000 gives $1,300)", () => {
    expect(computedEarnest(135000, D)).toBe(1300);
    expect(computedEarnest(425000, D)).toBe(4200);
    expect(computedEarnest(99999, D)).toBe(900);
    expect(computedEarnest(300000, D)).toBe(3000);
  });
  it("option fee tiers: $100 up to $300,000, $150 to $400,000, $250 above", () => {
    expect(computedOptionFee(135000, D)).toBe(100);
    expect(computedOptionFee(300000, D)).toBe(100);
    expect(computedOptionFee(300001, D)).toBe(150);
    expect(computedOptionFee(400000, D)).toBe(150);
    expect(computedOptionFee(400001, D)).toBe(250);
  });
  it("a new offer starts with the standard values", () => {
    const t = gurrola();
    expect([t.earnest_money, t.option_fee, t.option_period_days, t.title_company]).toEqual([1300, 100, 10, "Example Title Co"]);
    expect([t.title_policy_payer, t.survey_option, t.survey_days, t.survey_new_payer]).toEqual(["seller", "seller_existing", 5, "buyer"]);
  });
  it("price changes move earnest and option fee until the agent edits them by hand", () => {
    let t = gurrola();
    t = applyBrokerageDefaults({ ...t, sales_price: 350000 }, D);
    expect([t.earnest_money, t.option_fee]).toEqual([3500, 150]);
    t = applyBrokerageDefaults({ ...t, earnest_money: 5000, touched: ["earnest_money"] }, D);
    t = applyBrokerageDefaults({ ...t, sales_price: 450000 }, D);
    expect([t.earnest_money, t.option_fee]).toEqual([5000, 250]);
  });
  it("a value the agent cleared stays cleared (it becomes a blank, not a recomputed number)", () => {
    const t = applyBrokerageDefaults({ ...gurrola(), option_period_days: null, title_company: null, touched: ["option_period_days", "title_company"] }, D, "Example Title Co");
    expect([t.option_period_days, t.title_company]).toEqual([null, null]);
  });
  it("offers saved before this change keep values that were already there", () => {
    const legacy = { ...emptyTerms(), sales_price: 500000, earnest_money: 10000 } as Record<string, unknown>;
    delete legacy.touched;
    const t = applyBrokerageDefaults(normalizeTerms(legacy), D);
    expect(t.earnest_money).toBe(10000);
    expect(t.option_fee).toBe(250); // was empty: filled
  });
  it("settings: missing or bad values fall back to the standard ones", () => {
    expect(normalizeDefaults(null)).toEqual(D);
    expect(normalizeDefaults({ earnest_pct: 2, option_tier3_fee: "x" })).toEqual({ ...D, earnest_pct: 2 });
    // A settings object saved before the title and survey keys existed (0010) gets Clear Rock's values for them.
    const before0011 = { earnest_pct: 1, earnest_round: 100, option_tier1_max: 300000, option_tier1_fee: 100, option_tier2_max: 400000, option_tier2_fee: 150, option_tier3_fee: 250, option_period_days: 10 };
    expect(normalizeDefaults(before0011)).toEqual(D);
    expect([D.title_policy_payer, D.survey_option, D.survey_days, D.survey_new_payer]).toEqual(["seller", "seller_existing", 5, "buyer"]);
    expect(normalizeDefaults({ title_policy_payer: "lender", survey_option: "6C1", survey_new_payer: 3 })).toEqual(D);
  });
  it("title payer and survey start from the brokerage's settings, and stay editable per offer", async () => {
    const d = normalizeDefaults({ title_policy_payer: "buyer", survey_option: "buyer_new", survey_days: 7, survey_new_payer: "seller" });
    const t = applyBrokerageDefaults({ ...emptyTerms(), sales_price: 200000 }, d);
    expect([t.title_policy_payer, t.survey_option, t.survey_days, t.survey_new_payer]).toEqual(["buyer", "buyer_new", 7, null]); // new-survey payer is only a 6C(1) question
    const { contractValues: v } = await renderPacket({ ...t, buyers: ["A B"], property_street: "1 Main St" }, []);
    expect([v["Buyers expense no later"], v["Sellers_2"], v["Within three"], v["3 days prior"]]).toEqual([true, undefined, true, "7"]);
    const edited = applyBrokerageDefaults({ ...t, title_policy_payer: "seller", survey_option: "seller_existing", survey_days: null, touched: ["title_policy_payer", "survey_option"] }, d);
    expect([edited.title_policy_payer, edited.survey_option, edited.survey_days, edited.survey_new_payer]).toEqual(["seller", "seller_existing", null, "seller"]);
  });
});

describe("the Gurrola re-export", () => {
  it("escrow agent, earnest money, option fee and option days print in Para 5, 6A Seller and 6C(1) checked", async () => {
    const { contractValues } = await renderPacket(gurrola(), []);
    expect(contractValues["undefined_6"]).toBe("Example Title Co");
    expect(contractValues["as earnest money to"]).toBe("1,300.00");
    expect(contractValues["as earnest money to 2"]).toBe("100.00");
    expect(contractValues["the Title Company and Buyers lenders Check one box only"]).toBe("10");
    expect(contractValues["Sellers_2"]).toBe(true);
    expect(contractValues["Buyers expense no later"]).toBeUndefined();
    expect(contractValues["Buyer"]).toBe(true);
    expect(contractValues["than 3 days prior to Closing Date"]).toBe("5");
    expect(contractValues["Within two"]).toBe(true);
    expect(contractValues["Within one"]).toBeUndefined();
  });
});

/** Every drawn field appearance in the rendered file: its decoded content and font names. */
function drawnAppearances(pdf: PDFDocument) {
  const out: { content: string; fonts: string[] }[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of("Subtype"))?.toString() !== "/Form") continue;
    const content = new TextDecoder("latin1").decode(decodePDFRawStream(obj).decode());
    if (!/Tj|TJ/.test(content)) continue;
    const fontDict = (obj.dict.lookupMaybe(PDFName.of("Resources"), PDFDict))?.lookupMaybe(PDFName.of("Font"), PDFDict);
    const fonts = fontDict ? fontDict.keys().map((k) => (fontDict.lookup(k) as PDFDict).get(PDFName.of("BaseFont"))?.toString() ?? "") : [];
    out.push({ content, fonts });
  }
  return out;
}

async function uploaded(): Promise<UploadedFormForRender> {
  const bytes = new Uint8Array(fs.readFileSync("forms/trec/TREC-49-1.pdf"));
  const { fields } = await checkUpload(bytes);
  const fieldMap: FieldMap = Object.fromEntries(fields.filter((f) => f.type !== "signature").map((f) => [f.name, { blank: true } as const]));
  fieldMap["Street Address and City"] = { term: "property_address_line" };
  return { formId: "f1", versionId: "v1", displayName: "Library form", p22Slot: null, bytes, fieldMap, fieldTypes: Object.fromEntries(fields.map((f) => [f.name, f.type])) };
}

/** Page content of every page, decoded, joined. */
function pageContent(pdf: PDFDocument) {
  return pdf.getPages().map((p) => {
    const c = p.node.Contents();
    const parts = c instanceof PDFArray ? c.asArray().map((r) => pdf.context.lookup(r)) : [c];
    return parts.map((st) => new TextDecoder("latin1").decode(decodePDFRawStream(st as PDFRawStream).decode())).join("\n");
  }).join("\n");
}
/** Each q...Q block that draws a field appearance: [xobject name, the operators before it]. */
function draws(content: string) {
  return [...content.matchAll(/q\s+((?:(?!\bQ\b)[\s\S])*?)\/(Flat(?:Mark|Field)[-\w]*)\s+Do\s+Q/g)].map((m) => ({ kind: m[2].startsWith("FlatMark") ? "mark" : "field", ops: m[1] }));
}
const BLUE_FILL = /0 0\.2 0\.8 rg/;

describe("fill style", () => {
  it("entered values are Helvetica Bold Oblique in #0033CC, and so are the check marks the renderer draws", async () => {
    const { bytes, contractValues } = await renderPacket(brookhollowTerms(), [await uploaded()]);
    const pdf = await PDFDocument.load(bytes);
    const text = drawnAppearances(pdf).filter((d) => !d.fonts.some((f) => /ZapfDingbats/.test(f)));
    expect(text.length).toBeGreaterThan(20);
    for (const d of text) {
      expect(d.fonts).toEqual(["/Helvetica-BoldOblique"]);
      expect(d.content).toMatch(BLUE_FILL);
    }
    // The library form's value is among them: the same offer without it draws exactly one text value fewer.
    const without = drawnAppearances(await PDFDocument.load((await renderPacket(brookhollowTerms(), [])).bytes))
      .filter((d) => !d.fonts.some((f) => /ZapfDingbats/.test(f)));
    expect(text.length).toBe(without.length + 1);

    const all = draws(pageContent(pdf));
    const marks = all.filter((d) => d.kind === "mark");
    const checkedOnContract = Object.values(contractValues).filter((v) => v === true).length;
    expect(marks.length).toBeGreaterThanOrEqual(checkedOnContract); // every box the renderer checked (contract + addenda)
    for (const m of marks) expect(m.ops).toMatch(BLUE_FILL);
  });
  it("a box the form itself came checked with is left exactly as the form draws it", async () => {
    const u = await uploaded();
    const pre = await PDFDocument.load(u.bytes);
    const box = pre.getForm().getFields().find((f) => f instanceof PDFCheckBox) as PDFCheckBox;
    const mapped = { ...u.fieldMap, [box.getName()]: { term: "sales_price" } }; // the renderer would check it too
    box.check();
    const prechecked = await pre.save();
    const count = async (bytes: Uint8Array) => {
      const d = draws(pageContent(await PDFDocument.load((await renderPacket(brookhollowTerms(), [{ ...u, bytes, fieldMap: mapped }])).bytes)));
      return { marks: d.filter((x) => x.kind === "mark").length, plain: d.filter((x) => x.kind === "field").length };
    };
    const blank = await count(u.bytes);
    const came = await count(prechecked);
    expect(came.marks).toBe(blank.marks - 1);  // the renderer didn't ink it...
    expect(came.plain).toBe(blank.plain + 1);  // ...it was drawn as the form had it, without the blue
  });
  it("a value too long for its blank prints smaller instead of being cut off", async () => {
    const long = "Stewart Title Guaranty Company of West Texas, Lubbock Office";
    const { bytes } = await renderPacket(gurrola({ title_company: long, touched: ["title_company"] }), []);
    const pdf = await PDFDocument.load(bytes);
    const hex = Buffer.from(long).toString("hex").toUpperCase();
    const drawn = drawnAppearances(pdf).filter((d) => d.content.toUpperCase().includes(hex));
    expect(drawn.length).toBeGreaterThan(0);
    for (const d of drawn) {
      const size = Number(d.content.match(/([\d.]+) Tf/)![1]);
      expect(size).toBeLessThan(9);
      expect(size).toBeGreaterThanOrEqual(6);
    }
  });
  it("the form itself is unchanged: printed text and positions match the blank 20-19", async () => {
    const { bytes } = await renderPacket(gurrola(), []);
    const blank = new Uint8Array(fs.readFileSync("forms/trec/TREC-20-19.pdf"));
    const r = await compareToBlank(blank, bytes, 0);
    expect(r.problems).toEqual([]);
  }, 30_000);
});
