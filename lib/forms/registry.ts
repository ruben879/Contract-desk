import {
  addressLine, cashPortion, closingParts, isLoan, joinNames, type OfferAddendum, type OfferTerms,
} from "@/lib/offer/terms";

// Bundled forms (TREC promulgated), pinned by revision and file fingerprint. Field names are the
// forms' own internal names; many are misleading (the 20-19 field named "Seller and" holds the
// BUYER's name), so every entry below was matched to the words printed beside the blank.
// Fields not listed render blank. Rules: values go only in blank fields; the effective date,
// signatures, initials and escrow receipts are never filled.

export type BundledFormId = "TREC-20-19" | "TREC-40-11" | "TREC-36-11" | "TREC-56-0" | "TREC-49-1";
type Val = string | boolean | null | undefined;
export type MapEntry = {
  field: string;
  term: string;                       // Term key (or "computed: ...") for the field map table
  label: string;                      // where it is on the form, in plain words
  value: (t: OfferTerms) => Val;
  usual?: (t: OfferTerms) => boolean; // normally filled: if empty after render, it's in "Blanks left"
};
/** Checkbox sets where one box is normally checked. Empty set = one "Blanks left" entry. */
export type ChoiceGroup = { id: string; label: string; fields: string[]; usual: (t: OfferTerms) => boolean };

export type BundledForm = {
  id: BundledFormId; number: string; title: string; revision: string; file: string; sha256: string;
  fieldCount: number; pages: number; map: MapEntry[]; groups: ChoiceGroup[];
};

