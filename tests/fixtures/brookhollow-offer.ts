import { emptyTerms, enforceRules, type OfferTerms } from "@/lib/offer/terms";

/** The brief's acceptance fixture: Brookhollow, cash, HOA addendum. */
export function brookhollowTerms(over: Partial<OfferTerms> = {}): OfferTerms {
  return enforceRules({
    ...emptyTerms(),
    buyers: ["Kenneth P. Kidd", "LaRhonda G. Kidd"],
    sellers: ["James M. Rose", "Twila F. Rose"],
    property_street: "17 W Brookhollow Dr", property_city: "Ransom Canyon", property_zip: "79366", property_county: "Lubbock",
    sales_price: 425000, financing_type: "cash",
    earnest_money: 4000, option_fee: 200, option_period_days: 10,
    closing_date: "2026-11-11", title_company: "Service Title",
    addenda: ["hoa"], hoa_info_days: 20, hoa_fee_cap: 1500,
    ...over,
  });
}
