import { notFound, redirect } from "next/navigation";
import { expireStaleReads } from "@/lib/extract/stale";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { ReadingPoller, RetryButton } from "@/components/ReadingPoller";
import { DealView } from "@/components/DealView";
import { Dropzone } from "@/components/Dropzone";
import { startAddDocuments } from "@/app/actions";
import { orderedDocs } from "@/lib/docs";
import { todayIn } from "@/lib/dates";

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
        <div className="mx-auto mt-6 max-w-sm text-left">
          <Dropzone compact then="reread" start={startAddDocuments.bind(null, id, null)}
            label="Add more of the file" hint="Anything you add now is included before you review." />
        </div>
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
        <Dropzone compact then="reread" start={startAddDocuments.bind(null, id, null)}
          label="Add a clearer copy or more of the file" hint="We'll read everything on this deal again." />
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
  return shell(
    <DealView id={id} tx={tx} today={todayIn(brokerage.timezone)} timezone={brokerage.timezone}
      deadlines={deadlines ?? []} items={items ?? []} links={links ?? []} events={events ?? []}
      lastReread={lastReread ?? null}
      docs={docs.map((d) => ({ id: d.id, file_name: d.file_name, url: d.url, slot: d.slot, slot_source: d.slot_source, page_count: d.page_count, is_scanned: d.is_scanned }))} />,
  );
}
