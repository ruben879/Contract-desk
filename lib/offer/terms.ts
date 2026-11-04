import { formatDate, isValidISO, parseISO } from "@/lib/dates";

// Offer Terms: what the agent enters on the one Terms screen. Keys match the contract
// extractor's names wherever the extractor reads the same thing (buyers, sales_price,
// option_period_days, hoa_info_days, fin_approval_days, listing_agent_name, ...), so a signed
// contract read back can be compared key by key. The effective date is not a Term: it stays
// blank until execution (brief rule: never invent a date).

export const OFFER_FINANCING = ["cash", "conventional", "fha", "va", "other"] as const;
export type OfferFinancing = (typeof OFFER_FINANCING)[number];
export const OFFER_FINANCING_LABELS: Record<OfferFinancing, string> = { cash: "Cash", conventional: "Conventional", fha: "FHA", va: "VA", other: "Other" };
export const isLoan = (f: OfferFinancing | null | undefined) => !!f && f !== "cash";

/** Bundled addenda the agent can include. Keys match lib/addenda where the extractor has one. */
export const OFFER_ADDENDA = ["third_party_financing", "hoa", "lead_based_paint", "appraisal_termination"] as const;
export type OfferAddendum = (typeof OFFER_ADDENDA)[number];

export type SurveyOption = "seller_existing" | "buyer_new" | "seller_new";
export type AppraisalOption = "waiver" | "partial_waiver" | "additional_right";

export type OfferTerms = {
  // Parties
  buyers: string[];
  buyer_contact_ids: string[];
  sellers: string[];
  // Property
  property_street: string | null; property_city: string | null; property_zip: string | null; property_county: string | null;
  lot: string | null; block: string | null; subdivision: string | null;
  year_built: number | null;
  // Money
  sales_price: number | null;
  earnest_money: number | null;
  option_fee: number | null;
  option_period_days: number | null;
  financing_type: OfferFinancing | null;
  financed_amount: number | null;     // loan amount (Financing Addendum)
  loan_term_years: number | null;
  loan_rate_cap: number | null;       // percent, e.g. 7.5
  loan_origination_cap: number | null; // percent of the loan, e.g. 1 (40-11 origination charges cap)
  fin_approval_days: number | null;   // Buyer Approval within N days (40-11 Para 2A)
  // Dates
  closing_date: string | null;        // "on or before", YYYY-MM-DD
  possession: "closing_and_funding";
  // Title & survey
  title_company: string | null;
  title_company_address: string | null; // Para 5A: the escrow agent's address
  title_policy_payer: "seller" | "buyer" | null;   // Para 6A: owner's policy at whose expense
  survey_option: SurveyOption | null;
  survey_days: number | null;
  survey_new_payer: "seller" | "buyer" | null;     // Para 6C(1): who pays a new survey if the existing one isn't accepted
  // Addenda
  addenda: OfferAddendum[];
  hoa_association: string | null;     // name and phone, as one line on the 36-11
  hoa_info_days: number | null;
  hoa_fee_cap: number | null;
  appraisal_option: AppraisalOption | null;
  appraisal_value: number | null;     // partial waiver: "opinion of value is $__ or more"; additional right: "less than $__"
  appraisal_days: number | null;      // additional right to terminate within N days
  uploaded_forms: string[];           // Form Library form ids picked for this offer, in pick order
  // Notices & compensation (Para 21, Para 12B, broker information)
  buyer_notice_address: string | null; buyer_notice_phone: string | null; buyer_notice_email: string | null;
  listing_broker_firm: string | null; listing_broker_license: string | null; listing_broker_address: string | null;
  listing_agent_name: string | null; listing_agent_license: string | null; listing_agent_email: string | null; listing_agent_phone: string | null;
  buyer_broker_firm: string | null; buyer_broker_license: string | null; buyer_broker_address: string | null;
  buyer_agent_name: string | null; buyer_agent_license: string | null; buyer_agent_email: string | null; buyer_agent_phone: string | null;
  buyer_supervisor_name: string | null; buyer_supervisor_license: string | null;
  buyer_broker_comp_type: "percent" | "amount" | null;
  buyer_broker_comp_value: number | null;
  /** Extra Terms that only Uploaded forms ask for (see TERM_CATALOG, onScreen: false). */
  extra: Record<string, string>;
  /** Blanks the agent marked Intentional on the Preview ("formId:fieldName"). */
  intentional_blanks: string[];
  /** Term keys the agent has edited by hand. Brokerage computations never overwrite these. */
  touched: string[];
  /** The last Ren import into this offer (docs/REN_IMPORT_FORMAT.md), for the "Terms imported" line. */
  imported: ImportNote | null;
};
export type ImportNote = {
  /** "ren": a Ren terms file. "document": read from an uploaded document (facts only). */
  kind: "ren" | "document";
  at: string; file_name: string | null; prepared: string | null; mls_number: string | null;
  filled: string[]; kept: string[]; unknown: string[]; unused: string[]; problems: string[];
  /** Document fill: what the reader couldn't find or wasn't sure of (left blank). */
  could_not_read: string[];
  /** Addenda the source suggests; never checked on their own. */
  suggestions: OfferAddendum[];
};

