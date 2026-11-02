import { describe, expect, it } from "vitest";
import { buildStream, type StreamDeal } from "@/lib/today";
import { buildChecklist } from "@/lib/checklist/rules";

const today = "2026-11-01";
const deal = (id: string, address: string, deadlines: StreamDeal["deadlines"], items: [string, string, string | null][]): StreamDeal => ({
  id, address, deadlines,
  items: items.map(([key, status, dk], i) => ({ id: `${id}-${key}`, rule_key: key, title: key, status, deadline_key: dk, sort: i })),
});

const brookhollow = deal("b", "4512 Brookhollow Dr", [
  { key: "earnest_money", label: "Earnest money", due_date: "2026-10-06" },
  { key: "option_end", label: "Option ends", due_date: "2026-10-13" },
  { key: "closing", label: "Closing", due_date: "2026-11-11" },
], [["earnest_delivered", "open", "earnest_money"], ["option_decision", "open", "option_end"], ["closed", "open", "closing"], ["missing_lead_based_paint", "open", null]]);
const elm = deal("e", "88 Elm St", [{ key: "option_end", label: "Option period ends", due_date: "2026-11-01" }, { key: "closing", label: "Closing", due_date: "2026-12-01" }],
  [["option_decision", "open", "option_end"]]);
const oak = deal("o", "12 Oak Ln", [{ key: "closing", label: "Closing", due_date: "2026-11-20" }, { key: "earnest_money", label: "Earnest money", due_date: "2026-11-04" }],
  [["earnest_delivered", "done", "earnest_money"]]);

describe("Today stream: one card per deal", () => {
  const { cards, caughtUp } = buildStream([oak, elm, brookhollow], today);
  it("deals with something late first (oldest on top), then due today, then other deals' next date", () => {
    expect(cards.map((c) => [c.dealId, c.kind, c.title])).toEqual([
      ["b", "late", "earnest_delivered"], ["e", "today", "option_decision"], ["o", "next", "Earnest money"],
    ]);
    expect(caughtUp).toBe(false);
  });
  it("leads with the deal's oldest late task, states lateness once, and counts the rest", () => {
    expect(cards[0]).toMatchObject({ when: "26 days late (due Oct 6)", more: 1 });
    expect(cards[1]).toMatchObject({ when: "Due today", more: 0 });
    expect(cards[2].when).toBe("Nov 4, in 3 days");
  });
  it("every deal appears exactly once", () => {
    expect(cards.map((c) => c.dealId).sort()).toEqual(["b", "e", "o"]);
  });
  it("nothing late or due: caught up, and the stream still ends", () => {
    const r = buildStream([oak], today);
    expect(r.caughtUp).toBe(true);
    expect(r.cards).toHaveLength(1);
  });
  it("order is deadline order only: input order changes nothing", () => {
    expect(buildStream([brookhollow, elm, oak], today).cards).toEqual(cards);
  });
});

describe("Brookhollow on Today, as in production after migration 0008", () => {
  // 13 open tasks; six are past due on Nov 1. Order within the deal: date, then checklist order.
  const terms = { side: "buyer", addenda: ["hoa"], financing_type: "cash", seller_disclosure: "received", missing_docs: ["sellers_disclosure", "lead_based_paint", "non_realty_items"] } as any;
  const items = buildChecklist(terms).map((i, n) => ({ id: `i${n}`, rule_key: i.rule_key, title: i.title, status: i.status, deadline_key: i.deadline_key, sort: i.sort }));
  const b: StreamDeal = { id: "b", address: "4512 Brookhollow Dr, Lubbock", items, deadlines: [
    { key: "earnest_money", label: "Earnest money and option fee due", due_date: "2026-10-06" },
    { key: "option_end", label: "Option period ends", due_date: "2026-10-13" },
    { key: "title_commitment", label: "Title commitment due", due_date: "2026-10-23" },
    { key: "hoa_info", label: "HOA subdivision information due", due_date: "2026-10-23" },
    { key: "closing", label: "Closing", due_date: "2026-11-11" },
  ] };
  it("14 tasks, 13 open", () => {
    expect(items).toHaveLength(14);
    expect(items.filter((i) => i.status === "open")).toHaveLength(13);
  });
  it("one card: send the contract to title, 26 days late, and 5 more", () => {
    const { cards } = buildStream([b], today);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "late", title: "Send executed contract to title company", when: "26 days late (due Oct 6)", more: 5, ruleKey: "contract_to_title" });
  });
});