const money = (n: number | null | undefined) => (n == null ? null : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const num = (n: number | null | undefined) => (n == null ? null : String(n));
const always = () => true;
const addr = (t: OfferTerms) => addressLine(t) || null;

// ---------- TREC 20-19 One to Four Family Residential Contract (Resale) ----------
const HEADER_FIELDS = ["Page 2 of 10", "Page 3 of 10", "Contract Concerning", "Contract Concerning_2", "Contract Concerning_3", "Page 7 of 10",
  "Contract Concerning_4", "Address of Property", "Addr of Prop", "Address of Property_2", "Address of Property_26"];

/** Paragraph 22 boxes, top to bottom as printed (this is the Packet's addendum order). */
export const P22_SLOTS = [
  { key: "third_party_financing", field: "Addendum for Reservation of Oil Gas", label: "Third Party Financing Addendum" },
  { key: "sale_of_other_property", field: "Sellers Disclos", label: "Addendum for Sale of Other Property by Buyer" },
  { key: "appraisal_termination", field: "Addendum for BackUp Contract", label: "Addendum Concerning Right to Terminate Due to Lender's Appraisal" },
  { key: "seller_financing", field: "Addend. for Sellers Disclos", label: "Seller Financing Addendum" },
  { key: "section_1031", field: "Other", label: "Addendum for Section 1031 Exchange" },
  { key: "short_sale", field: "Check box 11", label: "Short Sale Addendum" },
  { key: "loan_assumption", field: "Environmental Assessment Threatened or", label: "Loan Assumption Addendum" },
  { key: "release_of_liability", field: "Third Party Financing Addendum", label: "Addendum for Release of Liability on Assumed Loan" },
  { key: "residential_leases", field: "Sellers Temporary Residential Lease", label: "Addendum Regarding Residential Leases" },
  { key: "fixture_leases", field: "Seller Financing Addendum", label: "Addendum Regarding Fixture Leases" },
  { key: "buyers_temp_lease", field: "Short Sale Addendum", label: "Buyer's Temporary Residential Lease" },
  { key: "sellers_temp_lease", field: "Addendum for Property Subject to", label: "Seller's Temporary Residential Lease" },
  { key: "hydrostatic_testing", field: "Addendum for Property Located Seaward", label: "Addendum for Authorizing Hydrostatic Testing" },
  { key: "environmental", field: "Buyers Temporary Residential Lease", label: "Environmental Assessment, Threatened or Endangered Species, and Wetlands Addendum" },
  { key: "lead_based_paint", field: "Loan Assumption Addendum_2", label: "Addendum for Seller's Disclosure of Information on Lead-based Paint" },
  { key: "propane", field: "Addendum for Sale of Other Property by", label: "Addendum for Property in a Propane Gas System Service Area" },
  { key: "seaward", field: "Addendum for Property in a Propane Gas", label: "Addendum for Property Located Seaward of the Gulf Intracoastal Waterway" },
  { key: "coastal", field: "Check Box8", label: "Addendum for Coastal Area Property" },
  { key: "pid", field: "PID", label: "Notice of utility, water, drainage, or public improvement district" },
  { key: "hoa", field: "Check Box9", label: "Addendum for Property Subject to Mandatory Membership in a Property Owners Association" },
  { key: "non_realty_items", field: "Addendum for Section 1031", label: "Non-Realty Items Addendum" },
  { key: "back_up_contract", field: "Check box 10", label: "Addendum for \"Back-Up\" Contract" },
  { key: "oil_gas_reservation", field: "Buyer only", label: "Addendum for Reservation of Oil, Gas, and Other Minerals" },
  { key: "other", field: "Seller and Buyer as an intermediary", label: "Other" },
] as const;
export type P22Slot = (typeof P22_SLOTS)[number]["key"];
export const P22_OTHER_TEXT_FIELD = "Brokers and Sales22";
/** Bundled addenda own these Paragraph 22 slots. */
export const BUNDLED_SLOT: Record<Exclude<OfferAddendum, never>, BundledFormId> = {
  third_party_financing: "TREC-40-11", appraisal_termination: "TREC-49-1", lead_based_paint: "TREC-56-0", hoa: "TREC-36-11",
};

const comp = (t: OfferTerms, kind: "percent" | "amount") => t.buyer_broker_comp_type === kind && t.buyer_broker_comp_value != null;

const MAP_20_19: MapEntry[] = [
  // 1. Parties (internal names are swapped: "1 PARTIES ..." holds the Seller, "Seller and" holds the Buyer)
  { field: "1 PARTIES The parties to this contract are", term: "sellers", label: "Para 1: Seller", value: (t) => joinNames(t.sellers) || null, usual: always },
  { field: "Seller and", term: "buyers", label: "Para 1: Buyer", value: (t) => joinNames(t.buyers) || null, usual: always },
  // 2A. Land
  { field: "A LAND Lot", term: "lot", label: "Para 2A: Lot", value: (t) => t.lot },
  { field: "Block", term: "block", label: "Para 2A: Block", value: (t) => t.block },
  { field: "undefined", term: "subdivision", label: "Para 2A: Addition (subdivision)", value: (t) => t.subdivision },
  { field: "Addition City of", term: "property_city", label: "Para 2A: City", value: (t) => t.property_city, usual: always },
  { field: "County of", term: "property_county", label: "Para 2A: County", value: (t) => t.property_county, usual: always },
  { field: "Texas known as", term: "property_street + city + ZIP", label: "Para 2A: Known as (address/ZIP)", value: addr, usual: always },
  // 3. Sales price. Cash: A = price, B blank, C = price. Loan: A = price - loan, B = loan, TPF box.
  { field: "undefined_3", term: "computed: cash portion", label: "Para 3A: Cash portion", value: (t) => money(cashPortion(t)), usual: always },
  { field: "B Sum of all financing described in the attached", term: "financing_type (loan)", label: "Para 3B: Third Party Financing Addendum box", value: (t) => isLoan(t.financing_type) },
  { field: "undefined_4", term: "financed_amount", label: "Para 3B: Sum of financing", value: (t) => (isLoan(t.financing_type) ? money(t.financed_amount) : null), usual: (t) => isLoan(t.financing_type) },
  { field: "undefined_5", term: "sales_price", label: "Para 3C: Sales price", value: (t) => money(t.sales_price), usual: always },
  // Page headers: "Contract Concerning ____ (Address of Property)"
  ...HEADER_FIELDS.map((f, i): MapEntry => ({ field: f, term: "property_street + city + ZIP", label: `Page ${i + 2} header: address`, value: addr, usual: always })),
  // 5. Earnest money and option fee
  { field: "undefined_6", term: "title_company", label: "Para 5A: Escrow Agent", value: (t) => t.title_company, usual: always },
  { field: "other party in writing before entering into a contract of sale  Disclose if applicable", term: "(leave blank)", label: "Para 5A: Escrow Agent address", value: () => null, usual: always },
  { field: "as earnest money to", term: "earnest_money", label: "Para 5A: Earnest money", value: (t) => money(t.earnest_money), usual: always },
  { field: "as earnest money to 2", term: "option_fee", label: "Para 5A: Option fee", value: (t) => money(t.option_fee), usual: always },
  { field: "the Title Company and Buyers lenders Check one box only", term: "option_period_days", label: "Para 5B: Option period days", value: (t) => num(t.option_period_days), usual: always },
  // 6A. Title
  { field: "insurance Title Policy issued by", term: "title_company", label: "Para 6A: Title Company", value: (t) => t.title_company, usual: always },
  // Boxes identified by position beside the printed "Seller's" / "Buyer's" (page 2, y 344; page 3, y 640).
  { field: "Sellers_2", term: "title_policy_payer = seller", label: "Para 6A: Owner's policy at Seller's expense", value: (t) => t.title_policy_payer === "seller" },
  { field: "Buyers expense no later", term: "title_policy_payer = buyer", label: "Para 6A: Owner's policy at Buyer's expense", value: (t) => t.title_policy_payer === "buyer" },
  // 6C. Survey (choice from the Terms screen)
  { field: "Buyer", term: "survey_option = seller_existing", label: "Para 6C(1): Seller furnishes existing survey", value: (t) => t.survey_option === "seller_existing" },
  { field: "than 3 days prior to Closing Date", term: "survey_days", label: "Para 6C(1): days", value: (t) => (t.survey_option === "seller_existing" ? num(t.survey_days) : null), usual: (t) => t.survey_option === "seller_existing" },
  { field: "Within one", term: "survey_new_payer = seller", label: "Para 6C(1): New survey at Seller's expense", value: (t) => t.survey_option === "seller_existing" && t.survey_new_payer === "seller" },
  { field: "Within two", term: "survey_new_payer = buyer", label: "Para 6C(1): New survey at Buyer's expense", value: (t) => t.survey_option === "seller_existing" && t.survey_new_payer === "buyer" },
  { field: "Within three", term: "survey_option = buyer_new", label: "Para 6C(2): Buyer obtains new survey", value: (t) => t.survey_option === "buyer_new" },
  { field: "3 days prior", term: "survey_days", label: "Para 6C(2): days", value: (t) => (t.survey_option === "buyer_new" ? num(t.survey_days) : null), usual: (t) => t.survey_option === "buyer_new" },
  { field: "Within four", term: "survey_option = seller_new", label: "Para 6C(3): Seller furnishes new survey", value: (t) => t.survey_option === "seller_new" },
  { field: "receipt or the date specified in this paragraph whichever is earlier", term: "survey_days", label: "Para 6C(3): days", value: (t) => (t.survey_option === "seller_new" ? num(t.survey_days) : null), usual: (t) => t.survey_option === "seller_new" },
  { field: "the Commitment Exception Documents and the survey Buyers failure to object within the", term: "(leave blank)", label: "Para 6D: Days to object", value: () => null, usual: always },
  // 6E(2). POA: "is" exactly when the HOA addendum is in the offer
  { field: "1Within", term: "addenda includes hoa", label: "Para 6E(2): Property is subject to a POA", value: (t) => t.addenda.includes("hoa") },
  { field: "2 Within", term: "addenda excludes hoa", label: "Para 6E(2): Property is not subject to a POA", value: (t) => !t.addenda.includes("hoa") },
  // 9A. Closing: "on or before ____, 20__"
  { field: "A The closing of the sale will be on or before", term: "closing_date", label: "Para 9A: Closing date (month, day)", value: (t) => closingParts(t.closing_date)?.monthDay, usual: always },
  { field: "20", term: "closing_date", label: "Para 9A: Closing year", value: (t) => closingParts(t.closing_date)?.yy, usual: always },
  // 10A. Possession: upon closing and funding (the contract default; the lease option needs a lease form, not in v1)
  { field: "will", term: "possession", label: "Para 10A: Possession upon closing and funding", value: (t) => t.possession === "closing_and_funding" },
  // 12B(1). Seller pays toward Buyer's broker
  { field: "Seller as List Brok Sub agent", term: "buyer_broker_comp_type", label: "Para 12B(1): Seller will pay", value: (t) => t.buyer_broker_comp_type != null && t.buyer_broker_comp_value != null },
  { field: "Seller as List Brok Sub agent27", term: "buyer_broker_comp_type = amount", label: "Para 12B(1): $ box", value: (t) => comp(t, "amount") },
  { field: "acknowledged by Seller and Buyers agreement to pay Seller 130", term: "buyer_broker_comp_value", label: "Para 12B(1): Amount", value: (t) => (comp(t, "amount") ? money(t.buyer_broker_comp_value) : null) },
  { field: "Seller only as Sellers agent", term: "buyer_broker_comp_type = percent", label: "Para 12B(1): % box", value: (t) => comp(t, "percent") },
  { field: "acknowledged by Seller and Buyers agreement to pay Seller 31", term: "buyer_broker_comp_value", label: "Para 12B(1): Percent", value: (t) => (comp(t, "percent") ? String(t.buyer_broker_comp_value) : null) },
  // 21. Notices: To Buyer(s) at
  { field: "when mailed to handdelivered at or transmitted by fax or electronic transmission as follow15", term: "buyer_notice_address", label: "Para 21: Buyer address", value: (t) => t.buyer_notice_address },
  { field: "Phone 5217", term: "buyer_notice_phone", label: "Para 21: Buyer phone", value: (t) => t.buyer_notice_phone },
  { field: "undefined_2013", term: "buyer_notice_email", label: "Para 21: Buyer email", value: (t) => t.buyer_notice_email, usual: always },
  // 21. To Buyer's agent at
  { field: "when mailed to handdelivered at or transmitted by fax or electronic transmission as follows", term: "buyer_broker_address", label: "Para 21: Buyer's agent address", value: (t) => t.buyer_broker_address },
  { field: "Phone 52", term: "buyer_agent_phone", label: "Para 21: Buyer's agent phone", value: (t) => t.buyer_agent_phone, usual: always },
  { field: "undefined_20", term: "buyer_agent_email", label: "Para 21: Buyer's agent email", value: (t) => t.buyer_agent_email, usual: always },
  // 21. To Seller's agent at
  { field: "undefined numb 21", term: "listing_agent_phone", label: "Para 21: Seller's agent phone", value: (t) => t.listing_agent_phone },
  { field: "undefined numb 22", term: "listing_agent_email", label: "Para 21: Seller's agent email", value: (t) => t.listing_agent_email, usual: always },
  // 22. Bundled addenda boxes: checked exactly when that addendum is in the Packet (render enforces)
  { field: "Addendum for Reservation of Oil Gas", term: "addenda: third_party_financing", label: "Para 22: Third Party Financing Addendum", value: (t) => t.addenda.includes("third_party_financing") },
  { field: "Addendum for BackUp Contract", term: "addenda: appraisal_termination", label: "Para 22: Appraisal termination addendum", value: (t) => t.addenda.includes("appraisal_termination") },
  { field: "Loan Assumption Addendum_2", term: "addenda: lead_based_paint", label: "Para 22: Lead-based paint addendum", value: (t) => t.addenda.includes("lead_based_paint") },
  { field: "Check Box9", term: "addenda: hoa", label: "Para 22: HOA addendum", value: (t) => t.addenda.includes("hoa") },
  // Broker contact information: firm representing Seller (listing side)
  { field: "Other Broker Firm", term: "listing_broker_firm", label: "Broker info: Listing broker firm", value: (t) => t.listing_broker_firm, usual: always },
  { field: "Listing Broker Firm", term: "listing_broker_license", label: "Broker info: Listing firm license", value: (t) => t.listing_broker_license },
  { field: "License No_4", term: "listing_agent_name", label: "Broker info: Listing associate", value: (t) => t.listing_agent_name, usual: always },
  { field: "License No_2", term: "listing_agent_email", label: "Broker info: Listing associate email", value: (t) => t.listing_agent_email },
  { field: "List Assoc Name", term: "listing_agent_phone", label: "Broker info: Listing associate phone", value: (t) => t.listing_agent_phone },
  { field: "License No_5", term: "listing_agent_license", label: "Broker info: Listing associate license", value: (t) => t.listing_agent_license },
  // Firm representing Buyer (this brokerage, from the profiles)
  { field: "Associates Email Address", term: "buyer_broker_firm", label: "Broker info: Buyer's broker firm", value: (t) => t.buyer_broker_firm, usual: always },
  { field: "Listing Associates Email Address", term: "buyer_broker_address", label: "Broker info: Buyer's broker address", value: (t) => t.buyer_broker_address },
  { field: "Phone", term: "buyer_broker_license", label: "Broker info: Buyer's broker firm license", value: (t) => t.buyer_broker_license, usual: always },
  { field: "Licensed Supervisor of Associate", term: "buyer_agent_name", label: "Broker info: Buyer's associate", value: (t) => t.buyer_agent_name, usual: always },
  { field: "License No_6", term: "buyer_agent_email", label: "Broker info: Buyer's associate email", value: (t) => t.buyer_agent_email },
  { field: "Other Brokers Address", term: "buyer_agent_phone", label: "Broker info: Buyer's associate phone", value: (t) => t.buyer_agent_phone },
  { field: "Phone_2", term: "buyer_agent_license", label: "Broker info: Buyer's associate license", value: (t) => t.buyer_agent_license, usual: always },
  { field: "Licensed Supervisor of Listing Associate", term: "buyer_supervisor_name", label: "Broker info: Licensed supervisor", value: (t) => t.buyer_supervisor_name },
  { field: "State", term: "buyer_supervisor_license", label: "Broker info: Supervisor license", value: (t) => t.buyer_supervisor_license },
];

const GROUPS_20_19: ChoiceGroup[] = [
  { id: "6A-payer", label: "Para 6A: Who pays the owner's title policy", fields: ["Sellers_2", "Buyers expense no later"], usual: always },
  { id: "6A8-shortages", label: "Para 6A(8): Survey shortages exception", fields: ["2Within", "3Within"], usual: always },
  { id: "6C-survey", label: "Para 6C: Survey choice", fields: ["Buyer", "Within three", "Within four"], usual: always },
  { id: "6C1-expense", label: "Para 6C(1): Who pays a new survey if the existing one isn't accepted", fields: ["Within one", "Within two"], usual: (t) => t.survey_option === "seller_existing" },
  { id: "7B-disclosure", label: "Para 7B: Seller's Disclosure Notice", fields: ["1 Buyer accepts the Property As Is", "2 Buyer accepts the Property As Is provided Seller at Sellers expense shall complete the", "upon"], usual: always },
  { id: "7D-condition", label: "Para 7D: Acceptance of property condition (as is)", fields: ["As Is", "As Is except"], usual: always },
  { id: "7-water", label: "Para 7: Seller's Water Disclosure", fields: ["Seller as List Brok Sub agent2", "Dollar Amt2", "Dollar Amt"], usual: always },
  { id: "12B1-comp", label: "Para 12B(1): Seller's contribution to Buyer's broker", fields: ["Seller as List Brok Sub agent"], usual: always },
];

// ---------- TREC 40-11 Third Party Financing Addendum ----------
// Note: the field named "Text2" sits on BOTH the VA origination-charge blank and the Other
// financing origination-charge blank (one field, two boxes), so it is always left blank.
const conv = (t: OfferTerms) => t.financing_type === "conventional";
const fha = (t: OfferTerms) => t.financing_type === "fha";
const va = (t: OfferTerms) => t.financing_type === "va";
const other = (t: OfferTerms) => t.financing_type === "other";
const when = (p: (t: OfferTerms) => boolean, v: (t: OfferTerms) => Val) => (t: OfferTerms) => (p(t) ? v(t) : null);

const MAP_40_11: MapEntry[] = [
  { field: "Street Address and City", term: "property_street + city + ZIP", label: "Page 1: Property", value: addr, usual: always },
  { field: "Address of Property", term: "property_street + city + ZIP", label: "Page 2 header: Property", value: addr, usual: always },
  // A. Conventional, first mortgage
  { field: "1 Conventional Financing", term: "financing_type = conventional", label: "1A: Conventional financing", value: conv },
  { field: "a A first mortgage loan in the principal amount of", term: "financing_type = conventional", label: "1A(1): First mortgage", value: conv },
  { field: "years with interest not to exceed", term: "financed_amount", label: "1A(1): Principal amount", value: when(conv, (t) => money(t.financed_amount)), usual: conv },
  { field: "any financed PMI premium due in full in 1", term: "loan_term_years", label: "1A(1): Due in full in (years)", value: when(conv, (t) => num(t.loan_term_years)), usual: conv },
  { field: "any financed PMI premium due in full in 2", term: "loan_rate_cap", label: "1A(1): Interest not to exceed (%)", value: when(conv, (t) => num(t.loan_rate_cap)), usual: conv },
  { field: "per annum for the first", term: "(leave blank)", label: "1A(1): Rate cap applies for the first (years)", value: () => null, usual: conv },
  { field: "shown on Buyers Loan Estimate for the loan not to exceed", term: "(leave blank)", label: "1A(1): Origination charges not to exceed (%)", value: () => null, usual: conv },
  // C. FHA
  { field: "3 FHA Insured Financing A Section", term: "financing_type = fha", label: "1C: FHA insured financing", value: fha },
  { field: "undefined", term: "(leave blank)", label: "1C: FHA Section", value: () => null, usual: fha },
  { field: "excluding any financed MIP amortizable monthly for not less", term: "financed_amount", label: "1C: Loan amount", value: when(fha, (t) => money(t.financed_amount)), usual: fha },
  { field: "than", term: "loan_term_years", label: "1C: Term (years)", value: when(fha, (t) => num(t.loan_term_years)), usual: fha },
  { field: "years with interest not to exceed_2", term: "loan_rate_cap", label: "1C: Interest not to exceed (%)", value: when(fha, (t) => num(t.loan_rate_cap)), usual: fha },
  { field: "Text1", term: "(leave blank)", label: "1C: Rate cap applies for the first (years)", value: () => null, usual: fha },
  { field: "not to exceed", term: "(leave blank)", label: "1C: Origination charges not to exceed (%)", value: () => null, usual: fha },
  // D. VA (internal name says "Reverse Mortgage"; the printed label is D. VA GUARANTEED FINANCING)
  { field: "6 Reverse Mortgage Financing A reverse mortgage loan also known as a Home Equity", term: "financing_type = va", label: "1D: VA guaranteed financing", value: va },
  { field: "excluding_2", term: "financed_amount", label: "1D: Loan amount", value: when(va, (t) => money(t.financed_amount)), usual: va },
  { field: "any financed Funding Fee amortizable monthly for not less than", term: "loan_term_years", label: "1D: Term (years)", value: when(va, (t) => num(t.loan_term_years)), usual: va },
  { field: "not to exceed_2", term: "loan_rate_cap", label: "1D: Interest not to exceed (%)", value: when(va, (t) => num(t.loan_rate_cap)), usual: va },
  { field: "per annum for the first_3", term: "(leave blank)", label: "1D: Rate cap applies for the first (years)", value: () => null, usual: va },
  { field: "Text2", term: "(leave blank: shared by 1D and 1G)", label: "1D/1G: Origination charges not to exceed (%)", value: () => null, usual: (t) => va(t) || other(t) },
  // G. Other financing
  { field: "6 Reverse Mortgage Financing A reverse mortgage loan also known as a Home Equity-1", term: "financing_type = other", label: "1G: Other financing", value: other },
  { field: "excluding_2-1", term: "(leave blank)", label: "1G: Name of lender", value: () => null, usual: other },
  { field: "not to exceed-1", term: "financed_amount", label: "1G: Principal amount", value: when(other, (t) => money(t.financed_amount)), usual: other },
  { field: "any financed Funding Fee amortizable monthly for not less than-1", term: "loan_term_years", label: "1G: Due in (years)", value: when(other, (t) => num(t.loan_term_years)), usual: other },
  { field: "not to exceed_2-1", term: "loan_rate_cap", label: "1G: Interest not to exceed (%)", value: when(other, (t) => num(t.loan_rate_cap)), usual: other },
  { field: "per annum for the first_3-1", term: "(leave blank)", label: "1G: Rate cap applies for the first (years)", value: () => null, usual: other },
  // 2A. Buyer Approval
  { field: "Check Box2", term: "fin_approval_days", label: "2A: Subject to Buyer Approval", value: (t) => t.fin_approval_days != null },
  { field: "Conversion Mortgage loan in the original principal amount of", term: "fin_approval_days", label: "2A: Buyer may terminate within (days)", value: (t) => num(t.fin_approval_days) },
  // 4. FHA/VA appraised value
  { field: "value of the Property established by the Department of Veterans Affairs", term: "(leave blank)", label: "4: FHA/VA appraised value amount", value: () => null, usual: (t) => fha(t) || va(t) },
];
const GROUPS_40_11: ChoiceGroup[] = [
  { id: "2A-approval", label: "2A: Buyer Approval (subject to, or not)", fields: ["Check Box2", "This contract is subject to Buyer obtaining Buyer Approval If Buyer cannot obtain Buyer"], usual: always },
  { id: "1G-waive", label: "1G: Buyer does / does not waive termination rights", fields: ["will-1", "will-2"], usual: other },
];

// ---------- TREC 36-11 HOA Addendum ----------
const MAP_36_11: MapEntry[] = [
  { field: "Street Address and City", term: "property_street + city + ZIP", label: "Property", value: addr, usual: always },
  { field: "Name of Property Owners Association Association and Phone Number", term: "hoa_association", label: "Association name and phone", value: (t) => t.hoa_association, usual: always },
  { field: "1 Within", term: "hoa_info_days", label: "A(1): Seller delivers Subdivision Information", value: (t) => t.hoa_info_days != null },
  { field: "the Subdivision Information to the Buyer If Seller delivers the Subdivision Information Buyer may terminate", term: "hoa_info_days", label: "A(1): Within (days)", value: (t) => num(t.hoa_info_days) },
  { field: "D DEPOSITS FOR RESERVES Buyer shall pay any deposits for reserves required at closing by the Association", term: "hoa_fee_cap", label: "C: Buyer's fees not to exceed ($)", value: (t) => money(t.hoa_fee_cap), usual: always },
];
const GROUPS_36_11: ChoiceGroup[] = [
  { id: "A-subdivision", label: "A: Subdivision Information choice", fields: ["1 Within", "undefined", "3Buyer has received and approved the Subdivision Information before signing the contract Buyer", "4Buyer does not require delivery of the Subdivision Information"], usual: always },
  { id: "D-cost", label: "D: Who pays the Title Company's cost for the information", fields: ["Buyer", "Seller shall pay the Title Company the cost of obtaining the"], usual: always },
];

// ---------- TREC 56-0 Lead-Based Paint ----------
const MAP_56_0: MapEntry[] = [
  { field: "Street Address and City", term: "property_street + city + ZIP", label: "Property", value: addr, usual: always },
];
const GROUPS_56_0: ChoiceGroup[] = [
  { id: "C-rights", label: "C: Buyer's rights (waive, or risk assessment within 10 days)", fields: ["Check Box11", "Check Box12"], usual: always },
];

// ---------- TREC 49-1 Right to Terminate Due to Lender's Appraisal ----------
const ap = (o: OfferTerms["appraisal_option"]) => (t: OfferTerms) => t.appraisal_option === o;
const MAP_49_1: MapEntry[] = [
  { field: "Street Address and City", term: "property_street + city + ZIP", label: "Property", value: addr, usual: always },
  { field: "1 WAIVER Buyer w aives Buyers right to terminate the contract under Paragraph 2B of the", term: "appraisal_option = waiver", label: "(1) Waiver", value: ap("waiver") },
  { field: "2 PARTIAL WAIVER Buyer w aives Buyers right to terminate the contract under Paragraph 2B", term: "appraisal_option = partial_waiver", label: "(2) Partial waiver", value: ap("partial_waiver") },
  { field: "ii the opinion of value is", term: "appraisal_value", label: "(2) Opinion of value is $__ or more", value: when(ap("partial_waiver"), (t) => money(t.appraisal_value)), usual: ap("partial_waiver") },
  { field: "3 ADDITIONAL", term: "appraisal_option = additional_right", label: "(3) Additional right to terminate", value: ap("additional_right") },
  { field: "days after the Effective Date if", term: "appraisal_days", label: "(3) Within (days)", value: when(ap("additional_right"), (t) => num(t.appraisal_days)), usual: ap("additional_right") },
  { field: "than", term: "appraisal_value", label: "(3) Appraised value less than $", value: when(ap("additional_right"), (t) => money(t.appraisal_value)), usual: ap("additional_right") },
];
const GROUPS_49_1: ChoiceGroup[] = [
  { id: "choice", label: "Waiver, partial waiver, or additional right (check one)", fields: ["1 WAIVER Buyer w aives Buyers right to terminate the contract under Paragraph 2B of the", "2 PARTIAL WAIVER Buyer w aives Buyers right to terminate the contract under Paragraph 2B", "3 ADDITIONAL"], usual: always },
];

export const BUNDLED_FORMS: Record<BundledFormId, BundledForm> = {
  "TREC-20-19": { id: "TREC-20-19", number: "20-19", title: "One to Four Family Residential Contract (Resale)", revision: "05-04-2026", file: "forms/trec/TREC-20-19.pdf",
    sha256: "3620b6e64c9b24a9fd1f0fdc4087916504b0a080d1dc4b8c7ebc87ce3a7320da", fieldCount: 280, pages: 12, map: MAP_20_19, groups: GROUPS_20_19 },
  "TREC-40-11": { id: "TREC-40-11", number: "40-11", title: "Third Party Financing Addendum", revision: "11-04-2024", file: "forms/trec/TREC-40-11.pdf",
    sha256: "98976d5b0d5f79aa775c7be641965c630578edd9c3fd69dec10532137f4cebe5", fieldCount: 64, pages: 2, map: MAP_40_11, groups: GROUPS_40_11 },
  "TREC-36-11": { id: "TREC-36-11", number: "36-11", title: "Addendum for Property Subject to Mandatory Membership in a Property Owners Association", revision: "05-04-2026", file: "forms/trec/TREC-36-11.pdf",
    sha256: "91c142475efc7b6be5b8d2b2b6d40ec30aed4d65b9981cb70bf94622e02be7eb", fieldCount: 17, pages: 1, map: MAP_36_11, groups: GROUPS_36_11 },
  "TREC-56-0": { id: "TREC-56-0", number: "56-0", title: "Addendum for Seller's Disclosure of Information on Lead-Based Paint and Lead-Based Paint Hazards", revision: "05-04-2026", file: "forms/trec/TREC-56-0.pdf",
    sha256: "515bda0aa4b834e55b0fe894378e8ce200c9c3547c81fcb11bf1019107dbf868", fieldCount: 25, pages: 1, map: MAP_56_0, groups: GROUPS_56_0 },
  "TREC-49-1": { id: "TREC-49-1", number: "49-1", title: "Addendum Concerning Right to Terminate Due to Lender's Appraisal", revision: "11-15-18", file: "forms/trec/TREC-49-1.pdf",
    sha256: "9cc7f9508a282830265dad72bdbef414afc3a78915c991b7e34d480d755e4b23", fieldCount: 11, pages: 1, map: MAP_49_1, groups: GROUPS_49_1 },
};

/** Never filled at offer time, and never listed as a blank: execution, signatures, initials, receipts. */
export const NEVER_FILL_20_19 = ["EXECUTED the", "day of", "20_2"];
