// Canonical addendum keys. Extraction maps whatever it sees onto these keys,
// and checklist triggers key off them. Form numbers are shown for reference only,
// since TREC revises version numbers; matching is by key, not by form number.

export const ADDENDA = {
  third_party_financing: "Third Party Financing Addendum",
  hoa: "Addendum for Property Subject to Mandatory Membership in a Property Owners Association",
  sellers_disclosure: "Seller's Disclosure Notice",
  lead_based_paint: "Addendum for Seller's Disclosure of Information on Lead-Based Paint",
  sale_of_other_property: "Addendum for Sale of Other Property by Buyer",
  seller_financing: "Seller Financing Addendum",
  loan_assumption: "Loan Assumption Addendum",
  buyers_temp_lease: "Buyer's Temporary Residential Lease",
  sellers_temp_lease: "Seller's Temporary Residential Lease",
  back_up_contract: "Addendum for Back-Up Contract",
  non_realty_items: "Non-Realty Items Addendum",
  amendment: "Amendment to Contract",
  other: "Other addendum or form",
} as const;

export type AddendumKey = keyof typeof ADDENDA;
export const ADDENDUM_KEYS = Object.keys(ADDENDA) as AddendumKey[];

export const FINANCING_TYPES = [
  "cash", "conventional", "fha", "va", "usda", "texas_veterans", "seller_financing", "loan_assumption", "other",
] as const;
export type FinancingType = (typeof FINANCING_TYPES)[number];

export const FINANCING_LABELS: Record<FinancingType, string> = {
  cash: "Cash", conventional: "Conventional", fha: "FHA", va: "VA", usda: "USDA",
  texas_veterans: "Texas Veterans Land Board", seller_financing: "Seller financing",
  loan_assumption: "Loan assumption", other: "Other",
};

export const DISCLOSURE_STATUSES = ["received", "not_received", "not_required", "unknown"] as const;
export type DisclosureStatus = (typeof DISCLOSURE_STATUSES)[number];

export const DISCLOSURE_LABELS: Record<DisclosureStatus, string> = {
  received: "Buyer has received it",
  not_received: "Buyer has NOT received it",
  not_required: "Not required",
  unknown: "Not sure",
};
