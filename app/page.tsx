import Link from "next/link";
import { expireStaleReads } from "@/lib/extract/stale";
import { requireMember, memberIntakeAddress, missingProfile } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Dropzone } from "@/components/Dropzone";
import { CopyText } from "@/components/CopyText";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { startUpload } from "./actions";
import { daysBetween, formatShort, todayIn } from "@/lib/dates";

type Row = {
  id: string; status: string; property_street: string | null; property_city: string | null;
  agent_member_id: string | null; created_at: string;
  deadlines: { key: string; label: string; due_date: string }[];
  checklist_items: { title: string; status: string; deadline_key: string | null; sort: number }[];
  documents: { file_name: string }[];
};

function title(r: Row) {
  if (r.property_street) return [r.property_street, r.property_city].filter(Boolean).join(", ");
  return r.documents[0]?.file_name ?? "New contract";
}

export default async function Home() {
  const { supabase, member, brokerage, isBrokerOrStaff } = await requireMember();
  await expireStaleReads(brokerage.id);
  const today = todayIn(brokerage.timezone);

  const { data } = await supabase
    .from("transactions")
    .select("id, status, property_street, property_city, agent_member_id, created_at, deadlines(key, label, due_date), checklist_items(title, status, deadline_key, sort), documents(file_name)")
    .in("status", ["reading", "needs_review", "failed", "active"])
    .order("created_at", { ascending: false })
    .returns<Row[]>();
  const rows = data ?? [];

  // Confirmed deals with an amendment waiting also need the agent's OK.
  const { data: pending } = await supabase.from("extractions").select("transaction_id")
    .eq("kind", "amendment").eq("status", "ready");
  const amended = new Set((pending ?? []).map((p) => p.transaction_id));
  const toReview = rows.filter((r) => r.status === "needs_review" || r.status === "failed" || amended.has(r.id));
  const missing = missingProfile(member, brokerage, isBrokerOrStaff);
  // Deals where someone mentioned you in a comment you haven't seen yet.
  const { data: myUnread } = await supabase.from("comment_mentions").select("transaction_id").eq("member_id", member.id).is("read_at", null);
  const mentioned = new Set((myUnread ?? []).map((m) => m.transaction_id));
  // Emailed documents that couldn't be placed with certainty (RLS: staff see all, agents see their own).
  const { count: toSort } = await supabase.from("intake_items").select("id", { count: "exact", head: true }).eq("status", "needs_sorting");
  const reading = rows.filter((r) => r.status === "reading");
  const active = rows
    .filter((r) => r.status === "active" && !amended.has(r.id))
    .map((r) => {
      // The single most important thing: what's late, or else the next date.
      const due = new Map(r.deadlines.map((d) => [d.key, d.due_date]));
      const late = r.checklist_items
        .filter((i) => i.status === "open" && i.deadline_key && (due.get(i.deadline_key) ?? "9999") < today)
        .sort((a, b) => due.get(a.deadline_key!)!.localeCompare(due.get(b.deadline_key!)!) || a.sort - b.sort);
      const next = r.deadlines.filter((d) => d.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      return { ...r, late, next, key: late[0] ? due.get(late[0].deadline_key!)! : next?.due_date ?? "9999" };
    })
    .sort((a, b) => (b.late.length ? 1 : 0) - (a.late.length ? 1 : 0) || a.key.localeCompare(b.key));

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings={isBrokerOrStaff}>
      {!!toSort && (
        <Link href="/sort" className="mb-3 flex items-center justify-between rounded-2xl border border-warn bg-warn-soft px-4 py-3">
          <span className="font-semibold text-warn">{toSort === 1 ? "1 emailed document needs sorting" : `${toSort} emailed documents need sorting`}</span>
          <span className="text-sm font-semibold text-warn">Sort</span>
        </Link>
      )}

      {toReview.length > 0 ? (
        <Card className="border-brand bg-brand-soft">
          <div className="font-semibold">{toReview.length === 1 ? "1 contract is ready for you to check" : `${toReview.length} contracts are ready for you to check`}</div>
          <ul className="mt-3 space-y-2">
            {toReview.map((r) => (
              <li key={r.id}>
                <Link href={amended.has(r.id) ? `/t/${r.id}/changes` : `/t/${r.id}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-3 hover:shadow-sm">
                  <span className="min-w-0 font-medium leading-snug">{title(r)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {mentioned.has(r.id) && <span className="text-sm font-medium text-brand">Mentioned you</span>}
                    {!r.agent_member_id && <Badge tone="warn">Unassigned</Badge>}
                    {r.status === "failed" ? <Badge tone="bad">Couldn't read</Badge> : amended.has(r.id) ? <Badge tone="warn">Changes</Badge> : <Badge tone="brand">Review</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Dropzone start={startUpload} label="Start a deal: drop the contract here" hint="Or tap to choose PDFs or take photos. Start with whatever you have; add the rest of the file anytime." />
      )}

      {toReview.length > 0 && (
        <div className="mt-4">
          <Dropzone compact start={startUpload} label="Add another contract" />
        </div>
      )}

      {reading.length > 0 && (
        <>
          <SectionTitle>Reading now</SectionTitle>
          <Card className="space-y-2">
            {reading.map((r) => (
              <Link key={r.id} href={`/t/${r.id}`} className="flex justify-between text-sm">
                <span className="min-w-0 leading-snug">{title(r)}</span><span className="text-muted">Reading...</span>
              </Link>
            ))}
          </Card>
        </>
      )}

      <SectionTitle>{isBrokerOrStaff ? "Active deals" : "Your active deals"}</SectionTitle>
      {active.length === 0 ? (
        <p className="text-sm text-muted">No active deals yet. Your first confirmed contract will show up here.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {active.map((r) => {
            const nextLine = r.next ? `${r.next.label} ${daysBetween(today, r.next.due_date) === 0 ? "today" : formatShort(r.next.due_date)}` : null;
            return (
              <li key={r.id}>
                <Link href={`/t/${r.id}`} className="block px-4 py-3 hover:bg-paper">
                  <div className="font-medium leading-snug">{title(r)}</div>
                  {r.late.length > 0
                    ? <div className="text-sm font-medium text-bad">Late: {r.late[0].title}{r.late.length > 1 ? ` and ${r.late.length - 1} more` : ""}</div>
                    : nextLine && <div className="text-sm text-muted">{nextLine}</div>}
                  {mentioned.has(r.id) && <div className="text-sm font-medium text-brand">Someone mentioned you</div>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <SectionTitle>Forward contracts by email</SectionTitle>
      <Card>
        <CopyText text={memberIntakeAddress(member.intake_token)} />
        <p className="mt-1 text-xs text-muted">Your personal address. Forward the executed contract here and the deal starts itself on your list.</p>
      </Card>

      {(missing.agent.length > 0 || missing.firm.length > 0) && (
        <p className="mt-6 text-center text-sm text-muted">
          {missing.agent.length > 0 && <>Add your {missing.agent.join(", ")} on <Link href="/profile" className="text-brand">your profile</Link>. </>}
          {missing.firm.length > 0 && <>Add the brokerage {missing.firm.join(", ")} in <Link href="/settings" className="text-brand">Settings</Link>. </>}
          It's a one-time step that helps match contracts to the right agent.
        </p>
      )}
    </AppShell>
  );
}
