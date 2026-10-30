"use client";
import { useActionState, useState } from "react";
import { confirmTransaction, type ConfirmState } from "./actions";
import { Badge, Card, SectionTitle, cx, inputCls } from "@/components/ui";
import { ShowSource, type SourceTarget } from "@/components/SourceViewer";
import { DatePreview } from "@/components/DatePreview";
import type { DeadlineRule } from "@/lib/deadlines/compute";
import { ADDENDA, ADDENDUM_KEYS, DISCLOSURE_LABELS, DISCLOSURE_STATUSES, FINANCING_LABELS, FINANCING_TYPES } from "@/lib/addenda";

export type FieldMeta = {
  confidence: "high" | "medium" | "low"; found: boolean; value: unknown;
  doc: number | null; page: number | null; quote: string | null; box: number[] | null; source: string | null;
};
export type ContactDraft = { role: string; full_name: string; company: string; email: string; phone: string };
type Addendum = { key: string; name: string; form_number: string | null; doc: number | null; page: number | null; evidence: "attached" | "checked_only" };

const ROLES: [string, string][] = [
  ["buyer", "Buyer"], ["seller", "Seller"], ["listing_agent", "Listing agent"], ["buyer_agent", "Buyer's agent"],
  ["title_company", "Title"], ["escrow_officer", "Escrow officer"], ["lender", "Lender"], ["other", "Other"],
];

const needsLook = (m?: FieldMeta) => !!m && (!m.found || m.confidence !== "high");
const targetOf = (m: FieldMeta | undefined, label: string): SourceTarget | null =>
  m && m.found ? { doc: m.doc, page: m.page, quote: m.quote, box: m.box, value: m.value, label } : null;

function Provenance({ m, label, confirmed }: { m?: FieldMeta; label: string; confirmed: boolean }) {
  if (!m || confirmed) {
    const t = targetOf(m, label);
    return t ? <div className="mt-1"><ShowSource target={t} /></div> : null;
  }
  if (!m.found) return <div className="mt-1 text-xs font-medium text-warn">Not found in the contract. Fill in if you have it.</div>;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
      {!confirmed && m.confidence !== "high" && <Badge tone="warn">{m.confidence === "low" ? "Low confidence" : "Check this"}</Badge>}
      <ShowSource target={targetOf(m, label)!} />
      {m.source && <span>{m.source}</span>}
    </div>
  );
}

// Module-level so inputs keep what the agent typed when other parts of the form re-render.
function FieldInput({ name, label, type = "text", inputMode, className, value, meta, confirmed }: {
  name: string; label: string; type?: string; inputMode?: "decimal" | "numeric"; className?: string;
  value: string; meta?: FieldMeta; confirmed: boolean;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="text-sm font-medium">{label}</span>
      <input name={name} type={type} inputMode={inputMode} defaultValue={value}
        className={cx(inputCls, "mt-1", !confirmed && needsLook(meta) && "border-warn bg-warn-soft/40")} />
      <Provenance m={meta} label={label} confirmed={confirmed} />
    </label>
  );
}

const num = (s: FormDataEntryValue | null) => {
  const t = String(s ?? "").replace(/[$,\s]/g, "");
  return t === "" || isNaN(Number(t)) ? null : Number(t);
};

