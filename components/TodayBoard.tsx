"use client";
import Link from "next/link";
import { useState } from "react";
import type { RowCard, StackCard } from "@/lib/today";
import { TaskAction } from "./TaskAction";
import { cx } from "./ui";

const toneText = { bad: "font-medium text-bad", warn: "font-medium text-warn", muted: "text-muted" } as const;

/**
 * Row of deal cards (swipe sideways, tap to select; they never complete anything) and, below it,
 * the selected deal's tasks, one per card, each with its own button. Marking one done slides it
 * away and the next moves up. The stack ends with "Open deal to see more".
 */
export function TodayBoard({ row, stacks }: { row: RowCard[]; stacks: Record<string, StackCard[]> }) {
  const [selected, setSelected] = useState(row[0]?.dealId);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const deal = row.find((r) => r.dealId === selected) ?? row[0];
  if (!deal) return null;
  const stack = stacks[deal.dealId] ?? [];

  return (
    <>
      <div role="tablist" aria-label="Deals"
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {row.map((r) => {
          const on = r.dealId === deal.dealId;
          return (
            <div key={r.dealId} role="tab" aria-selected={on} tabIndex={0}
              onClick={() => setSelected(r.dealId)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(r.dealId); } }}
              className={cx("w-[78%] max-w-[300px] shrink-0 cursor-pointer snap-start rounded-card bg-card p-4 shadow-card outline-none transition",
                on ? "ring-2 ring-brand" : "opacity-90 hover:opacity-100")}>
              <div className="font-semibold leading-snug">{r.address}</div>
              <div className={cx("mt-0.5 text-[15px]", r.kind === "late" ? toneText.bad : r.kind === "today" ? toneText.warn : toneText.muted)}>{r.line}</div>
              <Link href={`/t/${r.dealId}`} onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-block text-[15px] font-medium text-brand underline underline-offset-[3px]">Open deal</Link>
            </div>
          );
        })}
      </div>

      <ol role="tabpanel" aria-label={`Tasks for ${deal.address}`} className="mt-2">
        {stack.map((t) => {
          const hide = gone.has(t.itemId);
          return (
            <li key={t.itemId} aria-hidden={hide}
              className={cx("grid transition-all duration-300 ease-out", hide ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100")}>
              <div className="overflow-hidden">
                <div className="mb-3 rounded-card bg-card p-[18px] shadow-card">
                  <div className="text-[18px] font-semibold leading-snug">{t.title}</div>
                  {t.when && <div className={cx("mt-1", toneText[t.tone])}>{t.when}</div>}
                  <div className="mt-3.5">
                    <TaskAction itemId={t.itemId} ruleKey={t.ruleKey} transactionId={deal.dealId}
                      onDone={() => setGone((g) => new Set(g).add(t.itemId))} />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        <li>
          <Link href={`/t/${deal.dealId}`} className="flex items-center justify-between rounded-card bg-card p-[18px] font-medium text-brand shadow-card">
            Open deal to see more
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
          </Link>
        </li>
      </ol>
    </>
  );
}
