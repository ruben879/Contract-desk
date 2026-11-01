import Link from "next/link";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { AgentFilter } from "@/components/AutoSubmitSelect";
import { ChecklistToggle } from "@/components/ChecklistToggle";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { daysBetween, formatShort, formatTime, todayIn } from "@/lib/dates";
import { CommentBody, formatWhen } from "@/components/Comments";
import { MarkAllMentionsRead } from "@/components/CommentComposer";

type Row = {
  id: string; title: string; transaction_id: string; due_date: string; due_time: string | null;
  address: string; agent: string;
};

type MentionRow = {
  comment_id: string; transaction_id: string; read_at: string | null; created_at: string;
  deal_comments: { body: string; created_at: string; author_member_id: string } | null;
  transactions: { property_street: string | null; property_city: string | null } | null;
};

// The Queue: comments that mention you, across every deal (everyone), then the TC queue of
// open tasks due today or past due across every active file (broker and staff).
export default async function Queue({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent = "" } = await searchParams;
  const { supabase, brokerage, member, isBrokerOrStaff } = await requireMember();
  const today = todayIn(brokerage.timezone);

  const [{ data: mentionData }, { data: everyone }] = await Promise.all([
    supabase.from("comment_mentions")
      .select("comment_id, transaction_id, read_at, created_at, deal_comments(body, created_at, author_member_id), transactions(property_street, property_city)")
      .eq("member_id", member.id).order("created_at", { ascending: false }).limit(60).returns<MentionRow[]>(),
    supabase.from("brokerage_members").select("id, full_name, email").eq("brokerage_id", brokerage.id),
  ]);
  const mentions = (mentionData ?? []).filter((m) => m.deal_comments);
  const unreadCount = mentions.filter((m) => !m.read_at).length;
  const who = (id: string) => { const m = everyone?.find((t) => t.id === id); return m ? m.full_name || m.email : null; };

  const MentionsBlock = (
    <>
      <SectionTitle action={unreadCount > 0 ? <MarkAllMentionsRead /> : undefined}>
        Mentions{unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
      </SectionTitle>
      {mentions.length === 0 ? (
        <Card className="text-sm text-muted">No one has mentioned you yet. When someone types @ and picks you in a deal's comments, it shows up here.</Card>
      ) : (
        <Card className="divide-y divide-line p-0 sm:p-0">
          {mentions.map((m) => {
            const c = m.deal_comments!;
            const address = [m.transactions?.property_street, m.transactions?.property_city].filter(Boolean).join(", ") || "Deal";
            return (
              <Link key={m.comment_id} href={`/t/${m.transaction_id}#comments`}
                className={`block px-4 py-3 hover:bg-paper ${m.read_at ? "" : "border-l-4 border-l-brand bg-brand-soft/30"}`}>
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {!m.read_at && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">Unread</span>}
                  <span className="font-semibold">{who(c.author_member_id) ?? "Former member"}</span>
                  <span className="text-muted">on</span>
                  <span className="font-medium text-brand">{address}</span>
                  <span className="ml-auto text-xs text-muted">{formatWhen(c.created_at, brokerage.timezone)}</span>
                </div>
                <div className="line-clamp-4 text-sm"><CommentBody body={c.body} nameOf={who} meId={member.id} /></div>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );

  if (!isBrokerOrStaff) {
    return (
      <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings={false}>
        <h1 className="text-xl font-bold">Queue</h1>
        <p className="mt-1 text-sm text-muted">Comments that mention you, across your deals.</p>
        {MentionsBlock}
      </AppShell>
    );
  }

  let dq = supabase.from("deadlines")
    .select("transaction_id, key, due_date, due_time, transactions!inner(id, status, property_street, property_city, agent_member_id)")
    .lte("due_date", today).eq("transactions.status", "active");
  if (agent === "unassigned") dq = dq.is("transactions.agent_member_id", null);
  else if (agent) dq = dq.eq("transactions.agent_member_id", agent);

  const [{ data: due }, { data: team }] = await Promise.all([
    dq,
    supabase.from("brokerage_members").select("id, full_name, email").eq("brokerage_id", brokerage.id).eq("active", true).order("full_name"),
  ]);
  const name = (id: string | null) => { const m = team?.find((t) => t.id === id); return m ? m.full_name || m.email : "Unassigned"; };

  const byDeal = new Map<string, NonNullable<typeof due>>();
  for (const d of due ?? []) byDeal.set(d.transaction_id, [...(byDeal.get(d.transaction_id) ?? []), d]);
  const ids = [...byDeal.keys()];
  const { data: items } = ids.length
    ? await supabase.from("checklist_items").select("id, title, transaction_id, deadline_key").in("transaction_id", ids).eq("status", "open").not("deadline_key", "is", null)
    : { data: [] };

  const rows: Row[] = [];
  for (const it of items ?? []) {
    const d = byDeal.get(it.transaction_id)?.find((x) => x.key === it.deadline_key);
    if (!d) continue;
    const tx = d.transactions as unknown as { property_street: string | null; property_city: string | null; agent_member_id: string | null };
    rows.push({
      id: it.id, title: it.title, transaction_id: it.transaction_id, due_date: d.due_date, due_time: d.due_time,
      address: [tx.property_street, tx.property_city].filter(Boolean).join(", ") || "Deal", agent: name(tx.agent_member_id),
    });
  }
  const sort = (a: Row, b: Row) => a.due_date.localeCompare(b.due_date) || a.address.localeCompare(b.address);
  const late = rows.filter((r) => r.due_date < today).sort(sort);
  const todayRows = rows.filter((r) => r.due_date === today).sort(sort);

  const List = ({ list }: { list: Row[] }) => (
    <Card className="divide-y divide-line p-0 sm:p-0">
      {list.map((r) => {
        const days = daysBetween(r.due_date, today);
        return (
          <div key={r.id} className="flex gap-3 px-4 py-3">
            <ChecklistToggle id={r.id} done={false} />
            <div className="min-w-0 flex-1">
              <div>{r.title}</div>
              <div className="text-xs text-muted">
                <Link href={`/t/${r.transaction_id}`} className="text-brand">{r.address}</Link> · {r.agent}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs">
              {days > 0 ? <Badge tone="bad">{days} day{days === 1 ? "" : "s"} late</Badge> : <span className="font-semibold">{r.due_time ? formatTime(r.due_time) : "Today"}</span>}
              {days > 0 && <div className="mt-0.5 text-muted">{formatShort(r.due_date)}</div>}
            </div>
          </div>
        );
      })}
    </Card>
  );

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Queue</h1>
        <AgentFilter value={agent} options={(team ?? []).map((t) => ({ id: t.id, name: t.full_name || t.email }))} />
      </div>
      <p className="mt-1 text-sm text-muted">Comments that mention you, then every open task due today or past due, across all active files.</p>

      {MentionsBlock}

      <SectionTitle>Tasks due</SectionTitle>
      {rows.length === 0 && <Card className="text-center text-muted">Nothing due today or past due.</Card>}
      {late.length > 0 && <><SectionTitle>Past due · {late.length}</SectionTitle><List list={late} /></>}
      {todayRows.length > 0 && <><SectionTitle>Due today · {todayRows.length}</SectionTitle><List list={todayRows} /></>}
    </AppShell>
  );
}
