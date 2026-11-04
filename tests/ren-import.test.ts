import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { applyRenImport, IMPORT_KEYS, ImportRefused, parseRenImport, splitLegal, TERMS_WITHOUT_IMPORT_KEY } from "@/lib/offer/ren-import";
import { applyBrokerageDefaults, emptyTerms, enforceRules, normalizeTerms, STANDARD_OFFER_DEFAULTS as D, type OfferTerms } from "@/lib/offer/terms";
import { renderPacket } from "@/lib/offer/render";
import { freshOffer, gurrolaFile } from "./fixtures/gurrola";

const settle = (t: OfferTerms) => enforceRules(applyBrokerageDefaults(t, D, "Brokerage Default Title"));
const importInto = (t: OfferTerms, file = gurrolaFile()) => settle(applyRenImport(t, parseRenImport(file), "Offer_Import_2131_S_Loop_289.json"));

describe("Ren import: the Gurrola example into a fresh offer", () => {
  const t = importInto(freshOffer());
  it("reproduces the staged terms exactly", () => {
    expect(t.sellers).toEqual(["Estate of Karl Sheridan Morris"]);
    expect(t.buyers).toEqual(["Eduardo Gurrola"]);
    expect([t.property_street, t.property_city, t.property_zip, t.property_county]).toEqual(["2131 S Loop 289", "Lubbock", "79423", "Lubbock"]);
    expect([t.lot, t.block, t.subdivision, t.year_built]).toEqual(["377", null, "Beverly Heights", 1959]);
    expect(t.title_company).toBe("True Title");
    expect([t.sales_price, t.financing_type, t.financed_amount]).toEqual([135000, "conventional", 108000]);
    expect(t.sales_price! - t.financed_amount!).toBe(27000);
    expect([t.loan_rate_cap, t.loan_term_years, t.fin_approval_days]).toEqual([7.75, 30, 15]);
    expect(t.addenda).toEqual(["third_party_financing", "lead_based_paint", "appraisal_termination"]);
    expect([t.appraisal_option, t.appraisal_days, t.appraisal_value]).toEqual(["additional_right", 30, 135000]);
    expect(t.closing_date).toBe("2026-12-08");
    expect([t.earnest_money, t.option_fee, t.option_period_days]).toEqual([1300, 100, 10]);
    expect([t.title_policy_payer, t.survey_option, t.survey_days, t.survey_new_payer]).toEqual(["seller", "seller_existing", 5, "buyer"]);
    expect([t.listing_agent_name, t.listing_broker_firm, t.listing_broker_license, t.listing_agent_email, t.listing_agent_phone])
      .toEqual(["Stuart Bartley", "Taylor Reid Realty", "9010699", "stuart@lindseybartleyteam.com", "806-543-6877"]);
    expect([t.buyer_notice_email, t.buyer_notice_phone]).toEqual(["e722727@gmail.com", "806-496-5167"]);
    expect([t.buyer_broker_comp_type, t.buyer_broker_comp_value]).toEqual(["percent", 3]);
  });
  it("records the import: prepared date and MLS number for the Terms screen line", () => {
    expect(t.imported).toMatchObject({ kind: "ren", prepared: "2026-11-04", mls_number: "202614455", kept: [], unknown: [], problems: [] });
    expect(t.imported!.unused).toEqual(expect.arrayContaining(["source.notes", "terms.title_company_address", "financing_addendum.origination_cap_pct", "listing_side.brokerage_phone"]));
  });
  it("imported values are hand-entered: a price change doesn't move the imported earnest money", () => {
    expect(t.touched).toEqual(expect.arrayContaining(["earnest_money", "option_fee", "title_company", "sales_price"]));
    const moved = settle({ ...t, sales_price: 500000 });
    expect([moved.earnest_money, moved.option_fee]).toEqual([1300, 100]);
  });
  it("the export fills Para 1, Para 2 and the listing-side broker block", async () => {
    const { contractValues: v, parts } = await renderPacket(t, []);
    expect(v["1 PARTIES The parties to this contract are"]).toBe("Estate of Karl Sheridan Morris");
    expect(v["Seller and"]).toBe("Eduardo Gurrola");
    expect([v["A LAND Lot"], v["undefined"], v["Addition City of"], v["County of"]]).toEqual(["377", "Beverly Heights", "Lubbock", "Lubbock"]);
    expect(v["Texas known as"]).toMatch(/2131 S Loop 289/);
    expect(v["License No"]).toBe("11907 Frankford Ave, Lubbock, TX 79424");
    expect([v["Other Broker Firm"], v["Listing Broker Firm"], v["License No_4"], v["License No_2"], v["List Assoc Name"]])
      .toEqual(["Taylor Reid Realty", "9010699", "Stuart Bartley", "stuart@lindseybartleyteam.com", "806-543-6877"]);
    expect([v["undefined_6"], v["as earnest money to"], v["as earnest money to 2"]]).toEqual(["True Title", "1,300.00", "100.00"]);
    expect(parts.map((p) => (p.kind === "bundled" ? p.id : p.title))).toEqual(["TREC-20-19", "TREC-40-11", "TREC-49-1", "TREC-56-0"]);
  });
});

