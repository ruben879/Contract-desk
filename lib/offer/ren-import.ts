import { isValidISO } from "@/lib/dates";
import { enforceRules, OFFER_FINANCING, type AppraisalOption, type ImportNote, type OfferAddendum, type OfferTerms, type SurveyOption } from "./terms";

// Ren import, format version 1: a terms sheet Ren stages from FlexMLS and the appraisal district,
// read straight into an offer. The published contract is docs/REN_IMPORT_FORMAT.md; this table is
// its single source (a test checks every key here is documented there).
//
// Blanks only: an imported value fills a Term that is empty or still holds a computed/standard
// value, and never replaces a value the agent entered. Whatever it fills counts as hand-entered.

export const REN_IMPORT_VERSION = 1;

type Kind = "text" | "number" | "date" | "bool" | "names" | "enum" | "version";
export type ImportKey = {
  path: string; kind: Kind; meaning: string;
  /** The Terms field it fills, in words for the doc. null = read, not used (no place on the offer yet). */
  term: string | null;
  values?: readonly string[];
};

export const IMPORT_KEYS: ImportKey[] = [
  { path: "ren_import_version", kind: "version", meaning: "Format version. Must be 1.", term: null },
  { path: "source.prepared", kind: "date", meaning: "Date Ren prepared the sheet (YYYY-MM-DD).", term: "Shown in the \"Terms imported\" line" },
  { path: "source.mls_number", kind: "text", meaning: "MLS number of the listing.", term: "Shown in the \"Terms imported\" line" },
  { path: "source.notes", kind: "text", meaning: "Ren's notes about the sheet.", term: null },

  { path: "parties.buyers[].name", kind: "names", meaning: "Each buyer's full name, as it should read in Para 1.", term: "buyers" },
  { path: "parties.buyers[].email", kind: "text", meaning: "Buyer email. The first buyer's is used for Para 21 notices.", term: "buyer_notice_email (first buyer)" },
  { path: "parties.buyers[].phone", kind: "text", meaning: "Buyer phone. The first buyer's is used for Para 21 notices.", term: "buyer_notice_phone (first buyer)" },
  { path: "parties.sellers[].name", kind: "names", meaning: "Each seller's name as of record (an estate or trust as styled).", term: "sellers" },

  { path: "property.address", kind: "text", meaning: "Street address.", term: "property_street" },
  { path: "property.city", kind: "text", meaning: "City.", term: "property_city" },
  { path: "property.state", kind: "text", meaning: "State. Must be TX; not stored (the forms are Texas forms).", term: null },
  { path: "property.zip", kind: "text", meaning: "ZIP code.", term: "property_zip" },
  { path: "property.county", kind: "text", meaning: "County.", term: "property_county" },
  { path: "property.legal_description", kind: "text", meaning: "Legal description in the form \"Lot 377, Block 4, Beverly Heights Addition\" (Block optional). Split into Lot, Block and Addition for Para 2A; anything that doesn't split cleanly is reported and left for typing.", term: "lot, block, subdivision" },
  { path: "property.lot", kind: "text", meaning: "Lot, when given separately (wins over legal_description).", term: "lot" },
  { path: "property.block", kind: "text", meaning: "Block, when given separately.", term: "block" },
  { path: "property.subdivision", kind: "text", meaning: "Addition or subdivision name, without the word \"Addition\" (the form prints it).", term: "subdivision" },
  { path: "property.year_built", kind: "number", meaning: "Year built (suggests the lead-based paint addendum before 1978).", term: "year_built" },
  { path: "property.hoa", kind: "bool", meaning: "Whether the property is in a mandatory owners association. Informational: the HOA addendum box follows addenda.hoa.", term: null },

  { path: "terms.sales_price", kind: "number", meaning: "Sales price in dollars.", term: "sales_price" },
  { path: "terms.financing", kind: "enum", values: OFFER_FINANCING, meaning: "Financing selector.", term: "financing_type" },
  { path: "terms.cash_down", kind: "number", meaning: "Cash portion (Para 3A). Checked against price minus loan; used to work out the loan amount only when the loan amount is missing.", term: "financed_amount (only when financing_addendum.loan_amount is missing)" },
  { path: "terms.earnest_money", kind: "number", meaning: "Earnest money.", term: "earnest_money" },
  { path: "terms.option_fee", kind: "number", meaning: "Option fee.", term: "option_fee" },
  { path: "terms.option_period_days", kind: "number", meaning: "Option period in days.", term: "option_period_days" },
  { path: "terms.closing_date", kind: "date", meaning: "Closing on or before (YYYY-MM-DD).", term: "closing_date" },
  { path: "terms.possession", kind: "enum", values: ["closing_and_funding"], meaning: "Possession. Only closing_and_funding is supported.", term: "possession (fixed)" },
  { path: "terms.title_company", kind: "text", meaning: "Title company (Para 6A) and escrow agent (Para 5A).", term: "title_company" },
  { path: "terms.escrow_agent", kind: "text", meaning: "Escrow agent. Same field as title_company; if both are given they must match.", term: "title_company" },
  { path: "terms.title_company_address", kind: "text", meaning: "Title company address.", term: null },
  { path: "terms.title_company_phone", kind: "text", meaning: "Title company phone.", term: null },
  { path: "terms.title_policy_payer", kind: "enum", values: ["seller", "buyer"], meaning: "Owner's title policy paid by (Para 6A).", term: "title_policy_payer" },
  { path: "terms.survey.option", kind: "enum", values: ["6C(1)", "6C(2)", "6C(3)"], meaning: "Survey paragraph: 6C(1) Seller's existing survey, 6C(2) Buyer's new survey, 6C(3) Seller's new survey.", term: "survey_option" },
  { path: "terms.survey.furnish_days", kind: "number", meaning: "Days to furnish the survey.", term: "survey_days" },
  { path: "terms.survey.new_survey_payer", kind: "enum", values: ["seller", "buyer"], meaning: "6C(1) only: who pays a new survey if the existing one isn't accepted.", term: "survey_new_payer" },
  { path: "terms.residential_service_contract", kind: "number", meaning: "Residential service contract amount.", term: null },

  { path: "financing_addendum.loan_type", kind: "enum", values: OFFER_FINANCING.filter((f) => f !== "cash"), meaning: "Loan type. Used when terms.financing is missing; must agree with it when both are given.", term: "financing_type" },
  { path: "financing_addendum.loan_amount", kind: "number", meaning: "Loan amount.", term: "financed_amount" },
  { path: "financing_addendum.term_years", kind: "number", meaning: "Loan term in years.", term: "loan_term_years" },
  { path: "financing_addendum.rate_cap_pct", kind: "number", meaning: "Interest rate cap, percent (7.75 = 7.75%).", term: "loan_rate_cap" },
  { path: "financing_addendum.origination_cap_pct", kind: "number", meaning: "Origination charges cap, percent.", term: null },
  { path: "financing_addendum.buyer_approval.applies", kind: "bool", meaning: "Whether the offer is subject to Buyer Approval (40-11 Para 2A). false leaves it off.", term: "fin_approval_days (with days)" },
  { path: "financing_addendum.buyer_approval.days", kind: "number", meaning: "Days for Buyer Approval.", term: "fin_approval_days" },

  { path: "appraisal_addendum.option", kind: "enum", values: ["1", "2", "3"], meaning: "49-1 paragraph: 1 waiver, 2 partial waiver, 3 additional right to terminate. Including this object includes the addendum (Conventional or Other financing only).", term: "addenda: appraisal_termination; appraisal_option" },
  { path: "appraisal_addendum.days", kind: "number", meaning: "Option 3: days to terminate.", term: "appraisal_days" },
  { path: "appraisal_addendum.floor_price", kind: "number", meaning: "Options 2 and 3: the opinion-of-value amount.", term: "appraisal_value" },

  { path: "addenda.hoa", kind: "bool", meaning: "true includes the HOA addendum (TREC 36-11). false or missing leaves the box as it is.", term: "addenda: hoa" },
  { path: "addenda.lead_based_paint", kind: "bool", meaning: "true includes the lead-based paint addendum (TREC 56-0). false or missing leaves it as it is.", term: "addenda: lead_based_paint" },
  { path: "addenda.residential_lease", kind: "bool", meaning: "Residential lease addendum. Not a form the Offer Writer includes yet.", term: null },
  { path: "hoa_addendum.association", kind: "text", meaning: "Association name and phone (36-11).", term: "hoa_association" },
  { path: "hoa_addendum.info_days", kind: "number", meaning: "Days to deliver the subdivision information (36-11).", term: "hoa_info_days" },
  { path: "hoa_addendum.fee_cap", kind: "number", meaning: "Buyer pays association fees up to this amount (36-11).", term: "hoa_fee_cap" },

  { path: "broker_compensation.buyer_agent_comp_pct", kind: "number", meaning: "Buyer's broker compensation as a percent of the price (Para 12B).", term: "buyer_broker_comp_type = percent, buyer_broker_comp_value" },
  { path: "broker_compensation.buyer_agent_comp_amount", kind: "number", meaning: "Buyer's broker compensation as a dollar amount (use one or the other).", term: "buyer_broker_comp_type = amount, buyer_broker_comp_value" },

  { path: "listing_side.brokerage_name", kind: "text", meaning: "Listing brokerage.", term: "listing_broker_firm" },
  { path: "listing_side.brokerage_license", kind: "text", meaning: "Listing brokerage license number.", term: "listing_broker_license" },
  { path: "listing_side.brokerage_address", kind: "text", meaning: "Listing brokerage address (broker information page).", term: "listing_broker_address" },
  { path: "listing_side.brokerage_phone", kind: "text", meaning: "Listing brokerage phone.", term: null },
  { path: "listing_side.agent_name", kind: "text", meaning: "Listing agent.", term: "listing_agent_name" },
  { path: "listing_side.agent_license", kind: "text", meaning: "Listing agent license number.", term: "listing_agent_license" },
  { path: "listing_side.agent_email", kind: "text", meaning: "Listing agent email.", term: "listing_agent_email" },
  { path: "listing_side.agent_phone", kind: "text", meaning: "Listing agent phone.", term: "listing_agent_phone" },

  { path: "notices.buyer_notice_address", kind: "text", meaning: "Buyer's mailing address for Para 21 notices.", term: "buyer_notice_address" },
  { path: "notices.buyer_notice_name", kind: "text", meaning: "Name notices go to.", term: null },
  { path: "notices.buyer_copy_to_email", kind: "text", meaning: "Email copied on buyer notices.", term: null },
  { path: "notices.seller_notice_via", kind: "text", meaning: "How the seller receives notices.", term: null },
];

