import Link from "next/link";
import { ButtonLink, Card, cx, money } from "@/components/ui";
import { ReadingPoller, RetryRereadButton } from "@/components/ReadingPoller";
import { ChecklistToggle, NotNeededButton, TaskMenu } from "@/components/ChecklistToggle";
import { DocumentSlots } from "@/components/DocumentSlots";
import { DEADLINE_DISCLAIMER } from "@/components/DatePreview";
import { dealStatus, GROUP_LABEL, taskTiming, type TaskGroup } from "@/lib/deal-status";
import { slotsFor, SLOT_RULES } from "@/lib/slots";
import { termsFromTx } from "@/lib/terms";
import { formatDay, formatShort, formatTime } from "@/lib/dates";
import { displayError } from "@/lib/extract/errors";
import { computeDeadlines, type DeadlineRule } from "@/lib/deadlines/compute";
import { CommentsSection } from "@/components/Comments";
import { MarkMentionsRead } from "@/components/CommentComposer";

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
  rules: DeadlineRule[];
  me: string;
  comments: { id: string; body: string; created_at: string; author_member_id: string }[];
  team: { id: string; full_name: string | null; email: string; role: string; active: boolean }[];
  unreadMentions: string[];   // comment ids on this deal that mention me and I haven't seen
};

/** Everything that isn't "what needs me next" lives one tap away. No counts on the headings. */
function More({ id, title, open, children }: { id: string; title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details id={id} open={open} className="group scroll-mt-4 border-t border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold">
        {title}
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-muted transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6l4 4 4-4" /></svg>
      </summary>
      <div className="pb-5">{children}</div>
    </details>
  );
}

/**
 * The confirmed deal answers three things: where it stands (one line), what needs me next
 * (open tasks), and everything else one tap away.
 */
