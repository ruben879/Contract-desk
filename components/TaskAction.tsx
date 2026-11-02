"use client";
import { useRef, useTransition } from "react";
import { setChecklistStatus, startAddDocuments } from "@/app/actions";
import { ACCEPT, useUploader } from "./Dropzone";
import { missingTask } from "@/lib/missing-docs";
import { cx } from "./ui";

const primary = "relative z-10 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 py-2.5 text-[15px] font-medium text-white hover:bg-brand-dark disabled:opacity-45";

/**
 * The one primary action for a task, with the verb on the button:
 * "Add the Seller's Disclosure" for a missing document (opens the camera or files), else "Mark done".
 */
export function TaskAction({ itemId, ruleKey, transactionId, block, onDone }: {
  itemId: string; ruleKey: string; transactionId: string; block?: boolean;
  onDone?: () => void;   // called as soon as Mark done is pressed, so the card can slide away
}) {
  const doc = missingTask(ruleKey);
  return doc
    ? <UploadAction transactionId={transactionId} slot={doc.slot} verb={doc.verb} block={block} />
    : <MarkDone itemId={itemId} block={block} onDone={onDone} />;
}

function MarkDone({ itemId, block, onDone }: { itemId: string; block?: boolean; onDone?: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => { onDone?.(); start(() => setChecklistStatus(itemId, "done")); }} className={cx(primary, block && "w-full")}>
      {pending ? "Saving..." : "Mark done"}
    </button>
  );
}

function UploadAction({ transactionId, slot, verb, block }: { transactionId: string; slot: string; verb: string; block?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, busy, error } = useUploader((files) => startAddDocuments(transactionId, slot, files), "reread");
  return (
    <div className={cx("relative z-10", block && "w-full")}>
      <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className={cx(primary, block && "w-full")}>
        {busy ?? verb}
      </button>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {error && <p className="mt-1 text-sm text-bad">{error}</p>}
    </div>
  );
}
