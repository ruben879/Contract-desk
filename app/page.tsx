import Link from "next/link";
import { expireStaleReads } from "@/lib/extract/stale";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Dropzone } from "@/components/Dropzone";
import { TaskAction } from "@/components/TaskAction";
import { StreamCardView } from "@/components/StreamCard";
import { startUpload } from "./actions";
import { todayIn } from "@/lib/dates";
import { buildStream, type StreamDeal } from "@/lib/today";

type Row = {
  id: string; status: string; property_street: string | null; property_city: string | null; agent_member_id: string | null;
  deadlines: { key: string; label: string; due_date: string }[];
  checklist_items: StreamDeal["items"];
  documents: { file_name: string }[];
};
const addressOf = (r: Pick<Row, "property_street" | "property_city" | "documents">) =>
  r.property_street ? [r.property_street, r.property_city].filter(Boolean).join(", ") : r.documents[0]?.file_name ?? "New contract";

// Today: a ranked stream that ends. Things to check first (nothing can be tracked until a
// contract is confirmed), then late, due today, and each other deal's next date.
export default async function Today() {
  const { supabase, member, brokerage, isBrokerOrStaff } = await requireMember();
  await expireStaleReads(brokerage.id);
  const today = todayIn(brokerage.timezone);

  const { data } = await supabase.from("transactions")
    .select("id, status, property_street, property_city, agent_member_id, deadlines(key, label, due_date), checklist_items(id, rule_key, title, status, deadline_key, sort), documents(file_name)")
    .in("status", ["needs_review", "failed", "active"])
    .order("created_at", { ascending: false })
    .returns<Row[]>();
  // Today is yours: deals assigned to you. Broker and staff also pick up unassigned files.
  // (The whole brokerage is in Deals, and the dense TC queue is under More.)
  const mine = (data ?? []).filter((r) => r.agent_member_id === member.id || (isBrokerOrStaff && !r.agent_member_id));

  const [{ data: pending }, { count: toSort }, { data: unread }] = await Promise.all([
    supabase.from("extractions").select("transaction_id").eq("kind", "amendment").eq("status", "ready"),
    supabase.from("intake_items").select("id", { count: "exact", head: true }).eq("status", "needs_sorting"),
    supabase.from("comment_mentions").select("transaction_id, transactions(property_street)").eq("member_id", member.id).is("read_at", null),
  ]);
  const amended = new Set((pending ?? []).map((p) => p.transaction_id));
  const toCheck = mine.filter((r) => r.status === "needs_review" || r.status === "failed" || amended.has(r.id));
  const active = mine.filter((r) => r.status === "active" && !amended.has(r.id));
  const { cards, caughtUp } = buildStream(active.map((r) => ({ id: r.id, address: addressOf(r), deadlines: r.deadlines, items: r.checklist_items })), today);
  const mentionDeals = [...new Map((unread ?? []).map((m: any) => [m.transaction_id, m.transactions?.property_street ?? "a deal"])).entries()];
  const nothingYet = (data ?? []).length === 0;

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url}>
      <h1 className="mb-4 mt-2 text-[26px] font-semibold leading-tight tracking-[-0.01em]">Today</h1>

      {mentionDeals.slice(0, 3).map(([id, street]) => (
        <Link key={id} href={`/t/${id}#comments`} className="mb-2 block text-[15px] font-medium text-brand underline underline-offset-[3px]">
          Someone mentioned you on {street}
        </Link>
      ))}

      {nothingYet ? (
        <Dropzone start={startUpload} label="Start your first deal: drop the contract here" hint="Or tap to choose PDFs or take photos. You'll check what we read before anything is saved." />
      ) : (
        <ol className="flex flex-col gap-3">
          {!!toSort && (
            <StreamCardView href="/sort" eyebrow="Email" title={toSort === 1 ? "An emailed document needs sorting" : `Emailed documents need sorting`}
              action={<Link href="/sort" className="relative z-10 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[15px] font-medium text-white">Sort</Link>} />
          )}
          {toCheck.map((r) => {
            const href = amended.has(r.id) ? `/t/${r.id}/changes` : `/t/${r.id}`;
            const [title, verb] = r.status === "failed" ? ["We couldn't read this contract", "See what happened"]
              : amended.has(r.id) ? ["A new document may change this deal", "Review changes"] : ["Check what we read", "Check it"];
            return (
              <StreamCardView key={r.id} href={href} eyebrow={addressOf(r)} title={title}
                when={!r.agent_member_id ? "Not assigned to an agent yet" : undefined} tone="warn"
                action={<Link href={href} className="relative z-10 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[15px] font-medium text-white">{verb}</Link>} />
            );
          })}
          {cards.map((c) => c.kind === "next" ? (
            <StreamCardView key={`n-${c.dealId}`} href={`/t/${c.dealId}`} eyebrow={c.address} title={c.title} when={c.when} tone="muted" />
          ) : (
            <StreamCardView key={c.itemId} href={`/t/${c.dealId}`} eyebrow={c.address} title={c.title} when={c.when}
              tone={c.kind === "late" ? "bad" : "warn"}
              action={<TaskAction itemId={c.itemId} ruleKey={c.ruleKey} transactionId={c.dealId} />} />
          ))}
          <li className="px-2 py-6 text-center">
            {caughtUp && toCheck.length === 0 && !toSort ? (
              <>
                <div className="text-lg font-semibold">You're caught up</div>
                <div className="text-muted">Nothing is late or due today.</div>
              </>
            ) : (
              <div className="text-muted">That's everything for today.</div>
            )}
          </li>
        </ol>
      )}
    </AppShell>
  );
}
