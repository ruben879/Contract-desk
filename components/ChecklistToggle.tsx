"use client";
import { useTransition } from "react";
import { setChecklistStatus } from "@/app/actions";
import { cx } from "./ui";

export function ChecklistToggle({ id, done }: { id: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      aria-label={done ? "Mark not done" : "Mark done"}
      disabled={pending}
      onClick={() => start(() => setChecklistStatus(id, done ? "open" : "done"))}
      className={cx(
        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition",
        done ? "border-good bg-good text-white" : "border-line bg-white hover:border-brand",
        pending && "opacity-50",
      )}
    >
      {done && <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 8.5l3 3 7-7" /></svg>}
    </button>
  );
}

/** Not every task fits every deal. Marking one not needed takes it off the agent's plate. */
export function NotNeededButton({ id, notNeeded }: { id: string; notNeeded: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} onClick={() => start(() => setChecklistStatus(id, notNeeded ? "open" : "not_needed"))}
      className="shrink-0 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-paper hover:text-ink disabled:opacity-50">
      {notNeeded ? "Undo" : "Not needed"}
    </button>
  );
}

export function MarkDoneButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => setChecklistStatus(id, "done"))}
      className="w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
    >
      {pending ? "Saving..." : "Mark done"}
    </button>
  );
}

/** Tucked-away "not needed" so it doesn't crowd every row. */
export function TaskMenu({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <details className="relative shrink-0">
      <summary aria-label="More options" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-lg leading-none text-muted hover:bg-paper">⋯</summary>
      <div className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-line bg-white p-1 shadow-lg">
        <button disabled={pending} onClick={() => start(() => setChecklistStatus(id, "not_needed"))}
          className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-50">
          {pending ? "Saving..." : "Not needed for this deal"}
        </button>
      </div>
    </details>
  );
}
