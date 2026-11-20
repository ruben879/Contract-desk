"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteDraftOffer } from "@/app/o/actions";

/** Another open offer for the same address (Nov 18: 2131 S Loop 289 showed up twice in Offers). */
export function DuplicateOffer({ offerId, isDraft, others }: { offerId: string; isDraft: boolean; others: { id: string; line: string }[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-[15px]">
      <div className="font-semibold text-warn">There's already an open offer for this address</div>
      <ul className="mt-1 space-y-0.5">
        {others.map((o) => <li key={o.id}><Link href={`/o/${o.id}`} className="font-medium text-brand">{o.line}</Link></li>)}
      </ul>
      {isDraft && (
        <button type="button" disabled={pending} className="mt-2 font-medium text-bad disabled:opacity-60"
          onClick={() => start(async () => { try { await deleteDraftOffer(offerId); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete it."); } })}>
          {pending ? "Deleting…" : "This one is a duplicate: delete this draft"}
        </button>
      )}
      {err && <p className="mt-1 text-sm text-bad">{err}</p>}
    </div>
  );
}