export function emptyTerms(): OfferTerms {
  return {
    buyers: [], buyer_contact_ids: [], sellers: [],
    property_street: null, property_city: null, property_zip: null, property_county: null, lot: null, block: null, subdivision: null, year_built: null,
    sales_price: null, earnest_money: null, option_fee: null, option_period_days: null,
    financing_type: null, financed_amount: null, loan_term_years: null, loan_rate_cap: null, loan_origination_cap: null, fin_approval_days: null,
    closing_date: null, possession: "closing_and_funding",
    title_company: null, title_company_address: null, title_policy_payer: null, survey_option: null, survey_days: null, survey_new_payer: null,
    addenda: [], hoa_association: null, hoa_info_days: null, hoa_fee_cap: null,
    appraisal_option: null, appraisal_value: null, appraisal_days: null, uploaded_forms: [],
    buyer_notice_address: null, buyer_notice_phone: null, buyer_notice_email: null,
    listing_broker_firm: null, listing_broker_license: null, listing_broker_address: null, listing_agent_name: null, listing_agent_license: null, listing_agent_email: null, listing_agent_phone: null,
    buyer_broker_firm: null, buyer_broker_license: null, buyer_broker_address: null,
    buyer_agent_name: null, buyer_agent_license: null, buyer_agent_email: null, buyer_agent_phone: null,
    buyer_supervisor_name: null, buyer_supervisor_license: null,
    buyer_broker_comp_type: null, buyer_broker_comp_value: null,
    extra: {}, intentional_blanks: [], touched: [], imported: null,
  };
}

/** Fill in anything missing from older saved Terms (and drop unknown keys). */
export function normalizeTerms(raw: unknown): OfferTerms {
  const base = emptyTerms();
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(base)) if (k in src && src[k] !== undefined) out[k] = src[k];
  // Saved before hand-edits were tracked: a value already there was the agent's, so keep it.
  if (!Array.isArray(src.touched)) out.touched = COMPUTED_KEYS.filter((k) => src[k] != null && src[k] !== "");
  return enforceRules(out as OfferTerms);
}

/**
 * Rules the screen and the packet both obey:
 * - any loan type includes the Financing Addendum (locked on); cash removes it and its fields' effect
 * - the Appraisal addendum is only for a Financing Addendum loan that is not FHA or VA (printed on the 49-1)
 */
export function enforceRules(t: OfferTerms): OfferTerms {
  const addenda = new Set(t.addenda.filter((a) => (OFFER_ADDENDA as readonly string[]).includes(a)));
  if (isLoan(t.financing_type)) addenda.add("third_party_financing"); else addenda.delete("third_party_financing");
  if (!appraisalAllowed(t.financing_type)) addenda.delete("appraisal_termination");
  return { ...t, addenda: OFFER_ADDENDA.filter((a) => addenda.has(a)) };
}

export const appraisalAllowed = (f: OfferFinancing | null | undefined) => f === "conventional" || f === "other";
export const suggestLeadPaint = (t: Pick<OfferTerms, "year_built">) => t.year_built != null && t.year_built < 1978;

export const cashPortion = (t: OfferTerms) =>
  t.sales_price == null ? null : isLoan(t.financing_type) ? (t.financed_amount == null ? null : t.sales_price - t.financed_amount) : t.sales_price;

