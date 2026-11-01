import { describe, expect, it } from "vitest";
import { diffTerms, proposeChanges, type Terms } from "@/lib/terms";

const current: Terms = {
  side: "buyer", contract_form: "TREC 20-18", property_street: "123 Main St", property_city: "Lubbock", property_state: "TX",
  property_zip: "79424", property_county: "Lubbock", legal_description: null, sales_price: 325000, financed_amount: 308750,
  financing_type: "conventional", effective_date: "2026-10-28", closing_date: "2026-12-04", earnest_money: 3000, option_fee: 200,
  option_period_days: 7, survey_days: null, hoa_info_days: null, seller_disclosure: "received", addenda: ["third_party_financing"], missing_docs: null,
};
const loc = { doc: 1, page: 1, quote: "x", box: null, source: "Para 2" };

describe("proposeChanges", () => {
  it("keeps real changes and drops restated values", () => {
    const { proposed } = proposeChanges(current, [
      { key: "closing_date", value: "2026-12-11", confidence: "high", ...loc },
      { key: "sales_price", value: "325000", confidence: "high", ...loc },
      { key: "sales_price", value: 312000, confidence: "medium", ...loc },
    ]);
    expect(proposed.map((p) => [p.key, p.after])).toEqual([["closing_date", "2026-12-11"], ["sales_price", 312000]]);
    expect(proposed[1].before).toBe(325000);
  });
  it("turns an option end date into a day count from the effective date", () => {
    const { proposed } = proposeChanges(current, [{ key: "option_period_end_date", value: "2026-11-07", confidence: "high", ...loc }]);
    expect(proposed[0]).toMatchObject({ key: "option_period_days", before: 7, after: 10 });
  });
  it("never lets an unreadable value through as a value", () => {
    const { proposed, notes } = proposeChanges(current, [{ key: "closing_date", value: "mid December", confidence: "low", ...loc }]);
    expect(proposed).toEqual([]);
    expect(notes[0]).toContain("Couldn't read the new closing date");
  });
  it("routes people changes to notes", () => {
    const { proposed, notes } = proposeChanges(current, [{ key: "title_company", value: "Lubbock Abstract", confidence: "high", ...loc }]);
    expect(proposed).toEqual([]);
    expect(notes[0]).toContain("title company changes to Lubbock Abstract");
  });
});

describe("diffTerms", () => {
  it("lists changed fields and addenda for the audit log", () => {
    const d = diffTerms(current, { ...current, closing_date: "2026-12-11", addenda: ["third_party_financing", "hoa"] });
    expect(d.fields.map((f) => f.key)).toEqual(["closing_date"]);
    expect(d.addenda).toEqual({ added: ["hoa"], removed: [] });
  });
});
