import { describe, expect, it } from "vitest";
import { computeDeadlines, type DeadlineRule } from "@/lib/deadlines/compute";
import { buildChecklist } from "@/lib/checklist/rules";
import { deriveMissingDocs, stillMissing } from "@/lib/missing-docs";
import { slotsFor } from "@/lib/slots";
import { taskTiming } from "@/lib/deal-status";

// Regression for Ren's audit of the Brookhollow A/B test (Oct 31, 2026).
// Rules mirror seed_deadline_rules after migration 0005.
const rules: DeadlineRule[] = [
  { key: "earnest_money", label: "Earnest money and option fee due", contract_ref: "One to Four Contract, Para 5A", anchor: "effective_date", default_days: 3, use_contract_days: false, due_time: null, roll_weekends_holidays: true, needs_verification: true, sort: 1 },
  { key: "option_end", label: "Option period ends", contract_ref: "One to Four Contract, Para 5B", anchor: "effective_date", default_days: null, use_contract_days: true, due_time: "17:00", roll_weekends_holidays: false, needs_verification: true, sort: 2 },
  { key: "title_commitment", label: "Title commitment due", contract_ref: "One to Four Contract, Para 6B", anchor: "effective_date", default_days: 20, use_contract_days: false, due_time: null, roll_weekends_holidays: true, needs_verification: true, sort: 3 },
  // Production had a default on survey: it must be ignored when the contract is blank.
  { key: "survey", label: "Survey due", contract_ref: "One to Four Contract, Para 6C", anchor: "effective_date", default_days: 20, use_contract_days: true, due_time: null, roll_weekends_holidays: true, needs_verification: true, sort: 4 },
  { key: "closing", label: "Closing", contract_ref: "One to Four Contract, Para 9A", anchor: "closing_date", default_days: 0, use_contract_days: false, due_time: null, roll_weekends_holidays: false, needs_verification: false, sort: 5 },
  { key: "hoa_info", label: "HOA subdivision information due", contract_ref: "HOA Addendum, Para A", anchor: "effective_date", default_days: null, use_contract_days: true, due_time: null, roll_weekends_holidays: true, needs_verification: true, sort: 6 },
];

const terms = {
  side: "buyer" as const, financing_type: "conventional" as const, seller_disclosure: "received" as const,
  effective_date: "2026-10-03", closing_date: "2026-11-11", option_period_days: 10, survey_days: null, hoa_info_days: 20,
  addenda: ["third_party_financing", "hoa"] as any[],
};

// What the reader returned: LBP and Non-Realty checked in Para 22 but not attached,
// Seller's Disclosure marked received with no copy in the packet.
const read = {
  addenda: [
    { key: "third_party_financing", evidence: "attached" as const },
    { key: "hoa", evidence: "attached" as const },
    { key: "lead_based_paint", evidence: "checked_only" as const },
    { key: "non_realty_items", evidence: "checked_only" as const },
  ],
  documents: [{ kind: "contract", slot: "contract" }, { kind: "addendum", slot: "hoa_addendum" }],
  seller_disclosure: { value: "received" },
};

describe("Brookhollow: dates", () => {
  const { deadlines, skipped } = computeDeadlines(rules, terms);
  const by = Object.fromEntries(deadlines.map((d) => [d.key, d]));
  it("keeps the dates that were right", () => {
    expect(by.earnest_money.due_date).toBe("2026-10-06");
    expect(by.option_end.due_date).toBe("2026-10-13");
    expect(by.option_end.due_time).toBe("17:00");
    expect(by.closing.due_date).toBe("2026-11-11");
    expect(deadlines.every((d) => d.key === "closing" || d.needs_verification)).toBe(true);
  });
  it("gap 2: the HOA addendum's 20 days land as a deadline (Oct 23)", () => {
    expect(by.hoa_info.due_date).toBe("2026-10-23");
    expect(by.hoa_info.calculation).toContain("per contract");
  });
  it("gap 3: survey left blank in Para 6C gets no invented date", () => {
    expect(by.survey).toBeUndefined();
    expect(skipped).toEqual([expect.objectContaining({ key: "survey", kind: "unresolved" })]);
  });
  it("HOA deadline doesn't exist on a deal without the HOA addendum", () => {
    const r = computeDeadlines(rules, { ...terms, addenda: ["third_party_financing"] });
    expect(r.deadlines.map((d) => d.key)).not.toContain("hoa_info");
    expect(r.skipped.map((s) => s.key)).not.toContain("hoa_info");
  });
  it("HOA addendum with no day count is flagged, not dated", () => {
    const r = computeDeadlines(rules, { ...terms, hoa_info_days: null });
    expect(r.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ key: "hoa_info", kind: "unresolved" })]));
  });
});

