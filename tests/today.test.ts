import { describe, expect, it } from "vitest";
import { buildToday, dealStack, ROW_FILL, STACK_LIMIT, type TodayDeal } from "@/lib/today";
import { buildChecklist } from "@/lib/checklist/rules";

const today = "2026-11-01";
const deal = (id: string, address: string, deadlines: TodayDeal["deadlines"], items: [string, string, string | null][]): TodayDeal => ({
  id, address, deadlines,
  items: items.map(([key, status, dk], i) => ({ id: `${id}-${key}`, rule_key: key, title: key, status, deadline_key: dk, sort: i })),
});

const late = deal("b", "4512 Brookhollow Dr", [
  { key: "earnest_money", label: "Earnest money", due_date: "2026-10-06" },
  { key: "option_end", label: "Option ends", due_date: "2026-10-13" },
  { key: "closing", label: "Closing", due_date: "2026-11-11" },
], [["option_decision", "open", "option_end"], ["earnest_delivered", "open", "earnest_money"], ["closed", "open", "closing"], ["missing_lead_based_paint", "open", null], ["executed_contract", "done", null]]);
const dueToday = deal("e", "88 Elm St", [{ key: "option_end", label: "Option period ends", due_date: "2026-11-01" }, { key: "closing", label: "Closing", due_date: "2026-12-01" }],
  [["option_decision", "open", "option_end"]]);
const soon = deal("o", "12 Oak Ln", [{ key: "closing", label: "Closing", due_date: "2026-11-20" }, { key: "earnest_money", label: "Earnest money", due_date: "2026-11-04" }],
  [["earnest_delivered", "done", "earnest_money"], ["closed", "open", "closing"]]);
const later = deal("p", "9 Pine Ave", [{ key: "closing", label: "Closing", due_date: "2026-12-20" }], [["closed", "open", "closing"]]);
const farther = deal("q", "3 Quail Rd", [{ key: "closing", label: "Closing", due_date: "2027-01-15" }], [["closed", "open", "closing"]]);

describe("Today row: deal cards are containers", () => {
  const { row, caughtUp } = buildToday([later, soon, dueToday, late, farther], today);
  it("deals with something late first (oldest first), then due today, then filled with the soonest coming up", () => {
    expect(row.map((r) => [r.dealId, r.kind, r.line])).toEqual([
      ["b", "late", "Late since Oct 6"], ["e", "today", "Due today"], ["o", "next", "Earnest money Nov 4"],
    ]);
    expect(row).toHaveLength(ROW_FILL);
    expect(caughtUp).toBe(false);
  });
  it("every due deal is in the row even past the fill size; filling only tops up", () => {
    const many = Array.from({ length: 5 }, (_, i) => deal(`d${i}`, `${i} Main`, [{ key: "option_end", label: "Option", due_date: "2026-10-2" + i }], [["option_decision", "open", "option_end"]]));
    expect(buildToday([...many, soon], today).row.map((r) => r.dealId)).toEqual(["d0", "d1", "d2", "d3", "d4"]);
  });
  it("row cards carry no task: nothing on them can be marked done", () => {
    for (const r of row) expect(Object.keys(r).sort()).toEqual(["address", "dealId", "key", "kind", "line"]);
  });
  it("nothing late or due: caught up, and the row shows the soonest deals", () => {
    const r = buildToday([later, soon], today);
    expect(r.caughtUp).toBe(true);
    expect(r.row.map((x) => x.dealId)).toEqual(["o", "p"]);
  });
  it("order is deadline order only: input order changes nothing", () => {
    expect(buildToday([late, farther, dueToday, soon, later], today)).toEqual(buildToday([later, soon, dueToday, late, farther], today));
  });
});

describe("Today stack: one task per card, in the deal page's order", () => {
  it("late by date, then coming up, then waiting on paper; done tasks never appear", () => {
    expect(dealStack(late, today).map((t) => [t.title, t.when])).toEqual([
      ["earnest_delivered", "26 days late (due Oct 6)"], ["option_decision", "19 days late (due Oct 13)"],
      ["closed", "Due Nov 11"], ["missing_lead_based_paint", null],
    ]);
  });
  it("stops at the limit; the next one moves up when one is done", () => {
    const big = deal("x", "1 Long Rd", [{ key: "closing", label: "Closing", due_date: "2026-11-30" }],
      Array.from({ length: 8 }, (_, i) => [`t${i}`, "open", "closing"] as [string, string, string]));
    expect(dealStack(big, today)).toHaveLength(STACK_LIMIT);
    big.items[0].status = "done";
    expect(dealStack(big, today)[0].title).toBe("t1");
    expect(dealStack(big, today).at(-1)!.title).toBe("t5");
  });
});

describe("Brookhollow on Today, as in production after migration 0008", () => {
  const terms = { side: "buyer", addenda: ["hoa"], financing_type: "cash", seller_disclosure: "received", missing_docs: ["sellers_disclosure", "lead_based_paint", "non_realty_items"] } as any;
  const items = buildChecklist(terms).map((i, n) => ({ id: `i${n}`, rule_key: i.rule_key, title: i.title, status: i.status, deadline_key: i.deadline_key, sort: i.sort }));
  const b: TodayDeal = { id: "b", address: "4512 Brookhollow Dr, Lubbock", items, deadlines: [
    { key: "earnest_money", label: "Earnest money and option fee due", due_date: "2026-10-06" },
    { key: "option_end", label: "Option period ends", due_date: "2026-10-13" },
    { key: "title_commitment", label: "Title commitment due", due_date: "2026-10-23" },
    { key: "hoa_info", label: "HOA subdivision information due", due_date: "2026-10-23" },
    { key: "closing", label: "Closing", due_date: "2026-11-11" },
  ] };
  const { row, stacks } = buildToday([b], today);

  it("14 tasks, 13 open", () => {
    expect(items).toHaveLength(14);
    expect(items.filter((i) => i.status === "open")).toHaveLength(13);
  });
  it("one late deal card in the row", () => {
    expect(row).toEqual([{ dealId: "b", address: "4512 Brookhollow Dr, Lubbock", kind: "late", line: "Late since Oct 6", key: "2026-10-06" }]);
  });
  it("its stack starts with sending the contract to title, one task per card", () => {
    expect(stacks.b.map((t) => [t.title, t.when])).toEqual([
      ["Send executed contract to title company", "26 days late (due Oct 6)"],
      ["Earnest money and option fee delivered, receipt from title in the file", "26 days late (due Oct 6)"],
      ["Schedule inspections", "19 days late (due Oct 13)"],
      ["Option period decision: proceed, amend, or terminate", "19 days late (due Oct 13)"],
      ["Title commitment received and reviewed", "9 days late (due Oct 23)"],
    ]);
  });
});
