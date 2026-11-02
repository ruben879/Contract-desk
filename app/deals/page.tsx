import Link from "next/link";
import { expireStaleReads } from "@/lib/extract/stale";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Dropzone } from "@/components/Dropzone";
import { cx } from "@/components/ui";
import { startUpload } from "@/app/actions";
import { daysBetween, formatShort, todayIn } from "@/lib/dates";

type Row = {
  id: string; status: string; property_street: string | null; property_city: string | null;
  deadlines: { key: string; label: string; due_date: string }[];
  checklist_items: { title: string; status: string; deadline_key: string | null; sort: number }[];
  documents: { file_name: string }[];
};

// Every open deal you can see, as identical rows: the address, then ONE line
// (what's late, or else the next date). Same fields in the same place on every row.
export default async function Deals() {
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  await expireStaleReads(brokerage.id);
  const today = todayIn(brokerage.timezone);

  const [{ data }, { data: pending }] = await Promise.all([
    supabase.from("transactions")
      .select("id, status, property_street, property_city, deadlines(key, label, due_date), checklist_items(title, status, deadline_key, sort), documents(file_name)")
      .in("status", ["reading", "needs_review", "failed", "active"]).order("created_at", { ascending: false }).returns<Row[]>(),
    supabase.from("extractions").select("transaction_id").eq("kind", "amendment").eq("status", "ready"),
  ]);
  const amended = new Set((pending ?? []).map((p) => p.transaction_id));

  const rows = (data ?? []).map((r) => {
    const address = r.property_street ? [r.property_street, r.property_city].filter(Boolean).join(", ") : r.documents[0]?.file_name ?? "New contract";
    const due = new Map(r.deadlines.map((d) => [d.key, d.due_date]));
    const late = r.checklist_items
      .filter((i) => i.status === "open" && i.deadline_key && (due.get(i.deadline_key) ?? "9999") < today)
      .sort((a, b) => due.get(a.deadline_key!)!.localeCompare(due.get(b.deadline_key!)!) || a.sort - b.sort);
    const next = r.deadlines.filter((d) => d.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    let line: string; let tone: "bad" | "warn" | "muted" = "muted"; let rank = 3; let key = next?.due_date ?? "9999";
    if (r.status === "reading") { line = "Reading the contract now"; rank = 1; }
    else if (r.status === "failed") { line = "Couldn't read it. Tap to see why."; tone = "warn"; rank = 1; }
    else if (r.status === "needs_review") { line = "Check what we read"; tone = "warn"; rank = 1; }
    else if (amended.has(r.id)) { line = "Review what changed"; tone = "warn"; rank = 1; }
    else if (late.length) {
      line = `Late: ${late[0].title}${late.length > 1 ? `, and ${late.length - 1} more` : ""}`; tone = "bad"; rank = 0; key = due.get(late[0].deadline_key!)!;
    } else if (next) line = `${next.label} ${daysBetween(today, next.due_date) === 0 ? "today" : formatShort(next.due_date)}`;
    else line = "No upcoming dates";
    return { id: r.id, address, line, tone, rank, key };
  }).sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key) || a.address.localeCompare(b.address));

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url}>
      <h1 className="mb-4 mt-2 text-[26px] font-semibold leading-tight tracking-[-0.01em]">{isBrokerOrStaff ? "Deals" : "Your deals"}</h1>
      <Dropzone compact start={startUpload} label="Start a deal" hint="Drop the executed contract, or tap to choose PDFs or take photos." />

      {rows.length === 0 ? (
        <p className="mt-6 text-muted">No open deals yet. Your first confirmed contract shows up here.</p>
      ) : (
        <ul className="mt-4 overflow-hidden rounded-card bg-card shadow-card">
          {rows.map((r) => (
            <li key={r.id} className="border-b border-line last:border-b-0">
              <Link href={`/t/${r.id}`} className="block px-4 py-3.5 hover:bg-paper">
                <div className="font-medium leading-snug">{r.address}</div>
                <div className={cx("text-[15px]", r.tone === "bad" ? "font-medium text-bad" : r.tone === "warn" ? "font-medium text-warn" : "text-muted")}>{r.line}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
