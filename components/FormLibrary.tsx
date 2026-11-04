"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cx, inputCls } from "./ui";
import { confirmField, finishFormUpload, formFileLink, replaceFormVersion, startFormUpload, updateFormDetails } from "@/app/settings/forms/actions";

export type SlotOption = { key: string; label: string };
export type TermOption = { key: string; label: string };

async function putFile(file: File) {
  const { path, token } = await startFormUpload();
  const { error } = await supabaseBrowser().storage.from("library-forms").uploadToSignedUrl(path, token, file, { contentType: "application/pdf" });
  if (error) throw new Error("The upload didn't go through. Try again.");
  return path;
}

/** The acknowledgment, word for word. Not editable. */
export function TxrAcknowledgment({ text, checked, onChange }: { text: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-xl bg-warn-soft px-4 py-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-brand)]" />
      <span className="text-[15px]">{text}</span>
    </label>
  );
}

export function AddForm({ slots, ackText }: { slots: SlotOption[]; ackText: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [formClass, setFormClass] = useState("");
  const [slot, setSlot] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const txr = formClass === "TXR";
  const ready = file && name.trim() && formClass && (!txr || ack);
  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1 block text-[14px] font-medium">Fillable PDF</span>
        <input type="file" accept="application/pdf,.pdf" className={inputCls} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !name) setName(f.name.replace(/\.pdf$/i, "")); }} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[14px] font-medium">Name agents will see</span>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[14px] font-medium">Published by</span>
        <select className={inputCls} value={formClass} onChange={(e) => { setFormClass(e.target.value); setAck(false); }}>
          <option value="">Pick one</option><option value="TREC">TREC</option><option value="TXR">Texas REALTORS (TXR)</option><option value="Brokerage">Your brokerage</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[14px] font-medium">Paragraph 22 line (optional)</span>
        <select className={inputCls} value={slot} onChange={(e) => setSlot(e.target.value)}>
          <option value="">None: add it at the end of the packet</option>
          {slots.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      {txr && <TxrAcknowledgment text={ackText} checked={ack} onChange={setAck} />}
      {err && <p className="text-[15px] font-medium text-bad">{err}</p>}
      <button disabled={!ready || busy} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-[15px] font-medium text-white disabled:opacity-45"
        onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const path = await putFile(file!);
            const r = await finishFormUpload({ path, fileName: file!.name, displayName: name, formClass, p22Slot: slot || null, acknowledged: ack });
            if ("error" in r) setErr(r.error); else router.push(`/settings/forms/${r.formId}`);
          } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add the form."); }
          setBusy(false);
        }}>
        {busy ? "Checking the form…" : "Add form"}
      </button>
    </div>
  );
}

export function ReplaceVersion({ formId, txr, ackText }: { formId: string; txr: boolean; ackText: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <input type="file" accept="application/pdf,.pdf" className={inputCls} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {txr && file && <TxrAcknowledgment text={ackText} checked={ack} onChange={setAck} />}
      {err && <p className="text-[15px] font-medium text-bad">{err}</p>}
      <button disabled={!file || busy || (txr && !ack)} className="inline-flex min-h-11 items-center justify-center rounded-xl border-[1.5px] border-line px-4 text-[15px] font-medium text-brand disabled:opacity-45"
        onClick={async () => {
          setBusy(true); setErr(null);
          try {
            const path = await putFile(file!);
            const r = await replaceFormVersion({ formId, path, fileName: file!.name, acknowledged: ack });
            if ("error" in r) setErr(r.error); else { setFile(null); router.refresh(); }
          } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add the new version."); }
          setBusy(false);
        }}>
        {busy ? "Checking the form…" : "Upload new version"}
      </button>
    </div>
  );
}

