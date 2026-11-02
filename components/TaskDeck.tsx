"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { StackCard } from "@/lib/today";
import { TaskAction } from "./TaskAction";
import { cx } from "./ui";

// One deal's tasks as a DECK, mirroring Rock Solid's Today deck (src/views/agent.tsx, ".deck"):
// - "1 of N" between back and forward chevrons, with "Swipe left or right" until you've swiped a few times
// - the cards behind peek out the top, a little narrower each (up to two edges)
// - drag sideways to move, in both directions; past the first or last card it only gives a little
// - the card slides in from the side you came from; dots underneath
// One task per card, each with its own button. Mark done drops that card and the next comes forward.
// The last card is always "Open deal to see more". Gray edges instead of Rock Solid's gold, since
// gold reads as amber ("due soon") here.

const toneText = { bad: "font-medium text-bad", warn: "font-medium text-warn", muted: "text-muted" } as const;
const chev = (d: "l" | "r") => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d === "l" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
  </svg>
);
const SWIPES_KEY = "cd-swipes";
const readSwipes = () => { try { return Number(localStorage.getItem(SWIPES_KEY) ?? 0) || 0; } catch { return 0; } };

export function TaskDeck({ dealId, address, tasks }: { dealId: string; address: string; tasks: StackCard[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [pos, setPos] = useState(0);
  const [enter, setEnter] = useState<"next" | "prev" | "none">("none");
  const [drag, setDrag] = useState(0);
  const [swipes, setSwipes] = useState<number | null>(null);   // null until read in the browser
  const touch = useRef<{ x: number; y: number; dir: "h" | "v" | null } | null>(null);
  useEffect(() => { setSwipes(readSwipes()); }, []);

  const live = tasks.filter((t) => !gone.has(t.itemId));
  const n = live.length + 1;                       // + the "Open deal to see more" card
  const i = Math.min(pos, n - 1);
  const card = live[i];                            // undefined = the last card
  const backs = Math.min(2, n - i - 1);

  const go = (d: 1 | -1) => {
    const j = i + d;
    if (j < 0 || j >= n) return;
    setEnter(d > 0 ? "next" : "prev");
    setPos(j);
  };
  const countSwipe = () => {
    const k = (swipes ?? readSwipes()) + 1;
    setSwipes(k);
    try { localStorage.setItem(SWIPES_KEY, String(k)); } catch { /* fine */ }
  };
  const shown = (i === 0 && drag > 0) || (i === n - 1 && drag < 0) ? drag / 4 : drag;
  const hint = n > 1 && (swipes ?? 0) < 3;

  return (
    <div className="deck" data-deck={dealId}>
      {n > 1 && (
        <div className="mb-3.5 flex h-10 items-center justify-center gap-[18px] text-[17px] font-semibold">
          <button type="button" aria-label="Previous task" disabled={i === 0} onClick={() => go(-1)}
            className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-paper disabled:opacity-25">{chev("l")}</button>
          <span className="text-center leading-tight" aria-live="polite">
            <span data-count>{i + 1} of {n}</span>
            {hint && <small className="block text-[13px] font-normal text-muted">Swipe left or right</small>}
          </span>
          <button type="button" aria-label="Next task" disabled={i === n - 1} onClick={() => go(1)}
            className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-paper disabled:opacity-25">{chev("r")}</button>
        </div>
      )}

      <div className={cx("relative", backs === 1 && "pt-[14px]", backs === 2 && "pt-[28px]")}>
        {backs >= 2 && <div aria-hidden className="pback absolute left-9 right-9 top-0 h-[90px] rounded-t-[28px] bg-card opacity-70" />}
        {backs >= 1 && <div aria-hidden className={cx("pback absolute left-[18px] right-[18px] h-[90px] rounded-t-[28px] bg-card", backs === 2 ? "top-[14px]" : "top-0")} />}

        <article key={card?.itemId ?? "open-deal"} data-card={card ? "task" : "open-deal"}
          className={cx("pcard relative touch-pan-y rounded-[28px] bg-card", drag ? "transition-none" : "transition-transform duration-200 ease-out",
            !drag && enter === "next" && "animate-[pcIn_.28s_ease-out]", !drag && enter === "prev" && "animate-[pcInBack_.28s_ease-out]")}
          style={shown ? { transform: `translateX(${shown}px) rotate(${shown / 40}deg)` } : undefined}
          onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: null }; }}
          onTouchMove={(e) => {
            const t = touch.current;
            if (!t) return;
            const dx = e.touches[0].clientX - t.x, dy = e.touches[0].clientY - t.y;
            if (!t.dir && Math.abs(dx) + Math.abs(dy) > 8) t.dir = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            if (t.dir === "h") setDrag(dx);
          }}
          onTouchEnd={() => {
            const d = drag;
            touch.current = null;
            setDrag(0);
            if (Math.abs(d) > 60) countSwipe();
            if (d < -60) go(1);
            else if (d > 60) go(-1);
          }}>
          {card ? (
            <div className="p-[22px]">
              <div className="min-h-[3.2em] text-[20px] font-semibold leading-snug">{card.title}</div>
              {card.when && <div className={cx("mt-1", toneText[card.tone])}>{card.when}</div>}
              <div className="mt-5">
                <TaskAction itemId={card.itemId} ruleKey={card.ruleKey} transactionId={dealId} block
                  onDone={() => { setGone((g) => new Set(g).add(card.itemId)); setEnter("next"); }} />
              </div>
            </div>
          ) : (
            <Link href={`/t/${dealId}`} aria-label={`Open ${address} to see more`}
              className="flex min-h-[148px] flex-col justify-center gap-1 p-[22px]">
              <span className="text-[20px] font-semibold leading-snug text-brand">Open deal to see more</span>
              <span className="text-muted">Every task, date, document and person on this deal.</span>
            </Link>
          )}
        </article>
      </div>

      {n > 1 && n <= 20 && (
        <div aria-hidden className="mt-3.5 flex justify-center gap-1.5">
          {Array.from({ length: n }, (_, j) => (
            <span key={j} className={cx("h-[7px] w-[7px] rounded-full transition", j === i ? "scale-125 bg-brand" : "bg-line")} />
          ))}
        </div>
      )}
    </div>
  );
}