/** What must be filled before export. Everything else shows up in Blanks left instead. */
export function exportBlockers(t: OfferTerms): string[] {
  const out: string[] = [];
  if (!t.buyers.some((b) => b.trim())) out.push("Buyer name");
  if (!t.property_street?.trim()) out.push("Property address");
  if (t.sales_price == null) out.push("Sales price");
  if (isLoan(t.financing_type)) {
    if (t.financed_amount == null) out.push("Loan amount (Financing Addendum)");
    if (t.loan_term_years == null) out.push("Loan term (Financing Addendum)");
    if (t.loan_rate_cap == null) out.push("Interest rate cap (Financing Addendum)");
  }
  if (t.sales_price != null && t.financed_amount != null && isLoan(t.financing_type) && t.financed_amount > t.sales_price)
    out.push("Loan amount is more than the sales price");
  return out;
}

/** "10 days after the effective date": deadline previews never show calendar dates before execution. */
export function deadlinePreview(t: OfferTerms) {
  const rows: { label: string; when: string }[] = [];
  rows.push({ label: "Earnest money and option fee to escrow", when: "3 days after the effective date" });
  if (t.option_period_days != null) rows.push({ label: "Option period ends", when: `${t.option_period_days} days after the effective date` });
  if (t.survey_days != null && t.survey_option) rows.push({ label: "Survey", when: `${t.survey_days} days after the effective date` });
  if (t.addenda.includes("hoa") && t.hoa_info_days != null) rows.push({ label: "HOA subdivision information", when: `${t.hoa_info_days} days after the effective date` });
  if (isLoan(t.financing_type) && t.fin_approval_days != null) rows.push({ label: "Buyer approval (financing)", when: `${t.fin_approval_days} days after the effective date` });
  if (t.addenda.includes("appraisal_termination") && t.appraisal_option === "additional_right" && t.appraisal_days != null)
    rows.push({ label: "Appraisal termination right", when: `${t.appraisal_days} days after the effective date` });
  if (t.closing_date) rows.push({ label: "Closing", when: `On or before ${formatDate(t.closing_date)}` });
  return rows;
}

