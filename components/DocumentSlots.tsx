"use client";
import { useRef, useState, useTransition } from "react";
import { moveDocument, startAddDocuments } from "@/app/actions";
import { ACCEPT, useUploader } from "./Dropzone";
import { Badge, cx } from "./ui";

type Doc = { id: string; file_name: string; url?: string; slot: string | null; slot_source: string | null; page_count: number | null; is_scanned: boolean | null };
type Slot = { key: string; label: string; many?: boolean };

// Looks like a small "Move" link; tapping it opens the phone's native picker.
function MoveSelect({ doc, slots }: { doc: Doc; slots: Slot[] }) {
  const [pending, start] = useTransition();
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer items-center rounded-md px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-brand-soft">
      {pending ? "Moving..." : doc.slot ? "Move" : "File it"}
      <select aria-label="Move to slot" value={doc.slot ?? ""} disabled={pending}
        onChange={(e) => start(() => moveDocument(doc.id, e.target.value))}
        className="absolute inset-0 cursor-pointer opacity-0">
        {!doc.slot && <option value="">Choose a slot</option>}
        {slots.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </label>
  );
}

function DocLine({ d, slots }: { d: Doc; slots: Slot[] }) {
  return (
    <li className="text-sm">
      <a href={d.url} target="_blank" className="block break-all text-brand">{d.file_name}</a>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {d.page_count ? <span>{d.page_count} page{d.page_count === 1 ? "" : "s"}{d.is_scanned ? " · scan" : ""}</span> : null}
        {d.slot_source === "reader" && <Badge tone="neutral">Filed by reader</Badge>}
        <MoveSelect doc={d} slots={slots} />
      </div>
    </li>
  );
}

function SlotRow({ transactionId, slot, docs, allSlots }: { transactionId: string; slot: Slot; docs: Doc[]; allSlots: Slot[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { upload, busy, error } = useUploader((files) => startAddDocuments(transactionId, slot.key, files), "reread");
  const filled = docs.length > 0;

  return (
    <li
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
      className={cx("px-4 py-3 transition", over && "bg-brand-soft")}
    >
      <div className="flex items-center gap-3">
        <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
          filled ? "bg-good text-white" : "border-2 border-dashed border-line")}>{filled ? "✓" : ""}</span>
        <span className={cx("min-w-0 flex-1 text-sm", filled ? "font-medium" : "text-muted")}>{slot.label}</span>
        <button type="button" disabled={!!busy} onClick={() => input.current?.click()}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft disabled:opacity-50">
          {busy ?? "Add"}
        </button>
        <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      </div>
      {docs.length > 0 && (
        <ul className="mt-1.5 space-y-2 pl-8">
          {docs.map((d) => <DocLine key={d.id} d={d} slots={allSlots} />)}
        </ul>
      )}
      {error && <p className="mt-1 pl-8 text-xs text-bad">{error}</p>}
    </li>
  );
}

export function DocumentSlots({ transactionId, slots, allSlots, docs }: { transactionId: string; slots: Slot[]; allSlots: Slot[]; docs: Doc[] }) {
  const unfiled = docs.filter((d) => !d.slot || !slots.some((s) => s.key === d.slot));
  const filledCount = slots.filter((s) => docs.some((d) => d.slot === s.key)).length;
  return (
    <div>
      <div className="mb-2 text-xs text-muted">{filledCount} of {slots.length} filed. Drop a PDF on a row, or tap Add to use your phone's camera. New documents are checked for changes.</div>
      <ul className="divide-y divide-line rounded-card bg-card shadow-card">
        {unfiled.length > 0 && (
          <li className="bg-warn-soft/50 px-4 py-3">
            <div className="text-sm font-medium">Not filed yet</div>
            <ul className="mt-1 space-y-2">
              {unfiled.map((d) => <DocLine key={d.id} d={d} slots={allSlots} />)}
            </ul>
          </li>
        )}
        {slots.map((s) => (
          <SlotRow key={s.key} transactionId={transactionId} slot={s} allSlots={allSlots} docs={docs.filter((d) => d.slot === s.key)} />
        ))}
      </ul>
    </div>
  );
}
