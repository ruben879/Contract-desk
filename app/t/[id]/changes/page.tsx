import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { SourceLayout } from "@/components/SourceViewer";
import { orderedDocs } from "@/lib/docs";
import { ChangeSchema } from "@/lib/extract/schema";
import { proposeChanges, termsFromTx } from "@/lib/terms";
import type { DeadlineRule } from "@/lib/deadlines/compute";
import { ChangesForm } from "./ChangesForm";

export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();

  const { data: tx } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!tx) notFound();

  // RLS on the deal above already proved access; extractions are read through admin for the status filter.
  const { data: ex } = await supabaseAdmin().from("extractions").select("id, result, document_ids, source, intake_item_id")
    .eq("transaction_id", id).eq("kind", "amendment").eq("status", "ready").maybeSingle();
  if (!ex) redirect(`/t/${id}`);

  const result = ChangeSchema.parse(ex.result);
  const current = termsFromTx(tx);
  const { proposed, notes } = proposeChanges(current, result.changes as any);
  const added = result.addenda_added.filter((a) => !current.addenda.includes(a.key as any));
  const removed = result.addenda_removed.filter((k) => current.addenda.includes(k as any));

  const [{ data: rules }, { data: deadlines }, { data: items }] = await Promise.all([
    supabase.from("deadline_rules").select("*").eq("brokerage_id", brokerage.id),
    supabase.from("deadlines").select("key, label, due_date, due_time").eq("transaction_id", id),
    supabase.from("checklist_items").select("rule_key, title, status").eq("transaction_id", id),
  ]);

  // Only the documents this read looked at, in its order, so "Doc 1" means the same file.
  const docs = (await orderedDocs(supabase, id, ex.document_ids)).filter((d) => ex.document_ids.includes(d.id));
  const { data: item } = ex.source === "email" && ex.intake_item_id
    ? await supabaseAdmin().from("intake_items").select("from_email, subject, status").eq("id", ex.intake_item_id).maybeSingle()
    : { data: null };
  const routed = item ? { from: item.from_email, subject: item.subject, auto: item.status === "matched" } : null;

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings={isBrokerOrStaff} wide>
      <SourceLayout docs={docs.map((d) => ({ name: d.file_name, url: d.url, scanned: !!d.is_scanned }))}>
        <ChangesForm
          transactionId={id}
          extractionId={ex.id}
          address={[tx.property_street, tx.property_city].filter(Boolean).join(", ")}
          docNames={docs.map((d) => d.file_name)}
          summary={result.summary}
          current={current}
          proposed={proposed}
          addendaAdded={added}
          addendaRemoved={removed}
          notes={[...notes, ...result.warnings]}
          rules={(rules ?? []) as DeadlineRule[]}
          currentDeadlines={deadlines ?? []}
          currentTasks={items ?? []}
          routed={routed}
        />
      </SourceLayout>
    </AppShell>
  );
}
