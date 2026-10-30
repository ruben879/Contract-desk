"use client";
import { computeDeadlines, diffDeadlines, type DeadlineRule, type DealDates } from "@/lib/deadlines/compute";
import { formatShort, formatTime } from "@/lib/dates";
import { Badge, Card, cx } from "./ui";

export const DEADLINE_DISCLAIMER =
  "Dates are calculated from the contract terms to help you track them. You are responsible for verifying every deadline against the executed contract.";

/** Live chain-shift preview: what the deadlines will be if the agent confirms these terms. */
export function DatePreview({ rules, deal, current }: {
  rules: DeadlineRule[];
  deal: DealDates;
  current: { key: string; label: string; due_date: string; due_time: string | null }[] | null; // null = first confirm
}) {
  const { deadlines, skipped } = computeDeadlines(rules, deal);
  const shifts = current ? diffDeadlines(current, deadlines) : null;
  const moved = shifts?.filter((s) => s.change !== "same").length ?? 0;

  return (
    <Card className="p-0 sm:p-0">
      {current && (
        <div className={cx("border-b border-line px-4 py-2 text-sm", moved ? "bg-warn-soft font-medium text-warn" : "text-muted")}>
          {moved ? `${moved} date${moved === 1 ? "" : "s"} will change when you confirm` : "No dates change"}
        </div>
      )}
      <ul className="divide-y divide-line">
        {deadlines.map((d) => {
          const s = shifts?.find((x) => x.key === d.key);
          const changed = s && s.change !== "same";
          return (
            <li key={d.key} className={cx("flex items-start justify-between gap-3 px-4 py-2.5", changed && "bg-warn-soft/50")}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{d.label}</div>
                <div className="text-xs text-muted">{d.calculation}</div>
              </div>
              <div className="shrink-0 text-right text-sm">
                {changed && s.before && <div className="text-xs text-muted line-through">{formatShort(s.before.due_date)}</div>}
                <div className="font-semibold">{formatShort(d.due_date)}{d.due_time ? ` · ${formatTime(d.due_time)}` : ""}</div>
                {s?.change === "added" && current && <Badge tone="brand">New</Badge>}
              </div>
            </li>
          );
        })}
        {shifts?.filter((s) => s.change === "removed").map((s) => (
          <li key={s.key} className="flex justify-between px-4 py-2.5 text-sm text-muted">
            <span className="line-through">{s.label}</span><span>Removed</span>
          </li>
        ))}
        {skipped.map((s) => (
          <li key={s.key} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
            <span>{s.label}</span><span className="text-right text-xs text-warn">{s.reason}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-2 text-xs text-muted">{DEADLINE_DISCLAIMER}</p>
    </Card>
  );
}
