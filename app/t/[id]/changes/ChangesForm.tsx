"use client";
import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { confirmChanges, dismissChanges, notThisDeal, type ChangesState } from "./actions";
import { Badge, Card, SectionTitle, cx, inputCls } from "@/components/ui";
import { ShowSource } from "@/components/SourceViewer";
import { DatePreview } from "@/components/DatePreview";
import { buildChecklist } from "@/lib/checklist/rules";
import type { DeadlineRule } from "@/lib/deadlines/compute";
import { DISCLOSURE_LABELS, DISCLOSURE_STATUSES, FINANCING_LABELS, FINANCING_TYPES, type AddendumKey } from "@/lib/addenda";
import { addendumName, formatTerm, TERM_KIND, type ProposedChange, type Terms } from "@/lib/terms";

type Addendum = { key: string; name: string; form_number: string | null; doc: number | null; page: number | null };

function coerce(key: string, raw: string): unknown {
  const kind = TERM_KIND[key];
  const t = raw.trim();
  if (t === "") return null;
  if (kind === "money") { const n = Number(t.replace(/[$,\s]/g, "")); return isNaN(n) ? null : n; }
  if (kind === "days") { const n = parseInt(t, 10); return isNaN(n) ? null : n; }
  return t;
}

function ValueInput({ change, value, onChange }: { change: ProposedChange; value: string; onChange: (v: string) => void }) {
  const kind = TERM_KIND[change.key as string];
  const name = `value_${String(change.key)}`;
  if (kind === "financing") return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {FINANCING_TYPES.map((f) => <option key={f} value={f}>{FINANCING_LABELS[f]}</option>)}
    </select>
  );
  if (kind === "disclosure") return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {DISCLOSURE_STATUSES.map((s) => <option key={s} value={s}>{DISCLOSURE_LABELS[s]}</option>)}
    </select>
  );
  return <input name={name} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}
    type={kind === "date" ? "date" : "text"} inputMode={kind === "money" ? "decimal" : kind === "days" ? "numeric" : undefined} />;
}