export function DealView({ id, tx, today, timezone, deadlines, items, links, events, lastReread, docs, rules, me, comments, team, unreadMentions }: DealViewProps) {
  const amendment = lastReread?.status === "ready" ? lastReread : null;
  const rereading = lastReread?.status === "running" || lastReread?.status === "pending";
  const rereadFailed = lastReread?.status === "failed" ? lastReread : null;
  const docName = (ids: string[]) => docs.filter((d) => ids.includes(d.id)).map((d) => d.file_name).join(", ");

  const dueOf = new Map((deadlines ?? []).map((d) => [d.key, d]));
  // Terms the contract leaves blank: no date, flagged instead. (Dates already saved stay as saved until the next confirm.)
  const terms = termsFromTx(tx);
  const attention = computeDeadlines(rules, terms).skipped.filter((s) => s.kind === "unresolved" && !dueOf.has(s.key));
  const attentionOf = new Map(attention.map((a) => [a.key, a]));

  const nameOf = (mid: string) => { const m = team.find((t) => t.id === mid); return m ? m.full_name || m.email : null; };
  const mentionable = team.filter((m) => m.active && (m.role !== "agent" || m.id === tx.agent_member_id))
    .map((m) => ({ id: m.id, name: m.full_name || m.email, role: m.role }));
  const unread = new Set(unreadMentions);

  // Where it stands: one line.
  const status = dealStatus({ status: tx.status, today, deadlines: deadlines ?? [] });
  const side = tx.side === "both" ? "both sides" : tx.side === "buyer" ? "buyer side" : tx.side === "seller" ? "seller side" : null;
  const statusLine = [status.label, side].filter(Boolean).join(", ");
  const address2 = [tx.property_city, [tx.property_state, tx.property_zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const closing = dueOf.get("closing")?.due_date ?? tx.closing_date;
  const facts = [tx.sales_price ? money(Number(tx.sales_price)) : null, closing ? `Closes ${formatDay(closing)}` : null].filter(Boolean).join(" · ");

  // What needs me next: open tasks by when. The first one is next; it's marked in place.
  const ORDER: TaskGroup[] = ["late", "upcoming", "whenever"];
  const rows = (items ?? []).map((it) => {
    const due = dueOf.get(it.deadline_key)?.due_date ?? null;
    const flag = !due ? attentionOf.get(it.deadline_key) : undefined;
    const t = taskTiming(it.status, due, today, !!flag);
    return { it, due, flag, ...t };
  });
  const byWhen = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    (a.flag ? 0 : 1) - (b.flag ? 0 : 1) || (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.it.sort - b.it.sort;
  const groups = ORDER.map((g) => ({ g, list: rows.filter((r) => r.group === g).sort(byWhen) })).filter((x) => x.list.length);
  const done = rows.filter((r) => r.group === "done").sort((a, b) => a.it.sort - b.it.sort);
  const nextId = groups[0]?.list[0]?.it.id;
  const showReason = (it: any) => it.rule_key?.startsWith("missing_");

  const slotList = slotsFor(terms, new Set(docs.map((d) => d.slot).filter((x): x is string => !!x)));
  const tone = { bad: "text-bad font-semibold", warn: "text-warn font-medium", muted: "text-muted" } as const;

  return (
    <>
      {rereading && <ReadingPoller />}

      <header className="pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-sm font-medium text-muted">{statusLine}</div>
          <Link href={`/t/${id}/review`} className="shrink-0 text-sm font-medium text-brand">Edit details</Link>
        </div>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{tx.property_street || "Address not set"}</h1>
        {address2 && <div className="text-muted">{address2}</div>}
        {facts && <div className="mt-1 font-medium">{facts}</div>}
      </header>

      {amendment && (
        <Card className="mb-4 border-warn bg-warn-soft">
          <div className="font-semibold">Review what changed</div>
          <p className="text-sm text-muted">We read {docName(amendment.document_ids)}. Dates and tasks won't move until you confirm.</p>
          <div className="mt-3"><ButtonLink href={`/t/${id}/changes`}>Review changes</ButtonLink></div>
        </Card>
      )}
      {rereading && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-soft border-t-brand" />
          Checking {docName(lastReread!.document_ids) || "the new document"} for changes. Nothing moves until you confirm.
        </p>
      )}
      {rereadFailed && (
        <Card className="mb-4 flex items-center justify-between gap-3 border-bad bg-bad-soft text-sm">
          <span>Couldn't check {docName(rereadFailed.document_ids)} for changes. {displayError(rereadFailed.error)}</span>
          <RetryRereadButton id={id} documentIds={rereadFailed.document_ids} />
        </Card>
      )}

      <section id="tasks" className="space-y-5 pb-6">
        {groups.length === 0 && <p className="rounded-2xl bg-good-soft px-4 py-3 font-medium text-good">Nothing left to do on this deal.</p>}
        {groups.map(({ g, list }) => (
          <div key={g}>
            <h2 className={cx("mb-1 font-semibold", g === "late" && "text-bad")}>{GROUP_LABEL[g]}</h2>
            <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
              {list.map(({ it, when, tone: t, flag }) => (
                <li key={it.id} className={cx("flex gap-3 px-4 py-3", it.id === nextId && "rounded-2xl ring-2 ring-brand")}>
                  <ChecklistToggle id={it.id} done={false} />
                  <div className="min-w-0 flex-1">
                    <div className="leading-snug">{it.title}</div>
                    {flag ? <div className={cx("mt-0.5 text-sm", tone.warn)}>No date. {flag.reason}</div>
                      : when && <div className={cx("mt-0.5 text-sm", tone[t])}>{when}</div>}
                    {showReason(it) && it.reason && <div className="mt-0.5 text-sm text-muted">{it.reason}</div>}
                  </div>
                  <TaskMenu id={it.id} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {done.length > 0 && (
        <More id="done" title="Done">
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {done.map(({ it }) => (
              <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                {it.status === "not_needed"
                  ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-paper text-[10px] font-bold text-muted">N/A</span>
                  : <ChecklistToggle id={it.id} done />}
                <div className="min-w-0 flex-1 leading-snug text-muted">{it.title}</div>
                {it.status === "not_needed" && <NotNeededButton id={it.id} notNeeded />}
              </li>
            ))}
          </ul>
        </More>
      )}

      <More id="dates" title="Key dates">
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {attention.map((a) => (
            <li key={a.key} className="px-4 py-3">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{a.label}</span>
                <span className="shrink-0 font-medium text-warn">No date</span>
              </div>
              <div className="text-sm text-muted">{a.reason} If the contract or an amendment sets it, add it in <Link href={`/t/${id}/review`} className="text-brand">Edit details</Link>.</div>
            </li>
          ))}
          {(deadlines ?? []).length === 0 && attention.length === 0 && <li className="px-4 py-3 text-sm text-muted">No dates yet. Add the effective date in Edit details.</li>}
          {(deadlines ?? []).map((d) => (
            <li key={d.id} className="px-4 py-3">
              <div className="flex justify-between gap-3">
                <span className="font-medium">{d.label}</span>
                <span className="shrink-0 font-semibold">{formatShort(d.due_date)}{d.due_time ? <span className="font-normal text-muted">, {formatTime(d.due_time)}</span> : null}</span>
              </div>
              <div className="text-sm text-muted">From {d.contract_ref}. {d.calculation}.</div>
            </li>
          ))}
        </ul>
        {(deadlines ?? []).some((d) => d.needs_verification) && (
          <p className="mt-2 text-sm font-medium text-warn">Some day counts haven't been verified in Settings yet.</p>
        )}
        <p className="mt-1 text-xs text-muted">{DEADLINE_DISCLAIMER}</p>
      </More>

      <More id="docs" title="Documents">
        <DocumentSlots
          transactionId={id}
          slots={slotList.map(({ key, label, many }) => ({ key, label, many }))}
          allSlots={SLOT_RULES.map(({ key, label, many }) => ({ key, label, many }))}
          docs={docs.map((d) => ({ id: d.id, file_name: d.file_name, url: d.url, slot: d.slot, slot_source: d.slot_source, page_count: d.page_count, is_scanned: d.is_scanned }))}
        />
      </More>

      <More id="people" title="People">
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {(links ?? []).length === 0 && <li className="px-4 py-3 text-sm text-muted">No contacts on this deal yet.</li>}
          {(links ?? []).map((l: any, i: number) => (
            <li key={i} className="px-4 py-3">
              <div className="text-sm text-muted">{CONTACT_LABELS[l.role]}</div>
              <div className="font-medium">{l.contacts.full_name}{l.contacts.company && l.contacts.company !== l.contacts.full_name && <span className="font-normal text-muted">, {l.contacts.company}</span>}</div>
              {(l.contacts.phone || l.contacts.email) && (
                <div className="text-sm">
                  {l.contacts.phone && <a className="text-brand" href={`tel:${l.contacts.phone}`}>{l.contacts.phone}</a>}
                  {l.contacts.phone && l.contacts.email && <span className="text-muted">, </span>}
                  {l.contacts.email && <span className="text-muted">{l.contacts.email}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </More>

      <More id="comments" title={unread.size ? "Comments, someone mentioned you" : "Comments"} open={unread.size > 0}>
        <MarkMentionsRead transactionId={id} count={unread.size} />
        <CommentsSection transactionId={id} meId={me} timezone={timezone} nameOf={nameOf} members={mentionable}
          comments={comments.map((c) => ({ ...c, unreadForMe: unread.has(c.id) }))} />
      </More>

      {(events ?? []).length > 0 && (
        <More id="history" title="History">
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card text-sm">
            {events!.map((e) => {
              const moved = ((e.changes as any)?.deadlines ?? []).filter((s: any) => s.change === "moved");
              return (
                <li key={e.id} className="px-4 py-2.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{e.summary}</span>
                    <span className="shrink-0 text-muted">{new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone })}</span>
                  </div>
                  {moved.length > 0 && (
                    <div className="text-muted">
                      {moved.map((s: any) => `${s.label} moved from ${formatShort(s.before.due_date)} to ${formatShort(s.after.due_date)}`).join(". ")}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </More>
      )}
    </>
  );
}
