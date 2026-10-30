import { describe, expect, it } from "vitest";
import { computeDeadlines, rollForward, type DeadlineRule } from "@/lib/deadlines/compute";
import { isHoliday } from "@/lib/deadlines/holidays";

const rules: DeadlineRule[] = [
  { key: "earnest_money", label: "Earnest money", contract_ref: "Para 5A", anchor: "effective_date", default_days: 3, use_contract_days: false, due_time: null, roll_weekends_holidays: true, needs_verification: true, sort: 1 },
  { key: "option_end", label: "Option ends", contract_ref: "Para 5B", anchor: "effective_date", default_days: null, use_contract_days: true, due_time: "17:00", roll_weekends_holidays: false, needs_verification: true, sort: 2 },
  { key: "title_commitment", label: "Title", contract_ref: "Para 6B", anchor: "effective_date", default_days: 20, use_contract_days: false, due_time: null, roll_weekends_holidays: true, needs_verification: true, sort: 3 },
  { key: "survey", label: "Survey", contract_ref: "Para 6C", anchor: "effective_date", default_days: 10, use_contract_days: true, due_time: null, roll_weekends_holidays: true, needs_verification: true, sort: 4 },
  { key: "closing", label: "Closing", contract_ref: "Para 9A", anchor: "closing_date", default_days: 0, use_contract_days: false, due_time: null, roll_weekends_holidays: false, needs_verification: false, sort: 5 },
];

describe("holidays", () => {
  it("knows 2026 Thanksgiving and observed July 4", () => {
    expect(isHoliday("2026-11-26")).toBe(true);
    expect(isHoliday("2026-07-03")).toBe(true); // July 4, 2026 is a Saturday
    expect(isHoliday("2026-11-25")).toBe(false);
  });
});

describe("rollForward", () => {
  it("moves Saturday to Monday", () => expect(rollForward("2026-10-31").date).toBe("2026-11-02"));
  it("skips Thanksgiving Thursday", () => expect(rollForward("2026-11-26").date).toBe("2026-11-27"));
  it("leaves a Tuesday alone", () => expect(rollForward("2026-11-03")).toEqual({ date: "2026-11-03", rolled: false }));
});

describe("computeDeadlines", () => {
  const deal = { effective_date: "2026-10-28", closing_date: "2026-12-04", option_period_days: 7, survey_days: null };
  const { deadlines, skipped } = computeDeadlines(rules, deal);
  const by = Object.fromEntries(deadlines.map((d) => [d.key, d]));

  it("earnest money: Wed + 3 = Sat, rolls to Mon", () => {
    expect(by.earnest_money.due_date).toBe("2026-11-02");
    expect(by.earnest_money.calculation).toContain("moved from");
  });
  it("option period uses the contract's 7 days, ends 5 pm, no roll", () => {
    expect(by.option_end.due_date).toBe("2026-11-04");
    expect(by.option_end.due_time).toBe("17:00");
    expect(by.option_end.calculation).toContain("per contract");
  });
  it("survey falls back to the placeholder when the contract is blank", () => {
    expect(by.survey.due_date).toBe("2026-11-09"); // Nov 7 is Saturday
    expect(by.survey.calculation).toContain("placeholder");
  });
  it("closing is the contract date", () => expect(by.closing.due_date).toBe("2026-12-04"));
  it("nothing skipped", () => expect(skipped).toEqual([]));

  it("skips effective-date deadlines when the effective date is blank", () => {
    const r = computeDeadlines(rules, { ...deal, effective_date: null });
    expect(r.deadlines.map((d) => d.key)).toEqual(["closing"]);
    expect(r.skipped).toHaveLength(4);
  });
});

import { diffDeadlines, findCycle } from "@/lib/deadlines/compute";

describe("chain shifting", () => {
  const chained: DeadlineRule[] = [
    ...rules,
    { key: "walkthrough", label: "Walkthrough", contract_ref: "Practice", anchor: "closing", default_days: -1, use_contract_days: false, due_time: null, roll_weekends_holidays: false, needs_verification: true, sort: 6 },
    { key: "option_followup", label: "Repair amendment", contract_ref: "Practice", anchor: "option_end", default_days: -2, use_contract_days: false, due_time: null, roll_weekends_holidays: false, needs_verification: true, sort: 7 },
  ];
  const deal = { effective_date: "2026-10-28", closing_date: "2026-12-04", option_period_days: 7, survey_days: null };

  it("deadlines anchored to other deadlines follow them", () => {
    const by = Object.fromEntries(computeDeadlines(chained, deal).deadlines.map((d) => [d.key, d]));
    expect(by.walkthrough.due_date).toBe("2026-12-03");
    expect(by.walkthrough.calculation).toContain("Closing Dec 4 - 1 day");
    expect(by.option_followup.due_date).toBe("2026-11-02");
  });

  it("moving the closing date shifts closing and everything chained to it, nothing else", () => {
    const before = computeDeadlines(chained, deal).deadlines;
    const after = computeDeadlines(chained, { ...deal, closing_date: "2026-12-11" }).deadlines;
    const moved = diffDeadlines(before, after).filter((s) => s.change === "moved").map((s) => s.key);
    expect(moved).toEqual(["closing", "walkthrough"]);
  });

  it("an amendment extending the option period shifts the option chain", () => {
    const before = computeDeadlines(chained, deal).deadlines;
    const after = computeDeadlines(chained, { ...deal, option_period_days: 10 }).deadlines;
    const d = diffDeadlines(before, after).filter((s) => s.change === "moved");
    expect(d.map((s) => s.key)).toEqual(["option_end", "option_followup"]);
    expect(d[0].after?.due_date).toBe("2026-11-07");
  });

  it("adding the effective date later reports dates as added", () => {
    const before = computeDeadlines(chained, { ...deal, effective_date: null }).deadlines;
    const after = computeDeadlines(chained, deal).deadlines;
    expect(diffDeadlines(before, after).filter((s) => s.change === "added").length).toBe(5);
  });

  it("detects cycles and skips instead of hanging", () => {
    const loop = [
      { ...chained[0], key: "a", anchor: "b" },
      { ...chained[0], key: "b", anchor: "a" },
    ];
    expect(findCycle(loop)).toEqual(["a", "b"]);
    expect(findCycle(chained)).toBeNull();
    const r = computeDeadlines(loop, deal);
    expect(r.deadlines).toEqual([]);
    expect(r.skipped).toHaveLength(2);
  });
});