/** Terms with no import key (documented as such). */
export const TERMS_WITHOUT_IMPORT_KEY: { term: string; why: string }[] = [
  { term: "buyer_contact_ids", why: "Links to contacts; the typed buyer names become contacts at Preview." },
  { term: "uploaded_forms, extra", why: "Library forms and their extra Terms are picked per offer." },
  { term: "buyer_broker_firm, buyer_broker_license, buyer_broker_address, buyer_agent_name, buyer_agent_license, buyer_agent_email, buyer_agent_phone, buyer_supervisor_name, buyer_supervisor_license", why: "Our own side comes from the brokerage and agent profiles." },
  { term: "intentional_blanks, touched, imported", why: "Bookkeeping the app keeps itself." },
];

const KEY_BY_PATH = new Map(IMPORT_KEYS.map((k) => [k.path, k]));

/** Every leaf path in the file, with array items written as "[]". */
function leaves(v: unknown, prefix = ""): { path: string; value: unknown }[] {
  if (Array.isArray(v)) return v.flatMap((x) => leaves(x, `${prefix}[]`));
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => leaves(x, prefix ? `${prefix}.${k}` : k));
  return [{ path: prefix, value: v }];
}

const get = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), o);

export type ParsedImport = {
  /** Values to place, by Terms field. */
  values: Partial<OfferTerms>;
  addenda: OfferAddendum[];
  unknown: string[]; unused: string[]; problems: string[];
  prepared: string | null; mls_number: string | null;
};