describe("Brookhollow: checklist", () => {
  const missing = deriveMissingDocs(read);
  const list = buildChecklist({ ...terms, missing_docs: missing });
  const by = Object.fromEntries(list.map((i) => [i.rule_key, i]));

  it("gap 1: the reader's missing documents are found", () => {
    expect(missing).toEqual(["sellers_disclosure", "lead_based_paint", "non_realty_items"]);
  });
  it("gap 1: each becomes a get-it-in-the-file task in the right section, naming its slot", () => {
    expect(by.missing_lead_based_paint).toMatchObject({ section: "Disclosures", status: "open" });
    expect(by.missing_lead_based_paint.reason).toBe("Checked in Para 22 but not attached. File it under Lead-based paint addendum.");
    expect(by.missing_non_realty_items).toMatchObject({ title: "Get the Non-Realty Items Addendum in the file", section: "Contract" });
    expect(by.missing_non_realty_items.reason).toContain("Other addenda");
    expect(by.missing_sellers_disclosure).toMatchObject({ title: "Get the Seller's Disclosure Notice in the file", section: "Disclosures" });
    expect(by.missing_sellers_disclosure.reason).toContain("Para 7B");
    expect(by.get_sellers_disclosure).toBeUndefined(); // no duplicate task
  });
  it("gap 1: the slot to file it in shows on the deal", () => {
    expect(slotsFor({ ...terms, missing_docs: missing }, new Set()).map((s) => s.key)).toEqual(expect.arrayContaining(["lead_based_paint", "sellers_disclosure", "other_addenda"]));
  });
  it("gap 2: the HOA task carries the HOA deadline", () => {
    expect(by.hoa_request_docs.deadline_key).toBe("hoa_info");
  });
  it("gap 3: the survey task is flagged as needs attention, not undated 'anytime'", () => {
    expect(by.survey.deadline_key).toBe("survey");
    expect(taskTiming("open", null, "2026-10-05", true)).toMatchObject({ group: "whenever", tone: "warn" });
  });
  it("one errand, one task: earnest money, appraisal and HOA pairs are single tasks", () => {
    const keys = list.map((i) => i.rule_key);
    for (const k of ["earnest_receipt", "fin_appraisal_received", "hoa_deliver_docs", "details_confirmed"]) expect(keys).not.toContain(k);
  });
  it("the three missing-document tasks are the only additions from the reader's findings", () => {
    const before = buildChecklist({ ...terms, missing_docs: null });
    expect(list.length - before.length).toBe(3);
  });
  it("once a missing addendum is attached, its task no longer applies", () => {
    const after = buildChecklist({ ...terms, addenda: [...terms.addenda, "lead_based_paint"], missing_docs: missing });
    expect(after.map((i) => i.rule_key)).not.toContain("missing_lead_based_paint");
    expect(stillMissing(missing, [...terms.addenda, "lead_based_paint"])).toEqual(["sellers_disclosure", "non_realty_items"]);
  });
  it("a disclosure that is in the packet isn't reported missing", () => {
    expect(deriveMissingDocs({ ...read, documents: [...read.documents, { kind: "disclosure", slot: "sellers_disclosure" }] })).not.toContain("sellers_disclosure");
  });
});