export const lastName = (full: string) => {
  const parts = full.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  const suffix = new Set(["jr", "sr", "ii", "iii", "iv"]);
  while (parts.length > 1 && suffix.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  return parts[parts.length - 1] ?? "";
};

/** "Offer - 17 W Brookhollow Dr - Kidd.pdf" (" v2" and up for later exports). */
export function packetFileName(t: OfferTerms, version: number) {
  const names = [...new Set(t.buyers.map(lastName).filter(Boolean))].join(" & ");
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").trim();
  return `Offer - ${clean(t.property_street ?? "Property")} - ${clean(names || "Buyer")}${version > 1 ? ` v${version}` : ""}.pdf`;
}

// ---------- Term catalog: what an Uploaded form's field can be mapped to ----------
type Kind = "text" | "money" | "days" | "date" | "names" | "number" | "percent";
export type CatalogTerm = { key: string; label: string; kind: Kind; onScreen: boolean };

export const TERM_CATALOG: CatalogTerm[] = [
  { key: "buyers", label: "Buyer name(s)", kind: "names", onScreen: true },
  { key: "sellers", label: "Seller name(s)", kind: "names", onScreen: true },
  { key: "property_address_line", label: "Property address (street, city, ZIP)", kind: "text", onScreen: true },
  { key: "property_street", label: "Property street address", kind: "text", onScreen: true },
  { key: "property_city", label: "City", kind: "text", onScreen: true },
  { key: "property_zip", label: "ZIP", kind: "text", onScreen: true },
  { key: "property_county", label: "County", kind: "text", onScreen: true },
  { key: "lot", label: "Lot", kind: "text", onScreen: true },
  { key: "block", label: "Block", kind: "text", onScreen: true },
  { key: "subdivision", label: "Subdivision / addition", kind: "text", onScreen: true },
  { key: "sales_price", label: "Sales price", kind: "money", onScreen: true },
  { key: "earnest_money", label: "Earnest money", kind: "money", onScreen: true },
  { key: "option_fee", label: "Option fee", kind: "money", onScreen: true },
  { key: "option_period_days", label: "Option period (days)", kind: "days", onScreen: true },
  { key: "financed_amount", label: "Loan amount", kind: "money", onScreen: true },
  { key: "cash_portion", label: "Cash portion of sales price", kind: "money", onScreen: true },
  { key: "closing_date", label: "Closing date", kind: "date", onScreen: true },
  { key: "title_company", label: "Title company", kind: "text", onScreen: true },
  { key: "survey_days", label: "Survey (days)", kind: "days", onScreen: true },
  { key: "listing_broker_firm", label: "Listing broker firm", kind: "text", onScreen: true },
  { key: "listing_agent_name", label: "Listing agent name", kind: "text", onScreen: true },
  { key: "buyer_broker_firm", label: "Buyer's broker firm", kind: "text", onScreen: true },
  { key: "buyer_broker_license", label: "Buyer's broker license no.", kind: "text", onScreen: true },
  { key: "buyer_agent_name", label: "Buyer's agent name", kind: "text", onScreen: true },
  { key: "buyer_agent_license", label: "Buyer's agent license no.", kind: "text", onScreen: true },
  { key: "buyer_agent_email", label: "Buyer's agent email", kind: "text", onScreen: true },
  { key: "buyer_agent_phone", label: "Buyer's agent phone", kind: "text", onScreen: true },
  // Asked only when a picked Uploaded form maps them:
  { key: "extra:seller_concession", label: "Seller concession amount", kind: "money", onScreen: false },
  { key: "extra:additional_earnest_money", label: "Additional earnest money", kind: "money", onScreen: false },
  { key: "extra:other_property_address", label: "Buyer's other property address (sale contingency)", kind: "text", onScreen: false },
  { key: "extra:other_property_days", label: "Days to sell buyer's other property", kind: "days", onScreen: false },
  { key: "extra:repairs", label: "Requested repairs", kind: "text", onScreen: false },
  { key: "extra:non_realty_items", label: "Non-realty items", kind: "text", onScreen: false },
  { key: "extra:non_realty_value", label: "Non-realty items value", kind: "money", onScreen: false },
  { key: "extra:special_note", label: "Other information (free text)", kind: "text", onScreen: false },
];
export const CATALOG_BY_KEY = new Map(TERM_CATALOG.map((c) => [c.key, c]));

/** Plain-text value of a catalog Term, formatted for a form blank. */
export function termText(t: OfferTerms, key: string): string {
  const money = (n: number | null) => (n == null ? "" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  switch (key) {
    case "buyers": return joinNames(t.buyers);
    case "sellers": return joinNames(t.sellers);
    case "property_address_line": return addressLine(t);
    case "sales_price": case "earnest_money": case "option_fee": case "financed_amount": return money(t[key]);
    case "cash_portion": return money(cashPortion(t));
    case "closing_date": return t.closing_date ? formatDate(t.closing_date) : "";
    case "option_period_days": case "survey_days": return t[key] == null ? "" : String(t[key]);
    default: {
      if (key.startsWith("extra:")) {
        const v = t.extra[key.slice(6)] ?? "";
        const kind = CATALOG_BY_KEY.get(key)?.kind;
        return kind === "money" && v !== "" && !isNaN(Number(v)) ? money(Number(v)) : v;
      }
      const v = (t as unknown as Record<string, unknown>)[key];
      return v == null ? "" : String(v);
    }
  }
}

export const joinNames = (names: string[]) => {
  const n = names.map((s) => s.trim()).filter(Boolean);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};
export const addressLine = (t: Pick<OfferTerms, "property_street" | "property_city" | "property_zip">) =>
  [t.property_street, [t.property_city, ["TX", t.property_zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");

/** "November 11" and "26" for the 20-19's "on or before ____, 20__". */
export function closingParts(iso: string | null): { monthDay: string; yy: string } | null {
  if (!isValidISO(iso)) return null;
  const d = parseISO(iso!);
  return { monthDay: d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }), yy: iso!.slice(2, 4) };
}


export const OFFER_STATUS_LABEL: Record<string, string> = { draft_offer: "Draft", out_for_signature: "Out for signature", executed: "Executed" };

// ---------- Brokerage computations ----------
// Standard values a brokerage writes on every offer. They prefill, stay editable, and stop moving
// once the agent edits that Term by hand (OfferTerms.touched).

export type OfferDefaults = {
  earnest_pct: number;          // earnest money = this % of the sales price...
  earnest_round: number;        // ...rounded down to this step
  option_tier1_max: number; option_tier1_fee: number;   // fee up to and including tier1_max
  option_tier2_max: number; option_tier2_fee: number;   // above tier1_max, up to and including tier2_max
  option_tier3_fee: number;                             // above tier2_max
  option_period_days: number;
  title_policy_payer: "seller" | "buyer";             // Para 6A
  survey_option: SurveyOption;                        // Para 6C
  survey_days: number;
  survey_new_payer: "seller" | "buyer";               // Para 6C(1): if the existing survey isn't accepted
};
/** Clear Rock's values; also what a brokerage gets until it changes them. */
export const STANDARD_OFFER_DEFAULTS: OfferDefaults = {
  earnest_pct: 1, earnest_round: 100,
  option_tier1_max: 300000, option_tier1_fee: 100, option_tier2_max: 400000, option_tier2_fee: 150, option_tier3_fee: 250,
  option_period_days: 10,
  title_policy_payer: "seller", survey_option: "seller_existing", survey_days: 5, survey_new_payer: "buyer",
};
const CHOICES: Partial<Record<keyof OfferDefaults, readonly string[]>> = {
  title_policy_payer: ["seller", "buyer"], survey_option: ["seller_existing", "buyer_new", "seller_new"], survey_new_payer: ["seller", "buyer"],
};

const COMPUTED_KEYS = ["earnest_money", "option_fee", "option_period_days", "title_company", "title_policy_payer", "survey_option", "survey_days", "survey_new_payer"] as const;

export function normalizeDefaults(raw: unknown): OfferDefaults {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...STANDARD_OFFER_DEFAULTS };
  for (const k of Object.keys(out) as (keyof OfferDefaults)[]) {
    const allowed = CHOICES[k];
    if (allowed) { if (allowed.includes(String(src[k]))) out[k] = src[k]; continue; }
    const v = Number(src[k]);
    if (src[k] != null && src[k] !== "" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out as OfferDefaults;
}

/** 1% of $135,000 is $1,350, rounded down to the $100 step: $1,300. */
export function computedEarnest(price: number, d: OfferDefaults) {
  const step = d.earnest_round > 0 ? d.earnest_round : 1;
  return Math.floor((price * d.earnest_pct) / 100 / step + 1e-9) * step;
}
export function computedOptionFee(price: number, d: OfferDefaults) {
  return price <= d.option_tier1_max ? d.option_tier1_fee : price <= d.option_tier2_max ? d.option_tier2_fee : d.option_tier3_fee;
}

/**
 * Fill the computed and standard values into every Term the agent hasn't edited by hand.
 * Earnest money and option fee follow the price; the rest fill only while empty.
 */
export function applyBrokerageDefaults(t: OfferTerms, d: OfferDefaults, brokerageTitleCompany?: string | null): OfferTerms {
  const free = (k: keyof OfferTerms) => !t.touched.includes(k);
  const out = { ...t };
  if (free("earnest_money")) out.earnest_money = t.sales_price == null ? null : computedEarnest(t.sales_price, d);
  if (free("option_fee")) out.option_fee = t.sales_price == null ? null : computedOptionFee(t.sales_price, d);
  if (free("option_period_days") && out.option_period_days == null) out.option_period_days = d.option_period_days;
  if (free("title_company") && !out.title_company && brokerageTitleCompany) out.title_company = brokerageTitleCompany;
  if (free("title_policy_payer") && out.title_policy_payer == null) out.title_policy_payer = d.title_policy_payer;
  if (free("survey_option") && out.survey_option == null) out.survey_option = d.survey_option;
  // The day count belongs to the brokerage's usual survey choice; another choice starts with its days blank.
  if (free("survey_days") && out.survey_days == null && out.survey_option === d.survey_option) out.survey_days = d.survey_days;
  if (free("survey_new_payer") && out.survey_new_payer == null && out.survey_option === "seller_existing") out.survey_new_payer = d.survey_new_payer;
  return out;
}
