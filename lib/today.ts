import { daysBetween, formatShort, type ISODate } from "@/lib/dates";

// Today: one ranked vertical stream of cards that ENDS.
// Order is deadline order only, stable and explainable: late (oldest first, so the oldest late
// thing stays on top until it's handled), then due today, then each remaining deal's next date.
// Nothing is ranked by engagement and nothing sinks because it is old or untouched. Pure, so tested.

export type StreamDeal = {
  id: string; address: string;
  deadlines: { key: string; label: string; due_date: ISODate }[];
  items: { id: string; rule_key: string; title: string; status: string; deadline_key: string | null; sort: number }[];
};

export type StreamCard =
  | { kind: "late" | "today"; dealId: string; address: string; itemId: string; ruleKey: string; title: string; when: string; due: ISODate }
  | { kind: "next"; dealId: string; address: string; title: string; when: string; due: ISODate };

export function buildStream(deals: StreamDeal[], today: ISODate): { cards: StreamCard[]; caughtUp: boolean } {
  const tasks: Extract<StreamCard, { kind: "late" | "today" }>[] = [];
  const nexts: Extract<StreamCard, { kind: "next" }>[] = [];
  const order = new Map<string, number>();

  for (const d of deals) {
    const due = new Map(d.deadlines.map((x) => [x.key, x.due_date]));
    let here = 0;
    for (const it of d.items) {
      if (it.status !== "open" || !it.deadline_key) continue;
      const date = due.get(it.deadline_key);
      if (!date || date > today) continue;
      const n = daysBetween(date, today);
      tasks.push({
        kind: n > 0 ? "late" : "today", dealId: d.id, address: d.address, itemId: it.id, ruleKey: it.rule_key, title: it.title, due: date,
        when: n > 0 ? `${n} day${n === 1 ? "" : "s"} late (due ${formatShort(date)})` : "Due today",
      });
      order.set(it.id, it.sort);
      here++;
    }
    if (here) continue;
    // Nothing late or due today on this deal: show its next date so every deal stays in view once.
    const next = [...d.deadlines].filter((x) => x.due_date > today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    if (next) {
      const n = daysBetween(today, next.due_date);
      nexts.push({ kind: "next", dealId: d.id, address: d.address, title: next.label, due: next.due_date,
        when: n === 1 ? `Tomorrow, ${formatShort(next.due_date)}` : `${formatShort(next.due_date)}, in ${n} days` });
    }
  }

  const rank = { late: 0, today: 1 } as const;
  tasks.sort((a, b) => rank[a.kind] - rank[b.kind] || a.due.localeCompare(b.due) || a.address.localeCompare(b.address) || (order.get(a.itemId)! - order.get(b.itemId)!));
  nexts.sort((a, b) => a.due.localeCompare(b.due) || a.address.localeCompare(b.address));
  return { cards: [...tasks, ...nexts], caughtUp: tasks.length === 0 };
}
