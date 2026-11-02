"use client";
import Link from "next/link";
import type { RowCard, StackCard } from "@/lib/today";
import { TaskDeck } from "./TaskDeck";
import { cx } from "./ui";

const lineTone = (k: RowCard["kind"]) => (k === "late" ? "font-medium text-bad" : k === "today" ? "font-medium text-warn" : "text-muted");
const street = (address: string) => address.split(",")[0];
const anchor = (dealId: string) => `deal-${dealId}`;

/**
 * Today below the pinned cards: a preview strip (one small preview per stack, same order; tapping
 * one scrolls to its stack, it never selects or swaps anything), then every deal's stack, one
 * after another, in attention order. A stack is a header (opens the deal, never completes
 * anything) and a swipeable deck: up to five task cards with one button each, most urgent in
 * front, and "Open deal to see more" last.
 */
export function TodayBoard({ row, stacks }: { row: RowCard[]; stacks: Record<string, StackCard[]> }) {
  if (!row.length) return null;

  return (
    <>
      <nav aria-label="Jump to a deal"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {row.map((r) => (
          <a key={r.dealId} href={`#${anchor(r.dealId)}`}
            onClick={(e) => { e.preventDefault(); document.getElementById(anchor(r.dealId))?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            className="shrink-0 rounded-full bg-card px-3.5 py-2 shadow-card">
            <span className={cx("block max-w-[180px] truncate text-[15px] font-medium", r.kind === "late" ? "text-bad" : r.kind === "today" ? "text-warn" : "text-ink")}>{street(r.address)}</span>
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-10">
        {row.map((r) => (
          <section key={r.dealId} id={anchor(r.dealId)} aria-label={r.address} className="scroll-mt-4">
            <Link href={`/t/${r.dealId}`} className="mb-3 flex items-center justify-between gap-3 px-1">
              <span className="min-w-0">
                <span className="block text-[19px] font-semibold leading-snug">{r.address}</span>
                <span className={cx("block", lineTone(r.kind))}>{r.line}</span>
              </span>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-brand" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
            </Link>
            <TaskDeck dealId={r.dealId} address={r.address} tasks={stacks[r.dealId] ?? []} />
          </section>
        ))}
      </div>
    </>
  );
}
