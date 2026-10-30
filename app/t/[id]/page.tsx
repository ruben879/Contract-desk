import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { expireStaleReads } from "@/lib/extract/stale";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { Badge, ButtonLink, Card, SectionTitle, money } from "@/components/ui";
import { ReadingPoller, RetryButton, RetryRereadButton } from "@/components/ReadingPoller";
import { ChecklistToggle, MarkDoneButton, NotNeededButton } from "@/components/ChecklistToggle";
import { DocumentSlots } from "@/components/DocumentSlots";
import { DEADLINE_DISCLAIMER } from "@/components/DatePreview";
import { slotsFor, SLOT_RULES } from "@/lib/slots";
import { termsFromTx } from "@/lib/terms";
import { orderedDocs } from "@/lib/docs";
import { daysBetween, formatDate, formatShort, formatTime, todayIn } from "@/lib/dates";
import { FINANCING_LABELS, type FinancingType } from "@/lib/addenda";

const CONTACT_LABELS: Record<string, string> = {
  buyer: "Buyer", seller: "Seller", listing_agent: "Listing agent", buyer_agent: "Buyer's agent",
  title_company: "Title", escrow_officer: "Escrow officer", lender: "Lender", other: "Other",
};

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  await expireStaleReads(brokerage.id);

  const { data: tx } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!tx) notFound();
  if (tx.status === "needs_review") redirect(`/t/${id}/review`);

  const shell = (children: React.ReactNode) => (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings={isBrokerOrStaff}>{children}</AppShell>
  );

  if (tx.status === "reading") {
    return shell(
      <Card className="py-12 text-center">
        <ReadingPoller />
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-soft border-t-brand" />
        <div className="text-lg font-semibold">Reading your contract</div>
        <p className="mt-1 text-sm text-muted">Pulling out parties, dates, and addenda. Usually under a minute. You can leave this page.</p>
      </Card>,
    );
  }

  if (tx.status === "failed") {
    const { data: ex } = await supabase.from("extractions").select("error").eq("transaction_id", id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return shell(
      <Card className="space-y-4">
        <div className="text-lg font-semibold">We couldn't read this one</div>
        <p className="text-sm text-muted">{ex?.error ?? "Something went wrong."}</p>
        <RetryButton id={id} />
      </Card>,
    );
  }

  const [{ data: deadlines }, { data: items }, { data: links }, { data: events }, { data: lastReread }] = await Promise.all([
    supabase.from("deadlines").select("*").eq("transaction_id", id).order("due_date"),
    supabase.from("checklist_items").select("*").eq("transaction_id", id).order("sort"),
    supabase.from("transaction_contacts").select("role, contacts(id, full_name, company, email, phone)").eq("transaction_id", id),
    supabase.from("transaction_events").select("id, kind, summary, changes, created_at").eq("transaction_id", id).order("created_at", { ascending: false }).limit(10),
    supabaseAdmin().from("extractions").select("id, status, error, document_ids, created_at").eq("transaction_id", id).eq("kind", "amendment")
      .neq("status", "dismissed").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const docs = await orderedDocs(supabase, id);

  const amendment = lastReread?.status === "ready" ? lastReread : null;
  const rereading = lastReread?.status === "running" || lastReread?.status === "pending";
  const rereadFailed = lastReread?.status === "failed" ? lastReread : null;
  const docName = (ids: string[]) => docs.filter((d) => ids.includes(d.id)).map((d) => d.file_name).join(", ");

  const today = todayIn(brokerage.timezone);
  const dueOf = new Map((deadlines ?? []).map((d) => [d.key, d]));
  const open = (items ?? []).filter((i) => i.status === "open")
    .sort((a, b) => (dueOf.get(a.deadline_key)?.due_date ?? "9999").localeCompare(dueOf.get(b.deadline_key)?.due_date ?? "9999") || a.sort - b.sort);
  const next = open[0];

  const sections = new Map<string, typeof items>();
  for (const it of items ?? []) sections.set(it.section, [...(sections.get(it.section) ?? []), it]);

  const address = [tx.property_street, tx.property_city, tx.property_state, tx.property_zip].filter(Boolean).join(", ");
  const doneCount = (items ?? []).filter((i) => i.status !== "open").length;

  return shell(
    <>
      {rereading && <ReadingPoller />}
      <div className="mb-4">
        <h1 className="text-xl font-bold">{address || "Transaction"}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          {tx.side && <Badge tone="brand">{tx.side === "both" ? "Both sides" : `${tx.side[0].toUpperCase()}${tx.side.slice(1)} side`}</Badge>}
          {tx.sales_price && <span>{money(Number(tx.sales_price))}</span>}
          {tx.financing_type && <span>· {FINANCING_LABELS[tx.financing_type as FinancingType] ?? tx.financing_type}</span>}
          <Link href={`/t/${id}/review`} className="ml-auto text-brand">Edit details</Link>
        </div>
      </div>

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
          <div className="text-xs font-semibold uppercase tracking-wide text-brand">Next up</div>
          <div className="mt-1 text-lg font-semibold">{next.title}</div>
          {dueOf.get(next.deadline_key) && <div className="text-sm text-muted">Due {formatDate(dueOf.get(next.deadline_key)!.due_date)}</div>}
          {next.reason && <div className="mt-1 text-sm text-muted">{next.reason}</div>}
          <div className="mt-4"><MarkDoneButton id={next.id} /></div>
        </Card>
      ) : (
        <Card className="border-good bg-good-soft text-center font-semibold text-good">Every task is done.</Card>
      )}

      {rereadFailed && (
        <Card className="mt-3 flex items-center justify-between gap-3 border-bad bg-bad-soft text-sm">
          <span>Couldn't check {docName(rereadFailed.document_ids)} for changes. {rereadFailed.error}</span>
          <RetryRereadButton id={id} documentIds={rereadFailed.document_ids} />
        </Card>
      )}

      <SectionTitle>Key dates</SectionTitle>
      <Card className="divide-y divide-line p-0 sm:p-0">
        {(deadlines ?? []).length === 0 && <p className="p-4 text-sm text-muted">No dates yet. Add the effective date in Edit details.</p>}
        {(deadlines ?? []).map((d) => {
          const days = daysBetween(today, d.due_date);
          return (
            <div key={d.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium">{d.label}</div>
                <div className="text-xs text-muted">From {d.contract_ref}. {d.calculation}.</div>
                {d.needs_verification && <div className="mt-1"><Badge tone="warn">Day count not verified yet</Badge></div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold">{formatShort(d.due_date)}</div>
                {d.due_time && <div className="text-xs text-muted">{formatTime(d.due_time)}</div>}
                <div className={days < 0 ? "text-xs text-muted" : days <= 2 ? "text-xs font-semibold text-warn" : "text-xs text-muted"}>
                  {days < 0 ? "Passed" : days === 0 ? "Today" : `in ${days} day${days === 1 ? "" : "s"}`}
                </div>
              </div>
            </div>
          );
        })}
        <p className="px-4 py-2 text-xs text-muted">{DEADLINE_DISCLAIMER}</p>
      </Card>

      <SectionTitle>Checklist · {doneCount} of {(items ?? []).length} handled</SectionTitle>
      <div className="space-y-3">
        {[...sections.entries()].map(([section, list]) => (
          <Card key={section} className="p-0 sm:p-0">
            <div className="border-b border-line px-4 py-2 text-sm font-semibold">{section}</div>
            <ul className="divide-y divide-line">
              {list!.map((it) => {
                const due = dueOf.get(it.deadline_key);
                const na = it.status === "not_needed";
                return (
                  <li key={it.id} className="flex gap-3 px-4 py-3">
                    {na ? <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-[10px] font-bold text-muted">N/A</span>
                      : <ChecklistToggle id={it.id} done={it.status === "done"} />}
                    <div className="min-w-0 flex-1">
                      <div className={it.status !== "open" ? "text-muted line-through" : ""}>{it.title}</div>
                      <div className="text-xs text-muted">{[due && !na && `Due ${formatShort(due.due_date)}`, it.reason].filter(Boolean).join(" · ")}</div>
                    </div>
                    {it.status !== "done" && <NotNeededButton id={it.id} notNeeded={na} />}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>

      <SectionTitle>People</SectionTitle>
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

      <SectionTitle>Documents</SectionTitle>
      <DocumentSlots
        transactionId={id}
        slots={slotsFor(termsFromTx(tx), new Set(docs.map((d) => d.slot).filter((x): x is string => !!x))).map(({ key, label, many }) => ({ key, label, many }))}
        allSlots={SLOT_RULES.map(({ key, label, many }) => ({ key, label, many }))}
        docs={docs.map((d) => ({ id: d.id, file_name: d.file_name, url: d.url, slot: d.slot, slot_source: d.slot_source, page_count: d.page_count, is_scanned: d.is_scanned }))}
      />

      {(events ?? []).length > 0 && (
        <>
          <SectionTitle>History</SectionTitle>
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
    </>,
  );
}