export function FormDetails({ formId, initial, slots, ackText }: {
  formId: string; initial: { displayName: string; formClass: string; p22Slot: string | null; archived: boolean }; slots: SlotOption[]; ackText: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const becomingTxr = v.formClass === "TXR" && initial.formClass !== "TXR";
  return (
    <div className="flex flex-col gap-3">
      <label className="block"><span className="mb-1 block text-[14px] font-medium">Name</span>
        <input className={inputCls} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} /></label>
      <label className="block"><span className="mb-1 block text-[14px] font-medium">Published by</span>
        <select className={inputCls} value={v.formClass} onChange={(e) => { setV({ ...v, formClass: e.target.value }); setAck(false); }}>
          <option value="TREC">TREC</option><option value="TXR">Texas REALTORS (TXR)</option><option value="Brokerage">Your brokerage</option>
        </select></label>
      <label className="block"><span className="mb-1 block text-[14px] font-medium">Paragraph 22 line</span>
        <select className={inputCls} value={v.p22Slot ?? ""} onChange={(e) => setV({ ...v, p22Slot: e.target.value || null })}>
          <option value="">None: add it at the end of the packet</option>
          {slots.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select></label>
      <label className="flex min-h-11 items-center gap-3 text-[15px]">
        <input type="checkbox" checked={v.archived} onChange={(e) => setV({ ...v, archived: e.target.checked })} className="h-5 w-5 accent-[var(--color-brand)]" />
        Archived (agents can't pick it; past packets are unchanged)
      </label>
      {becomingTxr && <TxrAcknowledgment text={ackText} checked={ack} onChange={setAck} />}
      {msg && <p className="text-[15px] text-muted">{msg}</p>}
      <button disabled={pending || (becomingTxr && !ack)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-[15px] font-medium text-white disabled:opacity-45"
        onClick={() => start(async () => { const r = await updateFormDetails({ formId, ...v, acknowledged: ack }); setMsg("error" in r ? r.error : "Saved."); if (!("error" in r)) router.refresh(); })}>
        Save
      </button>
    </div>
  );
}

export type MapRow = { name: string; type: string; page: number; suggestion: string; decided: string | null };

/** Map each field once. The suggestion is only a starting point: every row needs its own Confirm. */
export function FieldMapper({ versionId, rows, terms }: { versionId: string; rows: MapRow[]; terms: TermOption[] }) {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const shown = rows.filter((r) => filter === "all" || !r.decided);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["open", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cx("min-h-11 rounded-xl px-3 text-[14px] font-medium", filter === f ? "bg-brand-soft text-brand" : "text-muted")}>
              {f === "open" ? `Still to map (${rows.filter((r) => !r.decided).length})` : `All fields (${rows.length})`}
            </button>
          ))}
        </div>
        <OpenFile versionId={versionId} />
      </div>
      {shown.length === 0 ? <p className="text-[15px] text-muted">{filter === "open" ? "Every field is mapped." : "This form has no fields to map."}</p> : (
        <ul className="flex flex-col">
          {shown.map((r) => <MapRowView key={r.name} versionId={versionId} row={r} terms={terms} />)}
        </ul>
      )}
    </div>
  );
}

function MapRowView({ versionId, row, terms }: { versionId: string; row: MapRow; terms: TermOption[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState(row.decided ?? row.suggestion);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const label = (k: string) => (k === "blank" ? "Leave blank" : terms.find((t) => t.key === k)?.label ?? k);
  return (
    <li className="border-b border-line py-3 last:border-b-0">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="break-all font-mono text-[14px]">{row.name}</span>
        <span className="text-[13px] text-muted">Page {row.page} · {row.type === "check" ? "checkbox" : row.type}</span>
      </div>
      <div className="flex gap-2">
        <select className={inputCls} value={choice} onChange={(e) => setChoice(e.target.value)} disabled={pending}>
          <option value="blank">Leave blank (the agent sees it in Blanks left)</option>
          {terms.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <button disabled={pending} className={cx("min-h-11 shrink-0 rounded-xl px-3 text-[14px] font-medium", row.decided === choice ? "bg-good-soft text-good" : "bg-brand text-white")}
          onClick={() => start(async () => { const r = await confirmField(versionId, row.name, choice); if ("error" in r) setErr(r.error); else { setErr(null); router.refresh(); } })}>
          {row.decided === choice ? "Confirmed" : "Confirm"}
        </button>
      </div>
      {!row.decided && <p className="mt-1 text-[13px] text-muted">Suggested: {label(row.suggestion)}. Not confirmed yet.</p>}
      {row.decided && row.decided !== choice && <p className="mt-1 text-[13px] text-warn">Currently {label(row.decided)}. Confirm to change it.</p>}
      {err && <p className="mt-1 text-[13px] text-bad">{err}</p>}
    </li>
  );
}

function OpenFile({ versionId }: { versionId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} className="min-h-11 text-[14px] font-medium text-brand"
      onClick={async () => { setBusy(true); const url = await formFileLink(versionId); if (url) window.open(url, "_blank", "noopener"); setBusy(false); }}>
      Open the form
    </button>
  );
}
