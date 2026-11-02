import { daysBetween, formatShort, type ISODate } from "@/lib/dates";
import { taskTiming } from "@/lib/deal-status";

// Today: one vertical scroll of STACKS, one per deal, in attention order, with a preview strip on
// top (one preview per stack, same order; tapping jumps to the stack). No selection state.
// - A stack's header (address + one line) opens the deal; it never completes anything.
// - Each task card holds exactly one task, with that task's own button.
// Order is deadline order only: deals with something late (oldest first, so the oldest late thing
// stays first until it's handled), then due today; if fewer than ROW_FILL deals are due, the row
// fills with the deals whose next date comes soonest. Nothing is ranked by engagement.
// Pure, so tested.

export const ROW_FILL = 3;     // on a light day, fill Today to this many deals with the soonest coming up
export const STACK_LIMIT = 5;  // task cards per deal before "Open deal to see more"

export type TodayDeal = {
  id: string; address: string;
  deadlines: { key: string; label: string; due_date: ISODate }[];
  items: { id: string; rule_key: string; title: string; status: string; deadline_key: string | null; sort: number }[];
};

export type RowCard = { dealId: string; address: string; kind: "late" | "today" | "next"; line: string; key: ISODate };
export type StackCard = { itemId: string; ruleKey: string; title: string; when: string | null; tone: "bad" | "warn" | "muted" };

/** A deal's tasks in the order the deal page shows them: late, coming up, then waiting on paper. */
export function dealStack(d: TodayDeal, today: ISODate, limit = STACK_LIMIT): StackCard[] {
  const due = new Map(d.deadlines.map((x) => [x.key, x.due_date]));
  const open = d.items.filter((it) => it.status === "open");
  const dated = open.filter((it) => it.deadline_key && due.has(it.deadline_key))
    .map((it) => ({ it, date: due.get(it.deadline_key!)! }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.it.sort - b.it.sort);
  const paper = open.filter((it) => it.rule_key.startsWith("missing_") && !(it.deadline_key && due.has(it.deadline_key)))
    .sort((a, b) => a.sort - b.sort);
  return [
    ...dated.map(({ it, date }) => { const t = taskTiming("open", date, today); return { itemId: it.id, ruleKey: it.rule_key, title: it.title, when: t.when, tone: t.tone }; }),
    ...paper.map((it) => ({ itemId: it.id, ruleKey: it.rule_key, title: it.title, when: null, tone: "muted" as const })),
  ].slice(0, limit);
}

export function buildToday(deals: TodayDeal[], today: ISODate) {
  const due: RowCard[] = [];
  const soon: RowCard[] = [];
  for (const d of deals) {
    const dates = new Map(d.deadlines.map((x) => [x.key, x.due_date]));
    const pressing = d.items
      .filter((it) => it.status === "open" && it.deadline_key && (dates.get(it.deadline_key) ?? "9999") <= today)
      .map((it) => dates.get(it.deadline_key!)!).sort()[0];
    if (pressing) {
      const late = pressing < today;
      due.push({ dealId: d.id, address: d.address, kind: late ? "late" : "today", key: pressing,
        line: late ? `Late since ${formatShort(pressing)}` : "Due today" });
      continue;
    }
    const next = [...d.deadlines].filter((x) => x.due_date > today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    if (next) {
      const n = daysBetween(today, next.due_date);
      soon.push({ dealId: d.id, address: d.address, kind: "next", key: next.due_date,
        line: `${next.label} ${n === 1 ? "tomorrow" : formatShort(next.due_date)}` });
    }
  }
  const rank = { late: 0, today: 1, next: 2 } as const;
  const byDate = (a: RowCard, b: RowCard) => rank[a.kind] - rank[b.kind] || a.key.localeCompare(b.key) || a.address.localeCompare(b.address);
  due.sort(byDate);
  soon.sort(byDate);
  const row = [...due, ...soon.slice(0, Math.max(0, ROW_FILL - due.length))];
  const byId = new Map(deals.map((d) => [d.id, d]));
  const stacks = Object.fromEntries(row.map((r) => [r.dealId, dealStack(byId.get(r.dealId)!, today)]));
  return { row, stacks, caughtUp: due.length === 0 };
}
