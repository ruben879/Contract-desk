import { describe, expect, it } from "vitest";
import { findOfferMatch, offerMatches, writtenVsSigned, type ExtractedForMatch } from "@/lib/offer/match";
import { brookhollowTerms } from "./fixtures/brookhollow-offer";

// The executed Brookhollow contract as the reader reports it (brief fixture values).
const signed = (over: Partial<ExtractedForMatch> = {}): ExtractedForMatch => ({
  property_street: "17 W. Brookhollow Drive", property_city: "Ransom Canyon", property_zip: "79366",
  buyers: ["Kenneth P. Kidd", "LaRhonda G. Kidd"],
  sales_price: 425000, earnest_money: 4000, option_fee: 200, option_period_days: 10,
  closing_date: "2026-11-11", financing_type: "cash", addenda: ["hoa"], ...over,
});

describe("return match", () => {
  it("matches the Brookhollow offer by address and buyer last name", () => {
    expect(offerMatches(brookhollowTerms(), signed())).toBe(true);
  });
  it("needs both: same address with different buyers, or same buyers elsewhere, don't match", () => {
    expect(offerMatches(brookhollowTerms(), signed({ buyers: ["Pat Smith"] }))).toBe(false);
    expect(offerMatches(brookhollowTerms(), signed({ property_street: "19 W Brookhollow Dr" }))).toBe(false);
  });
  it("one buyer last name is enough (\"Kenneth Kidd and Others\")", () => {
    expect(offerMatches(brookhollowTerms(), signed({ buyers: ["Kenneth Kidd and LaRhonda Jones"] }))).toBe(true);
  });
  it("two plausible offers: no match (never guess)", () => {
    const o = { id: "1", terms: brookhollowTerms() };
    expect(findOfferMatch([o, { ...o, id: "2" }], signed())).toBeNull();
    expect(findOfferMatch([o], signed())?.id).toBe("1");
  });
  it("Written vs Signed diffs clean for the matching contract", () => {
    expect(writtenVsSigned(brookhollowTerms(), signed()).filter((r) => r.changed)).toEqual([]);
  });
  it("changing the signed price flags exactly that row", () => {
    const changed = writtenVsSigned(brookhollowTerms(), signed({ sales_price: 420000 })).filter((r) => r.changed);
    expect(changed.map((r) => r.key)).toEqual(["sales_price"]);
    expect(changed[0]).toMatchObject({ written: "$425,000.00", signed: "$420,000.00" });
  });
});
