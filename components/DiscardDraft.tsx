"use client";
import { useState, useTransition } from "react";
import { discardDraft } from "@/app/actions";

/** Two taps to discard, so it can't happen by accident. No browser pop-up. */
export function DiscardDraft({ id }: { id: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="text-center">
      {armed ? (
        <span className="text-sm">
          Discard this draft and its documents?{" "}
          <button disabled={pending} onClick={() => start(() => discardDraft(id))} className="font-semibold text-bad">{pending ? "Discarding..." : "Yes, discard"}</button>
          {" · "}
          <button onClick={() => setArmed(false)} className="text-muted">Keep</button>
        </span>
      ) : (
        <button onClick={() => setArmed(true)} className="text-sm text-muted hover:text-bad">Discard this draft</button>
      )}
    </div>
  );
}
