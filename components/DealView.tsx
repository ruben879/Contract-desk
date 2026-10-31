import Link from "next/link";
import { Badge, ButtonLink, Card, cx, money } from "@/components/ui";
import { ReadingPoller, RetryRereadButton } from "@/components/ReadingPoller";
import { ChecklistToggle, MarkDoneButton, NotNeededButton, TaskMenu } from "@/components/ChecklistToggle";
import { DocumentSlots } from "@/components/DocumentSlots";
import { DEADLINE_DISCLAIMER } from "@/components/DatePreview";
import { dealStatus, GROUP_LABEL, taskTiming, type TaskGroup } from "@/lib/deal-status";
import { slotsFor, SLOT_RULES } from "@/lib/slots";
import { termsFromTx } from "@/lib/terms";
import { daysBetween, formatDate, formatDay, formatShort, formatTime } from "@/lib/dates";
import { FINANCING_LABELS, type FinancingType } from "@/lib/addenda";
import { displayError } from "@/lib/extract/errors";

const CONTACT_LABELS: Record<string, string> = {
  buyer: "Buyer", seller: "Seller", listing_agent: "Listing agent", buyer_agent: "Buyer's agent",
  title_company: "Title", escrow_officer: "Escrow officer", lender: "Lender", other: "Other",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export type DealViewProps = {
  id: string; tx: any; today: string; timezone: string;
  deadlines: any[]; items: any[]; links: any[]; events: any[];
  lastReread: { id: string; status: string; error: string | null; document_ids: string[] } | null;
  docs: { id: string; file_name: string; url?: string; slot: string | null; slot_source: string | null; page_count: number | null; is_scanned: boolean | null }[];
};

/** The confirmed deal: header, next action, tasks by when they're due, dates, documents, people, history. */
export function DealView({ id, tx, today, timezone, deadlines, items, links, events, lastReread, docs }: DealViewProps) {
  const brokerage = { timezone };
  const amendment = lastReread?.status === "ready" ? lastReread : null;
  const rereading = lastReread?.status === "running" || lastReread?.status === "pending";
  const rereadFailed = lastReread?.status === "failed" ? lastReread : null;
  const docName = (ids: string[]) => docs.filter((d) => ids.includes(d.id)).map((d) => d.file_name).join(", ");

  const dueOf = new Map((deadlines ?? []).map((d) => [d.key, d]));
  const open = (items ?? []).filter((i) => i.status === "open")
    .sort((a, b) => (dueOf.get(a.deadline_key)?.due_date ?? "9999").localeCompare(dueOf.get(b.deadline_key)?.due_date ?? "9999") || a.sort - b.sort);
  const next = open[0];

  const address1 = tx.property_street || "Address not set";
  const address2 = [tx.property_city, [tx.property_state, tx.property_zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const all = items ?? [];
  const doneCount = all.filter((i) => i.status !== "open").length;
  const status = dealStatus({ status: tx.status, today, deadlines: deadlines ?? [] });

  // Tasks grouped by when they're due, so what needs doing comes first.
  const ORDER: TaskGroup[] = ["late", "today", "week", "later", "anytime", "done"];
  const grouped = new Map<TaskGroup, { it: (typeof all)[number]; chip: ReturnType<typeof taskTiming>["chip"]; due: string | null }[]>();
  for (const it of all) {
    const due = dueOf.get(it.deadline_key)?.due_date ?? null;
    const t = taskTiming(it.status, due, today);
    grouped.set(t.group, [...(grouped.get(t.group) ?? []), { it, chip: t.chip, due }]);
  }
  for (const list of grouped.values()) list.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.it.sort - b.it.sort);
  const lateCount = grouped.get("late")?.length ?? 0;

  const slotList = slotsFor(termsFromTx(tx), new Set(docs.map((d) => d.slot).filter((x): x is string => !!x)));
  const filledSlots = slotList.filter((sl) => docs.some((d) => d.slot === sl.key)).length;

  const Section = ({ id: anchor, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <section id={anchor} className="scroll-mt-16 pt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children}
    </section>
  );
  const chipTone = { brand: "bg-brand-soft text-brand", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", good: "bg-good-soft text-good", neutral: "bg-paper text-muted" };

  return (
    <>
      {rereading && <ReadingPoller />}

      {/* Header: everything about the deal's state, readable without opening anything */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", chipTone[status.tone])}>{status.label}</span>
          {tx.side && <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-medium text-muted">{tx.side === "both" ? "Both sides" : tx.side === "buyer" ? "Buyer side" : "Seller side"}</span>}
          <Link href={`/t/${id}/review`} className="ml-auto text-sm font-medium text-brand">Edit details</Link>
        </div>
        <div>
          <h1 className="text-xl font-bold leading-snug">{address1}</h1>
          {address2 && <div className="text-muted">{address2}</div>}
        </div>
        <div className="flex flex-wrap gap-x-3 text-sm">
          {tx.sales_price && <span className="font-semibold">{money(Number(tx.sales_price))}</span>}
          {tx.financing_type && <span className="text-muted">{FINANCING_LABELS[tx.financing_type as FinancingType] ?? tx.financing_type}</span>}
          {status.detail && <span className="text-muted">{status.detail}</span>}
        </div>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-paper">
            <div className="h-full rounded-full bg-good" style={{ width: `${all.length ? Math.round((doneCount / all.length) * 100) : 0}%` }} />
          </div>
          <div className="mt-1 text-xs text-muted">{doneCount} of {all.length} tasks handled{lateCount ? <span className="font-semibold text-bad"> · {lateCount} past due</span> : null}</div>
        </div>
      </Card>

      {/* Jump bar with counts */}
      <nav className="sticky top-0 z-10 -mx-4 mt-3 flex gap-1 overflow-x-auto bg-paper/95 px-4 py-2 text-sm backdrop-blur">
        {[
          { href: "#tasks", label: "Tasks", count: `${doneCount}/${all.length}`, alert: lateCount > 0 },
          { href: "#dates", label: "Dates", count: String((deadlines ?? []).length), alert: false },
          { href: "#docs", label: "Docs", count: `${filledSlots}/${slotList.length}`, alert: false },
          { href: "#people", label: "People", count: String((links ?? []).length), alert: false },
        ].map((t) => (
          <a key={t.href} href={t.href} className="relative flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 font-medium">
            {t.label} <span className="text-muted">{t.count}</span>
            {t.alert && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-bad" aria-label="past due" />}
          </a>
        ))}
      </nav>

      {amendment ? (
        <Card className="border-warn bg-warn-soft">
          <div className="text-xs font-semibold uppercase tracking-wide text-warn">Needs your OK</div>
          <div className="mt-1 text-lg font-semibold">Review what changed</div>
          <p className="text-sm text-muted">We read {docName(amendment.document_ids)}. Dates and tasks won't move until you confirm.</p>
          <div className="mt-4"><ButtonLink href={`/t/${id}/changes`} size="lg">Review changes</ButtonLink></div>
        </Card>
      ) : rereading ? (
        <Card className="flex items-center gap-3">
          <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
          <div>
            <div className="font-semibold">Checking {docName(lastReread!.document_ids) || "the new document"} for changes</div>
            <div className="text-sm text-muted">If anything changed, you'll confirm it here first.</div>
          </div>
        </Card>
      ) : next ? (
        <Card className="border-brand">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand">Next up</div>
            {(() => { const c = taskTiming("open", dueOf.get(next.deadline_key)?.due_date, today).chip; return c ? <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", chipTone[c.tone])}>{c.label}</span> : null; })()}
          </div>
          <div className="mt-1 text-lg font-semibold leading-snug">{next.title}</div>
          {dueOf.get(next.deadline_key) && <div className="text-sm text-muted">Due {formatDay(dueOf.get(next.deadline_key)!.due_date)}</div>}
          {next.reason && <div className="mt-1 text-sm text-muted">{next.reason}</div>}
          <div className="mt-4"><MarkDoneButton id={next.id} /></div>
        </Card>
      ) : (
        <Card className="border-good bg-good-soft text-center font-semibold text-good">Every task is done.</Card>
      )}

      {rereadFailed && (
        <Card className="mt-3 flex items-center justify-between gap-3 border-bad bg-bad-soft text-sm">
          <span>Couldn't check {docName(rereadFailed.document_ids)} for changes. {displayError(rereadFailed.error)}</span>
          <RetryRereadButton id={id} documentIds={rereadFailed.document_ids} />
        </Card>
      )}

      <Section id="tasks" title="Tasks">
        <div className="space-y-3">
          {ORDER.filter((g) => g !== "done" && grouped.get(g)?.length).map((g) => (
            <Card key={g} className="p-0 sm:p-0">
              <div className={cx("flex items-center justify-between border-b border-line px-4 py-2 text-sm font-semibold", g === "late" && "text-bad")}>
                {GROUP_LABEL[g]} <span className="font-normal text-muted">{grouped.get(g)!.length}</span>
              </div>
              <ul className="divide-y divide-line">
                {grouped.get(g)!.map(({ it, chip, due }) => (
                  <li key={it.id} className="flex gap-3 px-4 py-3">
                    <ChecklistToggle id={it.id} done={false} />
                    <div className="min-w-0 flex-1">
                      <div className="leading-snug">{it.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        {chip && <span className={cx("rounded-full px-2 py-0.5 font-semibold", chipTone[chip.tone])}>{chip.label}</span>}
                        {due && <span>{formatDay(due)}</span>}
                        {it.reason && <span>{it.reason}</span>}
                      </div>
                    </div>
                    <TaskMenu id={it.id} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {!!grouped.get("done")?.length && (
            <details className="rounded-2xl border border-line bg-card">
              <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-semibold">Done <span className="font-normal text-muted">{grouped.get("done")!.length}</span> <span className="font-normal text-brand">Show</span></summary>
              <ul className="divide-y divide-line border-t border-line">
                {grouped.get("done")!.map(({ it, chip }) => (
                  <li key={it.id} className="flex gap-3 px-4 py-3">
                    {it.status === "not_needed"
                      ? <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-[10px] font-bold text-muted">N/A</span>
                      : <ChecklistToggle id={it.id} done />}
                    <div className="min-w-0 flex-1 leading-snug text-muted">{it.title}</div>
                    {it.status === "not_needed" ? <NotNeededButton id={it.id} notNeeded /> : chip && <span className={cx("h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", chipTone[chip.tone])}>{chip.label}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Section>

      <Section id="dates" title="Key dates">
        <Card className="divide-y divide-line p-0 sm:p-0">
          {(deadlines ?? []).length === 0 && <p className="p-4 text-sm text-muted">No dates yet. Add the effective date in Edit details.</p>}
          {(deadlines ?? []).map((d) => {
            const n = daysBetween(today, d.due_date);
            const c = n < 0 ? { label: "Passed", tone: "neutral" as const } : n === 0 ? { label: "Today", tone: "warn" as const } : { label: `In ${n} day${n === 1 ? "" : "s"}`, tone: n <= 2 ? ("warn" as const) : ("neutral" as const) };
            return (
              <div key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium leading-snug">{d.label}</div>
                  <div className="text-xs text-muted">From {d.contract_ref}. {d.calculation}.</div>
                  {d.needs_verification && <div className="mt-1"><Badge tone="warn">Day count not verified yet</Badge></div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold">{formatShort(d.due_date)}{d.due_time ? <span className="font-normal text-muted"> · {formatTime(d.due_time)}</span> : null}</div>
                  <span className={cx("mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold", chipTone[c.tone])}>{c.label}</span>
                </div>
              </div>
            );
          })}
          <p className="px-4 py-2 text-xs text-muted">{DEADLINE_DISCLAIMER}</p>
        </Card>
      </Section>

      <Section id="docs" title="Documents">
        <DocumentSlots
          transactionId={id}
          slots={slotList.map(({ key, label, many }) => ({ key, label, many }))}
          allSlots={SLOT_RULES.map(({ key, label, many }) => ({ key, label, many }))}
          docs={docs.map((d) => ({ id: d.id, file_name: d.file_name, url: d.url, slot: d.slot, slot_source: d.slot_source, page_count: d.page_count, is_scanned: d.is_scanned }))}
        />
      </Section>

      <Section id="people" title="People">
      <Card className="divide-y divide-line p-0 sm:p-0">
        {(links ?? []).length === 0 && <p className="p-4 text-sm text-muted">No contacts on this deal yet.</p>}
        {(links ?? []).map((l: any, i: number) => (
          <div key={i} className="px-4 py-3">
            <div className="text-xs text-muted">{CONTACT_LABELS[l.role]}</div>
            <div className="font-medium">{l.contacts.full_name}{l.contacts.company && l.contacts.company !== l.contacts.full_name && <span className="font-normal text-muted"> · {l.contacts.company}</span>}</div>
            <div className="text-sm">
              {l.contacts.phone && <a className="text-brand" href={`tel:${l.contacts.phone}`}>{l.contacts.phone}</a>}
              {l.contacts.phone && l.contacts.email && " · "}
              {l.contacts.email && <span className="text-muted">{l.contacts.email}</span>}
            </div>
          </div>
        ))}
      </Card>

      </Section>

      {(events ?? []).length > 0 && (
        <>
          <h2 className="mb-2 pt-6 text-sm font-semibold uppercase tracking-wide text-muted">History</h2>
          <Card className="divide-y divide-line p-0 text-sm sm:p-0">
            {events!.map((e) => {
              const moved = ((e.changes as any)?.deadlines ?? []).filter((s: any) => s.change === "moved");
              return (
                <div key={e.id} className="px-4 py-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{e.summary}</span>
                    <span className="shrink-0 text-xs text-muted">{new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: brokerage.timezone })}</span>
                  </div>
                  {moved.length > 0 && (
                    <div className="text-xs text-muted">
                      {moved.map((s: any) => `${s.label}: ${formatShort(s.before.due_date)} → ${formatShort(s.after.due_date)}`).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </>
  );
}
