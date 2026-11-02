import { describe, expect, it } from "vitest";
import { buildStream, type StreamDeal } from "@/lib/today";

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

describe("Today stream", () => {
  const { cards, caughtUp } = buildStream([oak, elm, brookhollow], today);
  it("late first, oldest on top; then due today; then other deals' next date", () => {
    expect(cards.map((c) => [c.kind, c.title])).toEqual([
      ["late", "earnest_delivered"], ["late", "option_decision"], ["today", "option_decision"], ["next", "Earnest money"],
    ]);
    expect(caughtUp).toBe(false);
  });
  it("states lateness once, in plain words", () => {
    expect(cards[0].when).toBe("26 days late (due Oct 6)");
    expect(cards[3].when).toBe("Nov 4, in 3 days");
  });
  it("a deal with something late or due doesn't also get a next-date card", () => {
    expect(cards.filter((c) => c.dealId === "b").every((c) => c.kind === "late")).toBe(true);
  });
  it("nothing late or due: caught up, and the stream still ends", () => {
    const r = buildStream([oak], today);
    expect(r.caughtUp).toBe(true);
    expect(r.cards).toHaveLength(1);
  });
  it("order is deadline order only: input order and untouched age change nothing", () => {
    expect(buildStream([brookhollow, elm, oak], today).cards).toEqual(cards);
  });
});
