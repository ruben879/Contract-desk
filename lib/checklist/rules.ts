import { applies, hasAddendum as has, type Conditions, type DealContext, type Side } from "@/lib/rules";

// Every checklist task lives here. Standard tasks apply to every deal on the listed sides;
// triggered tasks appear only when their condition matches what's in the file.
// To add or edit a task, change this list. Keys must stay stable once deals use them.

export type { Side };
export type ChecklistContext = DealContext;

export type ChecklistRule = Conditions & {
  key: string;
  title: string;
  section: "Contract" | "Option period" | "Financing" | "HOA" | "Disclosures" | "Title and survey" | "Closing" | "Other";
  deadline_key?: string;
  reason?: string;                         // shown on triggered tasks
  startsDone?: boolean;                    // tasks the intake itself completes
};

const buyerSide: Side[] = ["buyer", "both"];

export const CHECKLIST_RULES: ChecklistRule[] = [
  // ---- Standard ----
  { key: "executed_contract", title: "Executed contract in the file", section: "Contract", startsDone: true },
  { key: "details_confirmed", title: "Contract details confirmed", section: "Contract", startsDone: true },
  { key: "contract_to_title", title: "Send executed contract to title company", section: "Contract" },
  { key: "earnest_delivered", title: "Earnest money and option fee delivered", section: "Contract", deadline_key: "earnest_money" },
  { key: "earnest_receipt", title: "Earnest money receipt from title in the file", section: "Contract", deadline_key: "earnest_money" },

  { key: "inspections_scheduled", title: "Schedule inspections", section: "Option period", deadline_key: "option_end", sides: buyerSide },
  { key: "option_decision", title: "Option period decision: proceed, amend, or terminate", section: "Option period", deadline_key: "option_end" },

  { key: "title_commitment", title: "Title commitment received and reviewed", section: "Title and survey", deadline_key: "title_commitment" },
  { key: "survey", title: "Survey or T-47 affidavit delivered", section: "Title and survey", deadline_key: "survey" },

  { key: "walkthrough", title: "Final walkthrough scheduled", section: "Closing", deadline_key: "closing", sides: buyerSide },
  { key: "settlement_review", title: "Settlement statement reviewed", section: "Closing", deadline_key: "closing" },
  { key: "closed", title: "Closed and funded", section: "Closing", deadline_key: "closing" },

  // ---- Triggered: financing ----
  { key: "fin_contract_to_lender", title: "Send executed contract to lender", section: "Financing", sides: buyerSide,
    when: has("third_party_financing"), reason: "Third Party Financing Addendum is in the file" },
  { key: "fin_appraisal_ordered", title: "Confirm appraisal is ordered", section: "Financing",
    when: has("third_party_financing"), reason: "Third Party Financing Addendum is in the file" },
  { key: "fin_appraisal_received", title: "Appraisal received", section: "Financing",
    when: has("third_party_financing"), reason: "Third Party Financing Addendum is in the file" },
  { key: "fin_buyer_approval", title: "Buyer approval (financing) confirmed", section: "Financing",
    when: has("third_party_financing"), reason: "Third Party Financing Addendum is in the file" },
  { key: "fin_clear_to_close", title: "Lender clear to close", section: "Financing", deadline_key: "closing",
    when: has("third_party_financing"), reason: "Third Party Financing Addendum is in the file" },

  { key: "seller_fin_terms", title: "Seller financing terms documented and sent to title", section: "Financing",
    when: (c) => c.addenda.includes("seller_financing") || c.financing_type === "seller_financing",
    reason: "Seller financing is part of this deal" },
  { key: "assumption_approval", title: "Loan assumption approval from lender", section: "Financing",
    when: (c) => c.addenda.includes("loan_assumption") || c.financing_type === "loan_assumption",
    reason: "Loan assumption is part of this deal" },

  // ---- Triggered: HOA ----
  { key: "hoa_request_docs", title: "Request HOA subdivision information and resale certificate", section: "HOA",
    when: has("hoa"), reason: "HOA addendum is in the file" },
  { key: "hoa_deliver_docs", title: "HOA documents delivered to buyer", section: "HOA",
    when: has("hoa"), reason: "HOA addendum is in the file" },
  { key: "hoa_review_window", title: "Track buyer's HOA document review window", section: "HOA", sides: buyerSide,
    when: has("hoa"), reason: "HOA addendum is in the file" },

  // ---- Triggered: disclosures ----
  { key: "get_sellers_disclosure", title: "Get Seller's Disclosure signed and delivered", section: "Disclosures",
    when: (c) => c.seller_disclosure === "not_received" ||
      (c.seller_disclosure !== "not_required" && c.seller_disclosure !== "received" && !c.addenda.includes("sellers_disclosure")),
    reason: "No Seller's Disclosure found in the file" },
  { key: "lbp_pamphlet", title: "Lead-based paint addendum signed and pamphlet delivered", section: "Disclosures",
    when: has("lead_based_paint"), reason: "Lead-based paint addendum is in the file" },

  // ---- Triggered: other ----
  { key: "other_property_sale", title: "Track buyer's sale of other property contingency", section: "Other",
    when: has("sale_of_other_property"), reason: "Sale of Other Property addendum is in the file" },
  { key: "temp_lease_terms", title: "Confirm temporary lease terms and possession date", section: "Other",
    when: (c) => c.addenda.includes("buyers_temp_lease") || c.addenda.includes("sellers_temp_lease"),
    reason: "A temporary residential lease is in the file" },
  { key: "backup_status", title: "Track status of the primary contract", section: "Other",
    when: has("back_up_contract"), reason: "This is a back-up contract" },
];

export function buildChecklist(ctx: ChecklistContext) {
  return CHECKLIST_RULES
    .filter((r) => applies(r, ctx))
    .map((r, i) => ({
      rule_key: r.key,
      title: r.title,
      section: r.section,
      reason: r.when || r.contractTypes ? r.reason ?? null : null,
      deadline_key: r.deadline_key ?? null,
      status: r.startsDone ? ("done" as const) : ("open" as const),
      sort: i,
    }));
}