export function ChangesForm(props: {
  transactionId: string; extractionId: string; address: string; docNames: string[]; summary: string;
  current: Terms; proposed: ProposedChange[]; addendaAdded: Addendum[]; addendaRemoved: string[]; notes: string[];
  rules: DeadlineRule[];
  currentDeadlines: { key: string; label: string; due_date: string; due_time: string | null }[];
  currentTasks: { rule_key: string; title: string; status: string }[];
  routed: { from: string | null; subject: string | null; auto: boolean } | null;
}) {
  const { proposed, current } = props;
  const [state, action, pending] = useActionState<ChangesState, FormData>(confirmChanges.bind(null, props.transactionId, props.extractionId), undefined);
  const [dismissing, startDismiss] = useTransition();
  const [use, setUse] = useState<Record<string, boolean>>(Object.fromEntries(proposed.map((c) => [c.key, true])));
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(proposed.map((c) => [c.key, c.after == null ? "" : String(c.after)])));
  const [adds, setAdds] = useState<Record<string, boolean>>(Object.fromEntries(props.addendaAdded.map((a) => [a.key, true])));
  const [rems, setRems] = useState<Record<string, boolean>>(Object.fromEntries(props.addendaRemoved.map((k) => [k, true])));

  // The terms as they'd be after confirming, for the live date and task preview.
  const next = useMemo<Terms>(() => {
    const t: Terms = { ...current, addenda: [...current.addenda] };
    for (const c of proposed) if (use[c.key]) (t as any)[c.key] = coerce(String(c.key), vals[c.key] ?? "");
    for (const a of props.addendaAdded) if (adds[a.key] && !t.addenda.includes(a.key as AddendumKey)) t.addenda.push(a.key as AddendumKey);
    t.addenda = t.addenda.filter((a) => !rems[a]);
    if (adds.sellers_disclosure && t.seller_disclosure !== "not_required" && !use.seller_disclosure) t.seller_disclosure = "received";
    return t;
  }, [current, proposed, use, vals, adds, rems, props.addendaAdded]);

  const tasks = useMemo(() => {
    const now = buildChecklist({ side: next.side, addenda: next.addenda, financing_type: next.financing_type, seller_disclosure: next.seller_disclosure, missing_docs: next.missing_docs });
    const has = new Set(props.currentTasks.map((t) => t.rule_key));
    const keep = new Set(now.map((t) => t.rule_key));
    const gone = props.currentTasks.filter((t) => t.status === "open" && !keep.has(t.rule_key));
    const arrived = (t: { rule_key: string }) => t.rule_key.startsWith("missing_") && next.addenda.includes(t.rule_key.slice(8) as AddendumKey);
    return {
      added: now.filter((t) => !has.has(t.rule_key)).map((t) => t.title),
      removed: gone.filter((t) => !arrived(t)).map((t) => t.title),
      completed: gone.filter(arrived).map((t) => t.title),
    };
  }, [next, props.currentTasks]);

  const nothing = proposed.length === 0 && props.addendaAdded.length === 0 && props.addendaRemoved.length === 0;
  const anySelected = Object.values(use).some(Boolean) || Object.values(adds).some(Boolean) || Object.values(rems).some(Boolean);

  return (
    <form action={action}>
      <div className="text-sm text-muted">{props.address}</div>
      <h1 className="text-xl font-bold">{nothing ? "Check this document" : "Confirm what changed"}</h1>
      <p className="mt-1 text-sm text-muted">
        From {props.docNames.join(", ")}. {nothing
          ? "We didn't find any change to price, dates, or terms. Look it over and confirm it belongs on this deal."
          : "Nothing changes on the deal until you confirm."}
      </p>
      {props.routed && (
        <Card className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            Emailed{props.routed.from ? ` from ${props.routed.from}` : ""}{props.routed.subject ? ` ("${props.routed.subject}")` : ""}.{" "}
            {props.routed.auto ? "Matched to this deal by property address." : "Attached to this deal from the sorting queue."}
          </span>
          <button type="button" disabled={dismissing} onClick={() => startDismiss(() => notThisDeal(props.transactionId, props.extractionId))}
            className="font-medium text-bad">Not for this deal</button>
        </Card>
      )}
      {props.summary && <Card className="mt-3 bg-brand-soft text-sm">{props.summary}</Card>}

      {props.notes.length > 0 && (
        <Card className="mt-3 border-warn bg-warn-soft">
          <div className="text-sm font-semibold text-warn">Heads up</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{props.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Card>
      )}

      {proposed.length > 0 && (
        <>
          <SectionTitle>Terms</SectionTitle>
          <div className="space-y-2">
            {proposed.map((c) => {
              const key = String(c.key);
              return (
                <Card key={key} className={cx("space-y-2", !use[key] && "opacity-60")}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="change" value={key} checked={!!use[key]} onChange={(e) => setUse({ ...use, [key]: e.target.checked })} className="h-5 w-5 accent-[var(--color-brand)]" />
                    <span className="font-semibold">{c.label}</span>
                    {c.confidence !== "high" && <Badge tone="warn">{c.confidence === "low" ? "Low confidence" : "Check this"}</Badge>}
                  </label>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="text-sm text-muted line-through">{formatTerm(key, c.before)}</div>
                    <span className="text-muted">→</span>
                    <ValueInput change={c} value={vals[key] ?? ""} onChange={(v) => setVals({ ...vals, [key]: v })} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <ShowSource target={{ ...c.loc, value: c.after, label: c.label }} />
                    {c.loc.source && <span>{c.loc.source}</span>}
                    {c.note && <span>· {c.note}</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {(props.addendaAdded.length > 0 || props.addendaRemoved.length > 0) && (
        <>
          <SectionTitle>Addenda and disclosures</SectionTitle>
          <Card className="space-y-2">
            {props.addendaAdded.map((a) => (
              <label key={a.key} className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="add" value={a.key} checked={!!adds[a.key]} onChange={(e) => setAdds({ ...adds, [a.key]: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" />
                <span><Badge tone="good">Added</Badge> {addendumName(a.key)}
                  <span className="ml-1 inline-block"><ShowSource target={{ doc: a.doc, page: a.page, quote: a.form_number ?? a.name, box: null, label: addendumName(a.key) }} /></span>
                </span>
              </label>
            ))}
            {props.addendaRemoved.map((k) => (
              <label key={k} className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="remove" value={k} checked={!!rems[k]} onChange={(e) => setRems({ ...rems, [k]: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" />
                <span><Badge tone="bad">Removed</Badge> {addendumName(k)}</span>
              </label>
            ))}
          </Card>
        </>
      )}

      {!nothing && (
        <>
          <SectionTitle>Dates after this change</SectionTitle>
          <DatePreview rules={props.rules} deal={next} current={props.currentDeadlines} />

          {(tasks.added.length > 0 || tasks.removed.length > 0 || tasks.completed.length > 0) && (
            <>
              <SectionTitle>Checklist after this change</SectionTitle>
              <Card className="space-y-1 text-sm">
                {tasks.added.map((t) => <div key={t}><Badge tone="good">Adds</Badge> {t}</div>)}
                {tasks.completed.map((t) => <div key={t}><Badge tone="good">Done</Badge> {t}</div>)}
                {tasks.removed.map((t) => <div key={t}><Badge tone="neutral">Drops</Badge> <span className="text-muted">{t}</span></div>)}
                <p className="pt-1 text-xs text-muted">Finished tasks are never removed.</p>
              </Card>
            </>
          )}
        </>
      )}

      <div className="sticky bottom-0 -mx-4 mt-6 space-y-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        {state?.error && <p className="text-sm text-bad">{state.error}</p>}
        {nothing ? (
          <button type="button" disabled={dismissing} onClick={() => startDismiss(() => dismissChanges(props.transactionId, props.extractionId))}
            className="w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {dismissing ? "Saving..." : "Looks right, nothing changes"}
          </button>
        ) : (
          <>
            <button disabled={pending || !anySelected} className="w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
              {pending ? "Saving..." : "Confirm changes"}
            </button>
            <button type="button" disabled={dismissing} onClick={() => startDismiss(() => dismissChanges(props.transactionId, props.extractionId))}
              className="w-full text-center text-sm text-muted hover:text-ink">
              None of these are real changes
            </button>
          </>
        )}
        <div className="text-center"><Link href={`/t/${props.transactionId}/review`} className="text-xs text-brand">Edit deal details by hand instead</Link></div>
      </div>
    </form>
  );
}