export class ImportRefused extends Error {}

/** Lot / Block / Addition from "Lot 377, Block 4, Beverly Heights Addition". null if it doesn't split cleanly. */
export function splitLegal(desc: string): { lot: string; block: string | null; subdivision: string } | null {
  const m = desc.trim().match(/^Lot\s+([\w-]+)\s*,?\s*(?:Block\s+([\w-]+)\s*,?\s*)?(.+?)\s*$/i);
  if (!m) return null;
  const subdivision = m[3].replace(/^,\s*/, "").replace(/\s+(Addition|Addn\.?|Add\.?)$/i, "").trim();
  if (!subdivision || /\b(lot|block|tract|section|survey|acres?)\b/i.test(subdivision)) return null;
  return { lot: m[1], block: m[2] ?? null, subdivision };
}

export function parseRenImport(raw: unknown): ParsedImport {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ImportRefused("That file isn't a terms file. It should be the JSON file Ren prepares.");
  const version = get(raw, "ren_import_version");
  if (version !== REN_IMPORT_VERSION) throw new ImportRefused(version == null
    ? "That file has no ren_import_version, so it isn't a Ren terms file."
    : `That terms file is version ${String(version)}. This app reads version ${REN_IMPORT_VERSION}.`);

  const out: ParsedImport = { values: {}, addenda: [], unknown: [], unused: [], problems: [], prepared: null, mls_number: null };
  const seen = new Set<string>();
  for (const { path, value } of leaves(raw)) {
    if (seen.has(path)) continue;
    seen.add(path);
    const spec = KEY_BY_PATH.get(path);
    if (!spec) out.unknown.push(path);
    else if (spec.term === null && path !== "ren_import_version" && value != null) out.unused.push(path);
  }

  const v = out.values;
  const text = (path: string) => { const x = get(raw, path); return typeof x === "string" && x.trim() ? x.trim() : typeof x === "number" ? String(x) : null; };
  const num = (path: string) => {
    const x = get(raw, path);
    if (x == null || x === "") return null;
    const n = typeof x === "number" ? x : Number(String(x).replace(/[$,%\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) { out.problems.push(`${path}: "${String(x)}" isn't a number`); return null; }
    return n;
  };
  const date = (path: string) => {
    const x = text(path);
    if (x && !isValidISO(x)) { out.problems.push(`${path}: "${x}" isn't a date (YYYY-MM-DD)`); return null; }
    return x;
  };
  const choice = <T extends string>(path: string, allowed: readonly string[]) => {
    const x = text(path);
    if (x == null) return null;
    if (!allowed.includes(x)) { out.problems.push(`${path}: "${x}" isn't one of ${allowed.join(", ")}`); return null; }
    return x as T;
  };
  const set = <K extends keyof OfferTerms>(k: K, x: OfferTerms[K] | null) => { if (x != null) v[k] = x; };

  out.prepared = date("source.prepared");
  out.mls_number = text("source.mls_number");

  // Parties
  const buyers = get(raw, "parties.buyers");
  if (Array.isArray(buyers)) {
    const names = buyers.map((b) => (b && typeof b === "object" ? String((b as Record<string, unknown>).name ?? "").trim() : "")).filter(Boolean);
    if (names.length) v.buyers = names;
    set("buyer_notice_email", text("parties.buyers.0.email"));
    set("buyer_notice_phone", text("parties.buyers.0.phone"));
  }
  const sellers = get(raw, "parties.sellers");
  if (Array.isArray(sellers)) {
    const names = sellers.map((b) => (b && typeof b === "object" ? String((b as Record<string, unknown>).name ?? "").trim() : "")).filter(Boolean);
    if (names.length) v.sellers = names;
  }

  // Property
  set("property_street", text("property.address"));
  set("property_city", text("property.city"));
  set("property_zip", text("property.zip"));
  set("property_county", text("property.county"));
  const state = text("property.state");
  if (state && state.toUpperCase() !== "TX") out.problems.push(`property.state: "${state}". The TREC forms are for Texas property.`);
  const legal = text("property.legal_description");
  if (legal) {
    const parts = splitLegal(legal);
    if (parts) { set("lot", parts.lot); set("block", parts.block); set("subdivision", parts.subdivision); }
    else out.problems.push(`property.legal_description: "${legal}" doesn't split into lot, block and addition. Type them on the Terms screen.`);
  }
  set("lot", text("property.lot"));
  set("block", text("property.block"));
  set("subdivision", text("property.subdivision")?.replace(/\s+Addition$/i, "") ?? null);
  set("year_built", num("property.year_built"));

  // Money and financing
  set("sales_price", num("terms.sales_price"));
  set("earnest_money", num("terms.earnest_money"));
  set("option_fee", num("terms.option_fee"));
  set("option_period_days", num("terms.option_period_days"));
  const fin = choice<OfferTerms["financing_type"] & string>("terms.financing", OFFER_FINANCING);
  const loanType = choice<OfferTerms["financing_type"] & string>("financing_addendum.loan_type", OFFER_FINANCING.filter((f) => f !== "cash"));
  if (fin && loanType && fin !== loanType) out.problems.push(`terms.financing is "${fin}" but financing_addendum.loan_type is "${loanType}". Used terms.financing.`);
  set("financing_type", fin ?? loanType);
  const loan = num("financing_addendum.loan_amount");
  const down = num("terms.cash_down");
  if (loan != null) set("financed_amount", loan);
  else if (down != null && v.sales_price != null && v.financing_type && v.financing_type !== "cash") set("financed_amount", v.sales_price - down);
  if (loan != null && down != null && v.sales_price != null && v.sales_price - loan !== down)
    out.problems.push(`terms.cash_down is ${down} but sales price minus loan amount is ${v.sales_price - loan}. Used the loan amount.`);
  set("loan_term_years", num("financing_addendum.term_years"));
  set("loan_rate_cap", num("financing_addendum.rate_cap_pct"));
  if (get(raw, "financing_addendum.buyer_approval.applies") === true) {
    const d = num("financing_addendum.buyer_approval.days");
    if (d != null) set("fin_approval_days", d);
    else out.problems.push("financing_addendum.buyer_approval applies but has no days.");
  }

  // Dates, title, survey
  set("closing_date", date("terms.closing_date"));
  choice("terms.possession", ["closing_and_funding"]);
  const title = text("terms.title_company"), escrow = text("terms.escrow_agent");
  if (title && escrow && title !== escrow) out.problems.push(`terms.title_company is "${title}" but terms.escrow_agent is "${escrow}". The form uses one title company for both; used "${title}".`);
  set("title_company", title ?? escrow);
  set("title_policy_payer", choice("terms.title_policy_payer", ["seller", "buyer"]));
  const survey = choice("terms.survey.option", ["6C(1)", "6C(2)", "6C(3)"]);
  set("survey_option", survey ? ({ "6C(1)": "seller_existing", "6C(2)": "buyer_new", "6C(3)": "seller_new" } as Record<string, SurveyOption>)[survey] : null);
  set("survey_days", num("terms.survey.furnish_days"));
  set("survey_new_payer", choice("terms.survey.new_survey_payer", ["seller", "buyer"]));

  // Addenda
  const appraisal = get(raw, "appraisal_addendum");
  if (appraisal && typeof appraisal === "object") {
    out.addenda.push("appraisal_termination");
    const opt = choice("appraisal_addendum.option", ["1", "2", "3"]);
    set("appraisal_option", opt ? ({ "1": "waiver", "2": "partial_waiver", "3": "additional_right" } as Record<string, AppraisalOption>)[opt] : null);
    set("appraisal_days", num("appraisal_addendum.days"));
    set("appraisal_value", num("appraisal_addendum.floor_price"));
  }
  if (get(raw, "addenda.hoa") === true) out.addenda.push("hoa");
  if (get(raw, "addenda.lead_based_paint") === true) out.addenda.push("lead_based_paint");
  set("hoa_association", text("hoa_addendum.association"));
  set("hoa_info_days", num("hoa_addendum.info_days"));
  set("hoa_fee_cap", num("hoa_addendum.fee_cap"));

  // Compensation, listing side, notices
  const pct = num("broker_compensation.buyer_agent_comp_pct"), amt = num("broker_compensation.buyer_agent_comp_amount");
  if (pct != null && amt != null) out.problems.push("broker_compensation has both a percent and an amount. Used the percent.");
  if (pct != null) { set("buyer_broker_comp_type", "percent"); set("buyer_broker_comp_value", pct); }
  else if (amt != null) { set("buyer_broker_comp_type", "amount"); set("buyer_broker_comp_value", amt); }
  set("listing_broker_firm", text("listing_side.brokerage_name"));
  set("listing_broker_license", text("listing_side.brokerage_license"));
  set("listing_broker_address", text("listing_side.brokerage_address"));
  set("listing_agent_name", text("listing_side.agent_name"));
  set("listing_agent_license", text("listing_side.agent_license"));
  set("listing_agent_email", text("listing_side.agent_email"));
  set("listing_agent_phone", text("listing_side.agent_phone"));
  set("buyer_notice_address", text("notices.buyer_notice_address"));
  return out;
}

// `get` reads arrays by index ("parties.buyers.0.email"), which the leaf walk writes as "[]".
const empty = (x: unknown) => x == null || x === "" || (Array.isArray(x) && x.length === 0);

/**
 * Place an import into an offer, blanks only. A Term the agent entered (touched) keeps its value
 * and is listed as kept; everything else the file has lands and becomes hand-entered.
 */
export function applyRenImport(t: OfferTerms, p: ParsedImport, fileName: string | null, now = new Date(),
  extra: Pick<ImportNote, "kind" | "could_not_read" | "suggestions"> = { kind: "ren", could_not_read: [], suggestions: [] }): OfferTerms {
  const out = { ...t } as OfferTerms & Record<string, unknown>;
  const touched = new Set(t.touched);
  const filled: string[] = [], kept: string[] = [];
  for (const [k, val] of Object.entries(p.values)) {
    const mine = touched.has(k) && !empty((t as Record<string, unknown>)[k]);
    if (mine) { if (JSON.stringify((t as Record<string, unknown>)[k]) !== JSON.stringify(val)) kept.push(k); continue; }
    out[k] = val;
    touched.add(k);
    filled.push(k);
  }
  const addenda = new Set(t.addenda);
  for (const a of p.addenda) if (!addenda.has(a)) { addenda.add(a); filled.push(`addenda: ${a}`); }
  out.addenda = [...addenda];
  out.touched = [...touched];
  const note: ImportNote = {
    at: now.toISOString(), file_name: fileName, prepared: p.prepared, mls_number: p.mls_number,
    filled, kept, unknown: p.unknown, unused: p.unused, problems: [...p.problems], ...extra,
  };
  const result = enforceRules({ ...out, imported: note });
  for (const a of p.addenda) if (!result.addenda.includes(a)) note.problems.push(`The ${a.replace(/_/g, " ")} addendum isn't available with ${result.financing_type ?? "no"} financing, so it wasn't included.`);
  return result;
}
