"use client";
import { useState, useTransition } from "react";
import { keepHeldDocument, moveHeldDocument, removeDocument } from "@/app/actions";
import { cx, money } from "./ui";

export type Held = {
  looks_like: string | null;
  seen: { property_street: string | null; parties: string[]; price: number | null };
  deal: { property_street: string | null; parties: string[]; price: number | null };
};
type OtherDeal = { id: string; address: string; best: boolean };

const btn = "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[15px] font-semibold disabled:opacity-50";

/**
 * A document stopped at the door: it matches this deal on nothing. It isn't filed or read for
 * changes until the agent picks one of three ways out.
 */
export function HeldDocument({ doc, held, deals }: { doc: { id: string; file_name: string; url?: string }; held: Held; deals: OtherDeal[] }) {
  const [mode, setMode] = useState<null | "move" | "remove" | "keep">(null);
  const [target, setTarget] = useState(deals.find((d) => d.best)?.id ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) => start(async () => { setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "That didn't work. Try again."); } });

  const s = held.seen;
  const looks = [held.looks_like, s.property_street && `for ${s.property_street}`].filter(Boolean).join(" ");
  const facts = [s.parties.length ? s.parties.join(", ") : null, s.price ? money(s.price) : null].filter(Boolean).join(" · ");

  return (
    <div role="alert" className="mb-4 rounded-card border-2 border-bad bg-bad-soft p-4">
      <div className="text-[17px] font-semibold text-bad">This document doesn't match this deal</div>
      <p className="mt-1 text-[15px]">
        <a href={doc.url} target="_blank" className="break-all font-medium text-brand">{doc.file_name}</a> looks like {looks || "a document for a different property"}.
        {facts && <> <span className="text-muted">{facts}.</span></>}
      </p>
      <p className="mt-1 text-sm text-muted">
        This deal is {held.deal.property_street ?? "a different property"}{held.deal.parties.length ? `, ${held.deal.parties.join(", ")}` : ""}{held.deal.price ? `, ${money(held.deal.price)}` : ""}.
        It hasn't been filed or read for changes, and nothing on this deal moved.
      </p>

      {mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={cx(btn, "bg-brand text-white")} onClick={() => setMode("move")} disabled={pending}>Wrong deal</button>
          <button className={cx(btn, "border-[1.5px] border-line bg-card text-bad")} onClick={() => setMode("remove")} disabled={pending}>Remove it</button>
          <button className={cx(btn, "text-muted underline-offset-2 hover:underline")} onClick={() => setMode("keep")} disabled={pending}>Keep it on this deal anyway</button>
        </div>
      )}

      {mode === "move" && (
        <div className="mt-3 space-y-2">
          <label className="block text-sm font-medium" htmlFor={`move-${doc.id}`}>Which deal is it for?</label>
          {deals.length ? (
            <select id={`move-${doc.id}`} value={target} onChange={(e) => setTarget(e.target.value)}
              className="min-h-11 w-full rounded-xl border-[1.5px] border-line bg-card px-3 text-[15px]">
              <option value="">Choose a deal</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.address}{d.best ? " (matches the document)" : ""}</option>)}
            </select>
          ) : <p className="text-sm text-muted">No other open deals. Start that deal from the contract, or remove this one.</p>}
          <div className="flex gap-2">
            <button className={cx(btn, "bg-brand text-white")} disabled={!target || pending} onClick={() => run(() => moveHeldDocument(doc.id, target))}>{pending ? "Moving…" : "Move it there"}</button>
            <button className={cx(btn, "text-muted")} onClick={() => setMode(null)} disabled={pending}>Cancel</button>
          </div>
        </div>
      )}

      {mode === "remove" && (
        <div className="mt-3 space-y-2">
          <p className="text-[15px] font-medium">Remove {doc.file_name}? The file is deleted and can't be brought back.</p>
          <div className="flex gap-2">
            <button className={cx(btn, "bg-bad text-white")} disabled={pending} onClick={() => run(() => removeDocument(doc.id))}>{pending ? "Removing…" : "Remove it"}</button>
            <button className={cx(btn, "text-muted")} onClick={() => setMode(null)} disabled={pending}>Cancel</button>
          </div>
        </div>
      )}

      {mode === "keep" && (
        <div className="mt-3 space-y-2">
          <p className="text-[15px] font-medium">Keep it here even though the address, parties, and price don't match? It will be filed and checked for changes to this deal, and you'll confirm anything it changes.</p>
          <div className="flex gap-2">
            <button className={cx(btn, "bg-brand text-white")} disabled={pending} onClick={() => run(() => keepHeldDocument(doc.id))}>{pending ? "Keeping…" : "Keep it on this deal"}</button>
            <button className={cx(btn, "text-muted")} onClick={() => setMode(null)} disabled={pending}>Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-sm font-medium text-bad">{err}</p>}
    </div>
  );
}
