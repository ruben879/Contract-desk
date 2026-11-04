"use client";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { cx, inputCls, money } from "@/components/ui";
import { saveTerms, goToPreview } from "@/app/o/actions";
import {
  OFFER_FINANCING, OFFER_FINANCING_LABELS, appraisalAllowed, applyBrokerageDefaults, type OfferDefaults, cashPortion, deadlinePreview, enforceRules, exportBlockers,
  isLoan, suggestLeadPaint, type CatalogTerm, type OfferAddendum, type OfferTerms,
} from "@/lib/offer/terms";
import { formatDate } from "@/lib/dates";

export type PickableForm = { id: string; name: string; formClass: string };

// One scrolling Terms screen. Every change saves on its own; the one next action is Preview.
export function OfferTermsEditor({ id, initial, titleCompanies, forms, miniTerms, locked, defaults, defaultTitleCompany }: {
  id: string; initial: OfferTerms; titleCompanies: string[]; forms: PickableForm[];
  /** The brokerage's computations, applied live as the agent types (the server applies them again on save). */
  defaults: OfferDefaults; defaultTitleCompany: string | null;
  /** Terms only picked Uploaded forms ask for, keyed by form id. */
  miniTerms: Record<string, CatalogTerm[]>;
  locked: boolean;
}) {
  const [t, setT] = useState<OfferTerms>(initial);
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const [err, setErr] = useState<string | null>(null);
  const [going, startGo] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(t);

  const update = (patch: Partial<OfferTerms>) => {
    if (locked) return;
    setT((prev) => {
      // Whatever the agent types into is theirs from now on: computations stop moving it.
      const touched = [...new Set([...prev.touched, ...Object.keys(patch).filter((k) => k !== "sales_price")])];
      const next = enforceRules(applyBrokerageDefaults({ ...prev, ...patch, touched }, defaults, defaultTitleCompany));
      latest.current = next;
      return next;
    });
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  async function flush() {
    timer.current = null;
    const r = await saveTerms(id, latest.current);
    if ("error" in r) { setState("error"); setErr(r.error); } else { setState("saved"); setErr(null); }
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const loan = isLoan(t.financing_type);
  const has = (a: OfferAddendum) => t.addenda.includes(a);
  const toggle = (a: OfferAddendum, on: boolean) => update({ addenda: on ? [...t.addenda, a] : t.addenda.filter((x) => x !== a) });
  const blockers = exportBlockers(t);
  const previews = useMemo(() => deadlinePreview(t), [t]);
  const lbp = suggestLeadPaint(t);
  const cash = cashPortion(t);

  const preview = () => startGo(async () => {
    if (timer.current) { clearTimeout(timer.current); await flush(); }
    await goToPreview(id);
  });

  return (
    <div className="pb-40">
      {locked && <p className="mb-4 rounded-xl bg-paper px-4 py-3 text-[15px] text-muted">This offer was executed. The signed contract is now the record; these are the terms as written.</p>}

      <Group title="Parties">
        <NameList label="Buyer(s)" names={t.buyers} onChange={(buyers) => update({ buyers })} required />
        <NameList label="Seller(s)" names={t.sellers} onChange={(sellers) => update({ sellers })} />
      </Group>

      <Group title="Property">
        <Text label="Street address" value={t.property_street} onChange={(v) => update({ property_street: v })} required />
        <Row>
          <Text label="City" value={t.property_city} onChange={(v) => update({ property_city: v })} />
          <Text label="ZIP" value={t.property_zip} onChange={(v) => update({ property_zip: v })} inputMode="numeric" />
        </Row>
        <Text label="County" value={t.property_county} onChange={(v) => update({ property_county: v })} />
        <Row>
          <Text label="Lot" value={t.lot} onChange={(v) => update({ lot: v })} />
          <Text label="Block" value={t.block} onChange={(v) => update({ block: v })} />
        </Row>
        <Text label="Subdivision / addition" value={t.subdivision} onChange={(v) => update({ subdivision: v })} />
        <Num label="Year built" value={t.year_built} onChange={(v) => update({ year_built: v })} hint="Used only to suggest the lead-based paint addendum." />
      </Group>

      <Group title="Money">
        <Num label="Sales price" value={t.sales_price} onChange={(v) => update({ sales_price: v })} money required />
        <Row>
          <Num label="Earnest money" value={t.earnest_money} onChange={(v) => update({ earnest_money: v })} money
            hint={!t.touched.includes("earnest_money") ? `${defaults.earnest_pct}% of price` : undefined} />
          <Num label="Option fee" value={t.option_fee} onChange={(v) => update({ option_fee: v })} money
            hint={!t.touched.includes("option_fee") ? "From the price" : undefined} />
        </Row>
        <Num label="Option period (days)" value={t.option_period_days} onChange={(v) => update({ option_period_days: v })} />
        <Field label="Financing" group>
          <div className="flex flex-wrap gap-2">
            {OFFER_FINANCING.map((f) => (
              <Chip key={f} on={t.financing_type === f} onClick={() => update({ financing_type: f })}>{OFFER_FINANCING_LABELS[f]}</Chip>
            ))}
          </div>
        </Field>
        {t.financing_type === "cash" && <p className="text-[15px] text-muted">Cash: the full sales price goes in 3A{t.sales_price != null ? ` (${money(t.sales_price)})` : ""}; no loan in 3B.</p>}
        {loan && (
          <Inset title="Financing Addendum (included)">
            <Row>
              <Num label="Loan amount" value={t.financed_amount} onChange={(v) => update({ financed_amount: v })} money required />
              <Pct price={t.sales_price} amount={t.financed_amount} onChange={(v) => update({ financed_amount: v })} />
            </Row>
            <Row>
              <Num label="Term (years)" value={t.loan_term_years} onChange={(v) => update({ loan_term_years: v })} required />
              <Num label="Rate cap (%)" value={t.loan_rate_cap} onChange={(v) => update({ loan_rate_cap: v })} decimal required />
            </Row>
            <Num label="Buyer approval (days)" value={t.fin_approval_days} onChange={(v) => update({ fin_approval_days: v })} hint="Para 2A. Leave empty if the buyer isn't asking for this." />
            {cash != null && <p className="text-[14px] text-muted">Cash portion: {money(cash)}</p>}
          </Inset>
        )}
      </Group>

      <Group title="Dates">
        <Field label="Closing on or before">
          <input type="date" className={inputCls} value={t.closing_date ?? ""} disabled={locked} onChange={(e) => update({ closing_date: e.target.value || null })} />
        </Field>
        <p className="text-[15px] text-muted">Possession: at closing and funding.</p>
        {previews.length > 0 && (
          <ul className="rounded-xl bg-paper px-4 py-3 text-[15px]">
            {previews.map((p) => <li key={p.label} className="flex justify-between gap-3 py-0.5"><span>{p.label}</span><span className="text-right text-muted">{p.when}</span></li>)}
          </ul>
        )}
        <p className="text-[13.5px] text-muted">The effective date stays blank. It's filled in when the contract is signed.</p>
      </Group>

      <Group title="Title & survey">
        <Field label="Title company (escrow agent)">
          <input className={inputCls} list="title-cos" value={t.title_company ?? ""} disabled={locked} onChange={(e) => update({ title_company: e.target.value || null })} />
          <datalist id="title-cos">{titleCompanies.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Owner's title policy paid by (Para 6A)" group>
          <div className="flex gap-2">
            <Chip on={t.title_policy_payer === "seller"} onClick={() => update({ title_policy_payer: "seller" })}>Seller</Chip>
            <Chip on={t.title_policy_payer === "buyer"} onClick={() => update({ title_policy_payer: "buyer" })}>Buyer</Chip>
          </div>
        </Field>
        <Field label="Survey (Para 6C)" group>
          <div className="flex flex-col gap-2">
            {([["seller_existing", "Seller furnishes existing survey (T-47)"], ["buyer_new", "Buyer obtains a new survey"], ["seller_new", "Seller furnishes a new survey"]] as const).map(([v, l]) => (
              <label key={v} className="flex min-h-11 items-center gap-3 text-[15px]">
                <input type="radio" name="survey" checked={t.survey_option === v} disabled={locked} onChange={() => update({ survey_option: v })} className="h-5 w-5 accent-[var(--color-brand)]" />{l}
              </label>
            ))}
          </div>
        </Field>
        {t.survey_option && <Num label="Survey (days)" value={t.survey_days} onChange={(v) => update({ survey_days: v })} />}
        {t.survey_option === "seller_existing" && (
          <Field label="If the existing survey isn't accepted, a new one is paid by" group>
            <div className="flex gap-2">
              <Chip on={t.survey_new_payer === "seller"} onClick={() => update({ survey_new_payer: "seller" })}>Seller</Chip>
              <Chip on={t.survey_new_payer === "buyer"} onClick={() => update({ survey_new_payer: "buyer" })}>Buyer</Chip>
            </div>
          </Field>
        )}
      </Group>

      <Group title="Addenda">
        <Check label="Third Party Financing Addendum" on={loan} disabled hint={loan ? "Included with any loan." : "Comes in when you pick a loan type."} onChange={() => {}} />
        <Check label="HOA Addendum" on={has("hoa")} onChange={(v) => toggle("hoa", v)} disabled={locked} />
        {has("hoa") && (
          <Inset>
            <Text label="Association name and phone" value={t.hoa_association} onChange={(v) => update({ hoa_association: v })} />
            <Row>
              <Num label="Subdivision info (days)" value={t.hoa_info_days} onChange={(v) => update({ hoa_info_days: v })} />
              <Num label="Buyer pays fees up to" value={t.hoa_fee_cap} onChange={(v) => update({ hoa_fee_cap: v })} money />
            </Row>
          </Inset>
        )}
        <Check label="Lead-Based Paint Addendum" on={has("lead_based_paint")} onChange={(v) => toggle("lead_based_paint", v)} disabled={locked}
          hint={lbp && !has("lead_based_paint") ? `Suggested: built in ${t.year_built}, before 1978.` : undefined} tone={lbp && !has("lead_based_paint") ? "warn" : undefined} />
        {appraisalAllowed(t.financing_type) && (
          <>
            <Check label="Appraisal Termination Addendum" on={has("appraisal_termination")} onChange={(v) => toggle("appraisal_termination", v)} disabled={locked} />
            {has("appraisal_termination") && (
              <Inset>
                <div className="flex flex-col gap-2">
                  {([["waiver", "Waive the appraisal termination right"], ["partial_waiver", "Partial waiver (value at or above an amount)"], ["additional_right", "Additional right to terminate (below an amount)"]] as const).map(([v, l]) => (
                    <label key={v} className="flex min-h-11 items-center gap-3 text-[15px]">
                      <input type="radio" name="appraisal" checked={t.appraisal_option === v} disabled={locked} onChange={() => update({ appraisal_option: v })} className="h-5 w-5 accent-[var(--color-brand)]" />{l}
                    </label>
                  ))}
                </div>
                {(t.appraisal_option === "partial_waiver" || t.appraisal_option === "additional_right") && (
                  <Num label={t.appraisal_option === "partial_waiver" ? "Opinion of value at or above" : "Opinion of value below"} value={t.appraisal_value} onChange={(v) => update({ appraisal_value: v })} money />
                )}
                {t.appraisal_option === "additional_right" && <Num label="Within (days)" value={t.appraisal_days} onChange={(v) => update({ appraisal_days: v })} />}
              </Inset>
            )}
          </>
        )}
        {forms.map((f) => {
          const on = t.uploaded_forms.includes(f.id);
          return (
            <div key={f.id}>
              <Check label={f.name} on={on} disabled={locked} hint={f.formClass === "TXR" ? "Texas REALTORS form from your library" : "From your library"}
                onChange={(v) => update({ uploaded_forms: v ? [...t.uploaded_forms, f.id] : t.uploaded_forms.filter((x) => x !== f.id) })} />
              {on && (miniTerms[f.id] ?? []).filter((c) => !t.uploaded_forms.slice(0, t.uploaded_forms.indexOf(f.id)).some((o) => (miniTerms[o] ?? []).some((x) => x.key === c.key))).length > 0 && (
                <Inset>
                  {(miniTerms[f.id] ?? []).filter((c) => !t.uploaded_forms.slice(0, t.uploaded_forms.indexOf(f.id)).some((o) => (miniTerms[o] ?? []).some((x) => x.key === c.key))).map((c) => {
                    const k = c.key.replace(/^extra:/, "");
                    return <Text key={c.key} label={c.label} value={t.extra[k] ?? null} onChange={(v) => update({ extra: { ...t.extra, [k]: v ?? "" } })} />;
                  })}
                </Inset>
              )}
            </div>
          );
        })}
      </Group>

      <Group title="Notices & compensation">
        <Text label="Buyer notice address" value={t.buyer_notice_address} onChange={(v) => update({ buyer_notice_address: v })} />
        <Row>
          <Text label="Buyer phone" value={t.buyer_notice_phone} onChange={(v) => update({ buyer_notice_phone: v })} inputMode="tel" />
          <Text label="Buyer email" value={t.buyer_notice_email} onChange={(v) => update({ buyer_notice_email: v })} inputMode="email" />
        </Row>
        <Text label="Listing broker firm" value={t.listing_broker_firm} onChange={(v) => update({ listing_broker_firm: v })} />
        <Row>
          <Text label="Listing agent" value={t.listing_agent_name} onChange={(v) => update({ listing_agent_name: v })} />
          <Text label="License no." value={t.listing_agent_license} onChange={(v) => update({ listing_agent_license: v })} />
        </Row>
        <Row>
          <Text label="Listing agent email" value={t.listing_agent_email} onChange={(v) => update({ listing_agent_email: v })} inputMode="email" />
          <Text label="Listing agent phone" value={t.listing_agent_phone} onChange={(v) => update({ listing_agent_phone: v })} inputMode="tel" />
        </Row>
        <Field label="Buyer's broker compensation (Para 12B)" group>
          <div className="flex gap-2">
            <select className={cx(inputCls, "w-auto")} value={t.buyer_broker_comp_type ?? ""} disabled={locked}
              onChange={(e) => update({ buyer_broker_comp_type: (e.target.value || null) as OfferTerms["buyer_broker_comp_type"] })}>
              <option value="">Not set</option><option value="percent">% of price</option><option value="amount">$ amount</option>
            </select>
            {t.buyer_broker_comp_type && (
              <input className={inputCls} inputMode="decimal" value={t.buyer_broker_comp_value ?? ""} disabled={locked}
                onChange={(e) => update({ buyer_broker_comp_value: toNum(e.target.value, true) })} />
            )}
          </div>
        </Field>
        <p className="text-[13.5px] text-muted">Your firm, license, and supervisor come from your profiles: {[t.buyer_broker_firm, t.buyer_agent_name].filter(Boolean).join(", ") || "not set yet"}.</p>
      </Group>

      {/* Live strip */}
      <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
          <dl className="grid flex-1 grid-cols-4 gap-2 text-[12.5px] leading-tight">
            <Stat k="Price" v={money(t.sales_price) || "—"} />
            <Stat k="Earnest" v={money(t.earnest_money) || "—"} />
            <Stat k="Option" v={t.option_fee != null ? `${money(t.option_fee)}${t.option_period_days != null ? ` / ${t.option_period_days}d` : ""}` : "—"} />
            <Stat k="Closing" v={t.closing_date ? formatDate(t.closing_date) : "—"} />
          </dl>
          <button onClick={preview} disabled={going}
            className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-brand px-4 text-[15px] font-medium text-white disabled:opacity-50">
            {going ? "Opening…" : "Preview"}
          </button>
        </div>
        <p className={cx("mx-auto max-w-3xl px-4 pb-1.5 text-[12.5px]", state === "error" ? "text-bad" : "text-muted")}>
          {state === "error" ? err : state === "saving" ? "Saving…" : blockers.length ? `Still needed to export: ${blockers.join(", ")}` : "Saved"}
        </p>
      </div>
    </div>
  );
}

const toNum = (s: string, decimal = false) => {
  const c = s.replace(/[$,\s%]/g, "");
  if (c === "") return null;
  const n = decimal ? Number.parseFloat(c) : Number.parseInt(c, 10);
  return Number.isFinite(n) ? n : null;
};

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-card bg-card p-[18px] shadow-card">
      <h2 className="mb-3 text-[17px] font-semibold">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
function Inset({ title, children }: { title?: string; children: ReactNode }) {
  return <div className="ml-1 flex flex-col gap-3 border-l-[3px] border-brand-soft pl-4">{title && <div className="text-[14px] font-medium text-brand">{title}</div>}{children}</div>;
}
function Row({ children }: { children: ReactNode }) { return <div className="grid grid-cols-2 gap-3">{children}</div>; }
function Field({ label, hint, children, required, group }: { label: string; hint?: string; children: ReactNode; required?: boolean; group?: boolean }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block">
      <span className="mb-1 block text-[14px] font-medium">{label}{required && <span className="text-muted"> (required)</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-muted">{hint}</span>}
    </Tag>
  );
}
function Text({ label, value, onChange, required, inputMode }: { label: string; value: string | null; onChange: (v: string | null) => void; required?: boolean; inputMode?: "numeric" | "tel" | "email" }) {
  return <Field label={label} required={required}><input className={inputCls} value={value ?? ""} inputMode={inputMode} onChange={(e) => onChange(e.target.value || null)} /></Field>;
}
function Num({ label, value, onChange, money: isMoney, decimal, hint, required }: { label: string; value: number | null; onChange: (v: number | null) => void; money?: boolean; decimal?: boolean; hint?: string; required?: boolean }) {
  const [text, setText] = useState(value == null ? "" : isMoney ? value.toLocaleString("en-US") : String(value));
  useEffect(() => {
    if (toNum(text, decimal || isMoney) !== value) setText(value == null ? "" : isMoney ? value.toLocaleString("en-US") : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Field label={label} hint={hint} required={required}>
      <div className="relative">
        {isMoney && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>}
        <input className={cx(inputCls, isMoney && "pl-7")} inputMode={decimal || isMoney ? "decimal" : "numeric"} value={text}
          onChange={(e) => { setText(e.target.value); onChange(toNum(e.target.value, decimal || isMoney)); }} />
      </div>
    </Field>
  );
}
function Pct({ price, amount, onChange }: { price: number | null; amount: number | null; onChange: (v: number | null) => void }) {
  const pct = price && amount != null ? Math.round((amount / price) * 1000) / 10 : null;
  return (
    <Field label="or % of price">
      <input className={inputCls} inputMode="decimal" placeholder={price ? "" : "Set price first"} disabled={!price}
        defaultValue={pct ?? ""} key={pct ?? "x"}
        onBlur={(e) => { const p = toNum(e.target.value, true); if (price && p != null) onChange(Math.round((price * p) / 100)); }} />
    </Field>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx("min-h-11 rounded-full border-[1.5px] px-4 text-[15px] font-medium", on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink")}>
      {children}
    </button>
  );
}
function Check({ label, on, onChange, disabled, hint, tone }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string; tone?: "warn" }) {
  return (
    <label className={cx("flex min-h-11 items-start gap-3", disabled && "opacity-80")}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" />
      <span><span className="block text-[15px] font-medium">{label}</span>{hint && <span className={cx("block text-[13.5px]", tone === "warn" ? "font-medium text-warn" : "text-muted")}>{hint}</span>}</span>
    </label>
  );
}
function NameList({ label, names, onChange, required }: { label: string; names: string[]; onChange: (n: string[]) => void; required?: boolean }) {
  const list = names.length ? names : [""];
  return (
    <Field label={label} required={required} group>
      <div className="flex flex-col gap-2">
        {list.map((n, i) => (
          <div key={i} className="flex gap-2">
            <input className={inputCls} value={n} placeholder="Full name" onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))} />
            {list.length > 1 && <button type="button" className="min-h-11 px-2 text-[14px] text-muted" onClick={() => onChange(list.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <button type="button" className="self-start text-[14px] font-medium text-brand" onClick={() => onChange([...list, ""])}>Add another</button>
      </div>
    </Field>
  );
}
function Stat({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-muted">{k}</dt><dd className="truncate font-semibold">{v}</dd></div>;
}
