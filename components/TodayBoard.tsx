"use client";
import Link from "next/link";
import { useState } from "react";
import type { RowCard, StackCard } from "@/lib/today";
import { TaskAction } from "./TaskAction";
import { cx } from "./ui";

const toneText = { bad: "font-medium text-bad", warn: "font-medium text-warn", muted: "text-muted" } as const;
const lineTone = (k: RowCard["kind"]) => (k === "late" ? toneText.bad : k === "today" ? toneText.warn : toneText.muted);
const street = (address: string) => address.split(",")[0];
const anchor = (dealId: string) => `deal-${dealId}`;

/**
 * Today below the pinned cards: a preview strip (one small preview per stack, same order; tapping
 * one scrolls to its stack, it never selects or swaps anything), then every deal's stack, one
 * after another, in attention order. A stack is a header (opens the deal, never completes
 * anything), up to five task cards with one button each, and "Open deal to see more".
 */
export function TodayBoard({ row, stacks }: { row: RowCard[]; stacks: Record<string, StackCard[]> }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
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

      <div className="flex flex-col gap-8">
        {row.map((r) => (
          <section key={r.dealId} id={anchor(r.dealId)} aria-label={r.address} className="scroll-mt-4">
            <Link href={`/t/${r.dealId}`} className="mb-3 flex items-center justify-between gap-3 px-1">
              <span className="min-w-0">
                <span className="block text-[19px] font-semibold leading-snug">{r.address}</span>
                <span className={cx("block", lineTone(r.kind))}>{r.line}</span>
              </span>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-brand" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
            </Link>
            <ol>
              {(stacks[r.dealId] ?? []).map((t) => {
                const hide = gone.has(t.itemId);
                return (
                  <li key={t.itemId} aria-hidden={hide}
                    className={cx("grid transition-all duration-300 ease-out", hide ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100")}>
                    <div className="overflow-hidden">
                      <div className="mb-3 rounded-card bg-card p-[18px] shadow-card">
                        <div className="text-[18px] font-semibold leading-snug">{t.title}</div>
                        {t.when && <div className={cx("mt-1", toneText[t.tone])}>{t.when}</div>}
                        <div className="mt-3.5">
                          <TaskAction itemId={t.itemId} ruleKey={t.ruleKey} transactionId={r.dealId}
                            onDone={() => setGone((g) => new Set(g).add(t.itemId))} />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
              <li>
                <Link href={`/t/${r.dealId}`} className="flex items-center justify-between rounded-card bg-card p-[18px] font-medium text-brand shadow-card">
                  Open deal to see more
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
                </Link>
              </li>
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