export function ReviewForm(props: {
  id: string; confirmed: boolean; values: Record<string, unknown>; meta: Record<string, FieldMeta>;
  extractedAddenda: Addendum[]; selectedAddenda: string[]; contacts: ContactDraft[]; warnings: string[];
  docCount: number; hasScan: boolean;
  team: { id: string; full_name: string | null; email: string; role: string }[] | null;
  agentHint: string | null;
  rules: DeadlineRule[];
  currentDeadlines: { key: string; label: string; due_date: string; due_time: string | null }[] | null;
}) {
  const { id, confirmed, values, meta } = props;
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmTransaction.bind(null, id), undefined);
  const [contacts, setContacts] = useState<ContactDraft[]>(props.contacts);
  const v = (k: string) => (values[k] == null ? "" : String(values[k]));
  const [dates, setDates] = useState({
    effective_date: v("effective_date") || null, closing_date: v("closing_date") || null,
    option_period_days: num(v("option_period_days")), survey_days: num(v("survey_days")),
  });
  const flagged = Object.values(meta).filter(needsLook).length;
  const found = new Map(props.extractedAddenda.map((a) => [a.key, a]));
  const F = (p: { name: string; label: string; type?: string; inputMode?: "decimal" | "numeric"; className?: string }) =>
    ({ ...p, value: v(p.name), meta: meta[p.name], confirmed });

  return (
    <form action={action} onChange={(e) => {
      const fd = new FormData(e.currentTarget);
      setDates({
        effective_date: String(fd.get("effective_date") || "") || null, closing_date: String(fd.get("closing_date") || "") || null,
        option_period_days: num(fd.get("option_period_days")), survey_days: num(fd.get("survey_days")),
      });
    }}>
      <h1 className="text-xl font-bold">{confirmed ? "Edit deal details" : "Check what we read"}</h1>
      <p className="mt-1 text-sm text-muted">
        {confirmed
          ? "Saving recalculates every dependent date and adds or removes checklist tasks. Finished tasks stay finished."
          : `Read from ${props.docCount} document${props.docCount === 1 ? "" : "s"}${props.hasScan ? " (includes a scan)" : ""}. ${flagged ? `${flagged} field${flagged === 1 ? "" : "s"} need a look.` : "Everything read cleanly. Give it a once-over."} Tap a page link to see where each value came from. Nothing is saved until you confirm.`}
      </p>

      {props.warnings.length > 0 && (
        <Card className="mt-4 border-warn bg-warn-soft">
          <div className="text-sm font-semibold text-warn">Heads up</div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{props.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Card>
      )}

      <SectionTitle>The deal</SectionTitle>
      <Card className="space-y-4">
        <div>
          <span className="text-sm font-medium">Your brokerage represents</span>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(["buyer", "seller", "both"] as const).map((s) => (
              <label key={s} className="cursor-pointer">
                <input type="radio" name="side" value={s} defaultChecked={values.side === s} className="peer sr-only" />
                <span className="block rounded-xl border border-line bg-white py-2.5 text-center text-sm peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:font-semibold peer-checked:text-brand">
                  {s === "both" ? "Both" : s === "buyer" ? "Buyer" : "Seller"}
                </span>
              </label>
            ))}
          </div>
          {!confirmed && values.side != null && <p className="mt-1 text-xs text-muted">Suggested from the license numbers on the broker information page.</p>}
        </div>
        {props.team ? (
          <label className="block">
            <span className="text-sm font-medium">Agent on this deal</span>
            <select name="agent_member_id" defaultValue={v("agent_member_id")} className={cx(inputCls, "mt-1")}>
              <option value="">Unassigned</option>
              {props.team.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
            </select>
            {props.agentHint && <p className="mt-1 text-xs text-muted">{props.agentHint}</p>}
          </label>
        ) : <input type="hidden" name="agent_member_id" value={v("agent_member_id")} />}
        <FieldInput {...F({ name: "property_street", label: "Property address" })} />
        <div className="grid grid-cols-6 gap-3">
          <FieldInput {...F({ name: "property_city", label: "City", className: "col-span-3" })} />
          <FieldInput {...F({ name: "property_state", label: "State", className: "col-span-1" })} />
          <FieldInput {...F({ name: "property_zip", label: "ZIP", inputMode: "numeric", className: "col-span-2" })} />
        </div>
        <FieldInput {...F({ name: "property_county", label: "County" })} />
        <FieldInput {...F({ name: "legal_description", label: "Legal description" })} />
        <FieldInput {...F({ name: "contract_form", label: "Contract form" })} />
      </Card>

      <SectionTitle>Money</SectionTitle>
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldInput {...F({ name: "sales_price", label: "Sales price", inputMode: "decimal" })} />
          <FieldInput {...F({ name: "financed_amount", label: "Financed amount", inputMode: "decimal" })} />
          <FieldInput {...F({ name: "earnest_money", label: "Earnest money", inputMode: "decimal" })} />
          <FieldInput {...F({ name: "option_fee", label: "Option fee", inputMode: "decimal" })} />
        </div>
        <label className="block">
          <span className="text-sm font-medium">Financing</span>
          <select name="financing_type" defaultValue={v("financing_type")} className={cx(inputCls, "mt-1", !confirmed && needsLook(meta.financing_type) && "border-warn")}>
            <option value="">Not sure</option>
            {FINANCING_TYPES.map((f) => <option key={f} value={f}>{FINANCING_LABELS[f]}</option>)}
          </select>
          <Provenance m={meta.financing_type} label="Financing" confirmed={confirmed} />
        </label>
      </Card>

      <SectionTitle>Dates and day counts</SectionTitle>
      <Card className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FieldInput {...F({ name: "effective_date", label: "Effective date", type: "date" })} />
          <FieldInput {...F({ name: "closing_date", label: "Closing date", type: "date" })} />
          <FieldInput {...F({ name: "option_period_days", label: "Option period (days)", inputMode: "numeric" })} />
          <FieldInput {...F({ name: "survey_days", label: "Survey (days)", inputMode: "numeric" })} />
        </div>
      </Card>
      <div className="mt-3">
        <div className="mb-1 text-sm font-medium">Deadlines these terms produce</div>
        <DatePreview rules={props.rules} deal={dates} current={props.currentDeadlines} />
      </div>

      <SectionTitle>Addenda and disclosures</SectionTitle>
      <Card className="space-y-4">
        <div className="space-y-2">
          {ADDENDUM_KEYS.filter((k) => k !== "other").map((k) => {
            const a = found.get(k);
            return (
              <div key={k} className="flex items-start gap-3">
                <input id={`ad-${k}`} type="checkbox" name="addenda" value={k} defaultChecked={props.selectedAddenda.includes(k)} className="mt-1 h-5 w-5 accent-[var(--color-brand)]" />
                <div className="text-sm">
                  <label htmlFor={`ad-${k}`}>{ADDENDA[k]}</label>
                  {a && (
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
                      {a.evidence === "checked_only" ? <Badge tone="warn">Checked in Para 22 but not attached</Badge> : "Found"}
                      {a.form_number && <span>· {a.form_number}</span>}
                      <ShowSource target={{ doc: a.doc, page: a.page, quote: a.form_number ?? a.name, box: null, label: ADDENDA[k] }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <label className="block">
          <span className="text-sm font-medium">Seller's Disclosure (Para 7B)</span>
          <select name="seller_disclosure" defaultValue={v("seller_disclosure")} className={cx(inputCls, "mt-1")}>
            {DISCLOSURE_STATUSES.map((s) => <option key={s} value={s}>{DISCLOSURE_LABELS[s]}</option>)}
          </select>
          <Provenance m={meta.seller_disclosure} label="Seller's Disclosure" confirmed={confirmed} />
        </label>
      </Card>

      <SectionTitle action={
        <button type="button" className="text-sm font-medium text-brand"
          onClick={() => setContacts([...contacts, { role: "other", full_name: "", company: "", email: "", phone: "" }])}>
          + Add person
        </button>
      }>People</SectionTitle>
      <div className="space-y-2">
        {contacts.length === 0 && <p className="text-sm text-muted">No people found. Add buyers, sellers, the other agent, title, and lender.</p>}
        {contacts.map((c, i) => {
          const set = (patch: Partial<ContactDraft>) => setContacts(contacts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <Card key={i} className="space-y-2">
              <div className="flex gap-2">
                <select value={c.role} onChange={(e) => set({ role: e.target.value })} className={cx(inputCls, "w-40")}>
                  {ROLES.map(([r, l]) => <option key={r} value={r}>{l}</option>)}
                </select>
                <input value={c.full_name} onChange={(e) => set({ full_name: e.target.value })} placeholder="Name" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input value={c.company} onChange={(e) => set({ company: e.target.value })} placeholder="Company" className={inputCls} />
                <input value={c.email} onChange={(e) => set({ email: e.target.value })} placeholder="Email" type="email" className={inputCls} />
                <input value={c.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Phone" type="tel" className={inputCls} />
              </div>
              <button type="button" className="text-xs text-muted hover:text-bad" onClick={() => setContacts(contacts.filter((_, j) => j !== i))}>Remove</button>
            </Card>
          );
        })}
      </div>
      <input type="hidden" name="contacts" value={JSON.stringify(contacts)} />

      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        {state?.error && <p className="mb-2 text-sm text-bad">{state.error}</p>}
        <button disabled={pending} className="w-full rounded-xl bg-brand px-5 py-3.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
          {pending ? "Saving..." : confirmed ? "Save changes" : "Confirm and build checklist"}
        </button>
      </div>
    </form>
  );
}