describe("Ren import rules", () => {
  it("blanks only: a value the agent entered is kept and listed; empty fields fill", () => {
    const mine = settle({ ...freshOffer(), sales_price: 140000, sellers: ["Someone Else"], touched: ["sales_price", "sellers"] });
    const t = importInto(mine);
    expect(t.sales_price).toBe(140000);
    expect(t.sellers).toEqual(["Someone Else"]);
    expect(t.closing_date).toBe("2026-12-08");
    expect(t.imported!.kept).toEqual(expect.arrayContaining(["sales_price", "sellers"]));
  });
  it("an addendum the file omits or sets false leaves the box as it is", () => {
    const withHoa = settle({ ...freshOffer(), addenda: ["hoa"], touched: ["addenda"] });
    expect(importInto(withHoa).addenda).toContain("hoa"); // file says hoa: false; the box stays checked
    const f = gurrolaFile(); delete f.addenda.lead_based_paint;
    expect(importInto(freshOffer(), f).addenda).not.toContain("lead_based_paint");
  });
  it("missing keys change nothing; unknown keys are ignored and listed", () => {
    const t = importInto(freshOffer(), { ren_import_version: 1, property: { address: "1 Main St", gate_code: "1234" }, extra_section: { a: 1 } });
    expect(t.property_street).toBe("1 Main St");
    expect(t.sales_price).toBeNull();
    expect(t.imported!.unknown).toEqual(["property.gate_code", "extra_section.a"]);
  });
  it("refuses other versions and non-files; reports bad values without placing them", () => {
    expect(() => parseRenImport({ ren_import_version: 2 })).toThrow(ImportRefused);
    expect(() => parseRenImport([])).toThrow(ImportRefused);
    const p = parseRenImport({ ren_import_version: 1, terms: { sales_price: "lots", closing_date: "Dec 8", financing: "bitcoin" } });
    expect(p.values).toEqual({});
    expect(p.problems).toHaveLength(3);
  });
  it("legal descriptions split into lot, block and addition, or are left for typing", () => {
    expect(splitLegal("Lot 377, Beverly Heights Addition")).toEqual({ lot: "377", block: null, subdivision: "Beverly Heights" });
    expect(splitLegal("Lot 5, Block 12, Lakeridge Addition")).toEqual({ lot: "5", block: "12", subdivision: "Lakeridge" });
    expect(splitLegal("Abstract 123, Section 4, 2.5 acres")).toBeNull();
  });
  it("offers saved before imports existed still load", () => {
    const legacy = { ...emptyTerms() } as Record<string, unknown>; delete legacy.imported;
    expect(normalizeTerms(legacy).imported).toBeNull();
  });
});

describe("docs/REN_IMPORT_FORMAT.md is the published contract", () => {
  const doc = fs.readFileSync("docs/REN_IMPORT_FORMAT.md", "utf8");
  it("documents every key the importer reads", () => {
    for (const k of IMPORT_KEYS) expect(doc, k.path).toContain(`\`${k.path}\``);
  });
  it("names every Terms field that has no import key", () => {
    const covered = new Set(IMPORT_KEYS.flatMap((k) => (k.term ?? "").match(/[a-z_]+/g) ?? []));
    const listed = new Set(TERMS_WITHOUT_IMPORT_KEY.flatMap((x) => x.term.split(/,\s*/)));
    const missing = Object.keys(emptyTerms()).filter((k) => !covered.has(k) && !listed.has(k));
    expect(missing).toEqual([]);
    for (const x of TERMS_WITHOUT_IMPORT_KEY) expect(doc).toContain(x.term);
  });
});
