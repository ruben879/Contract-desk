"use client";
import { useTransition } from "react";
import { Dropzone } from "@/components/Dropzone";
import { Card } from "@/components/ui";
import { startAddDocuments } from "@/app/actions";
import { mergeDraftInto } from "./merge";
import { DiscardDraft } from "@/components/DiscardDraft";

/** Another deal already exists at this address: offer to put these documents there instead. */
export function DuplicateNotice({ draftId, matches }: { draftId: string; matches: { id: string; label: string }[] }) {
  const [pending, start] = useTransition();
  if (!matches.length) return null;
  return (
    <Card className="mt-4 space-y-2 border-warn bg-warn-soft">
      <div className="font-semibold text-warn">There's already a deal at this address</div>
      <p className="text-sm">If these documents belong to that deal, add them there instead of starting a second one.</p>
      {matches.map((m) => (
        <button key={m.id} type="button" disabled={pending} onClick={() => start(() => mergeDraftInto(draftId, m.id))}
          className="w-full rounded-xl border border-warn bg-white px-4 py-2.5 text-left text-sm font-semibold hover:bg-warn-soft disabled:opacity-50">
          {pending ? "Moving..." : `Add these documents to ${m.label}`}
        </button>
      ))}
      <p className="text-xs text-muted">If it's a different deal (a back-up contract, say), keep going below.</p>
    </Card>
  );
}

/** The file doesn't have to arrive in one batch. Adding re-reads everything on this deal so far. */
export function AddMoreDocuments({ transactionId, confirmed }: { transactionId: string; confirmed: boolean }) {
  if (confirmed) return null;
  return (
    <div className="mt-4">
      <Dropzone compact then="reread" start={(files) => startAddDocuments(transactionId, null, files)}
        label="Add more of the file"
        hint="Missing an addendum or disclosure? Add it now or any time after you confirm. Adding now re-reads the file, so unsaved edits here are replaced." />
      <div className="mt-2"><DiscardDraft id={transactionId} /></div>
    </div>
  );
}
