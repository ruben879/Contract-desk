import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { AgentFilter } from "@/components/AutoSubmitSelect";
import { ChecklistToggle } from "@/components/ChecklistToggle";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { daysBetween, formatShort, formatTime, todayIn } from "@/lib/dates";

type Row = {
  id: string; title: string; transaction_id: string; due_date: string; due_time: string | null;
  address: string; agent: string;
};

// TC queue: every open task due today or past due, across every active file. Nothing else.
export default async function Queue({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent = "" } = await searchParams;
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  if (!isBrokerOrStaff) redirect("/");
  const today = todayIn(brokerage.timezone);

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
      <p className="mt-1 text-sm text-muted">Every open task due today or past due, across all active files.</p>

      {rows.length === 0 && <Card className="mt-4 text-center text-muted">Nothing due today or past due.</Card>}
      {late.length > 0 && <><SectionTitle>Past due · {late.length}</SectionTitle><List list={late} /></>}
      {todayRows.length > 0 && <><SectionTitle>Due today · {todayRows.length}</SectionTitle><List list={todayRows} /></>}
    </AppShell>
  );
}
