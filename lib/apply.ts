import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { computeDeadlines, diffDeadlines, type DeadlineRule } from "@/lib/deadlines/compute";
import { buildChecklist } from "@/lib/checklist/rules";
import { diffTerms, termsFromTx, type Terms } from "@/lib/terms";

export type ContactRow = { role: string; full_name: string; company: string | null; email: string | null; phone: string | null };

/**
 * The ONLY code path that writes confirmed terms, deadlines, and checklist tasks.
 * Called after an agent presses Confirm (first read, edit, or amendment). Never called by
 * extraction. Moving any anchor date re-runs the whole deadline chain.
 */
export async function applyConfirmedTerms(opts: {
  supabase: SupabaseClient;
  transactionId: string;
  userId: string;
  terms: Terms;
  agentMemberId?: string | null;   // undefined = leave as is
  contacts?: ContactRow[];         // undefined = leave People alone (amendments)
  event: { kind: "confirmed" | "edited" | "amendment_confirmed"; summary?: string; documentIds?: string[] };
}) {
  const { supabase, transactionId: id, userId, terms } = opts;
  const { data: tx, error: txErr } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (txErr || !tx) throw new Error("Deal not found.");
  const before = termsFromTx(tx);
  const now = new Date().toISOString();

  // 1. Terms.
  const { error } = await supabase.from("transactions").update({
    ...terms,
    property_state: terms.property_state ?? "TX",
    ...(opts.agentMemberId !== undefined ? { agent_member_id: opts.agentMemberId } : {}),
    status: tx.status === "closed" || tx.status === "cancelled" ? tx.status : "active",
    confirmed_at: now, confirmed_by: userId, updated_at: now,
  }).eq("id", id);
  if (error) throw new Error(error.message);

  // 2. Deadlines: recompute the full chain from the brokerage's rules.
  const { data: rules } = await supabase.from("deadline_rules").select("*").eq("brokerage_id", tx.brokerage_id);
  const { deadlines } = computeDeadlines((rules ?? []) as DeadlineRule[], terms);
  const { data: oldDeadlines } = await supabase.from("deadlines").select("key, label, due_date, due_time").eq("transaction_id", id);
  if (deadlines.length) {
    const { error: dErr } = await supabase.from("deadlines").upsert(
      deadlines.map((d) => ({ ...d, brokerage_id: tx.brokerage_id, transaction_id: id, manually_overridden: false })),
      { onConflict: "transaction_id,key" },
    );
    if (dErr) throw new Error(dErr.message);
  }
  const keep = new Set(deadlines.map((d) => d.key));
  const stale = (oldDeadlines ?? []).map((d) => d.key).filter((k) => !keep.has(k));
  if (stale.length) await supabase.from("deadlines").delete().eq("transaction_id", id).in("key", stale);

  // 3. Checklist: add what now applies, keep finished or not-needed tasks, drop open tasks that no longer apply.
  const { data: oldItems } = await supabase.from("checklist_items").select("rule_key, title, status").eq("transaction_id", id);
  const list = buildChecklist({ side: terms.side, addenda: terms.addenda, financing_type: terms.financing_type, seller_disclosure: terms.seller_disclosure });
  await supabase.from("checklist_items").upsert(
    list.map((i) => ({ ...i, brokerage_id: tx.brokerage_id, transaction_id: id,
      completed_at: i.status === "done" ? now : null, completed_by: i.status === "done" ? userId : null })),
    { onConflict: "transaction_id,rule_key", ignoreDuplicates: true },
  );
  const applies = new Set(list.map((i) => i.rule_key));
  const drop = (oldItems ?? []).filter((i) => i.status === "open" && !applies.has(i.rule_key));
  if (drop.length) await supabase.from("checklist_items").delete().eq("transaction_id", id).in("rule_key", drop.map((i) => i.rule_key));
  const had = new Set((oldItems ?? []).map((i) => i.rule_key));
  const tasks = { added: list.filter((i) => !had.has(i.rule_key)).map((i) => i.title), removed: drop.map((i) => i.title) };

  // 4. People (first confirm and edits only).
  if (opts.contacts) await syncContacts(supabase, tx.brokerage_id, id, userId, opts.contacts);

  // 5. Audit trail.
  const t = diffTerms(before, terms);
  const shifts = diffDeadlines(oldDeadlines ?? [], deadlines).filter((s) => s.change !== "same");
  await supabaseAdmin().from("transaction_events").insert({
    brokerage_id: tx.brokerage_id, transaction_id: id, kind: opts.event.kind, actor: userId,
    summary: opts.event.summary ?? (opts.event.kind === "confirmed" ? "Contract details confirmed" : "Deal details edited"),
    changes: { fields: t.fields, addenda: t.addenda, side: t.side, deadlines: shifts, tasks },
    document_ids: opts.event.documentIds ?? [],
  });

  return { shifts, tasks };
}

async function syncContacts(supabase: SupabaseClient, brokerageId: string, txId: string, userId: string, rows: ContactRow[]) {
  await supabase.from("transaction_contacts").delete().eq("transaction_id", txId);
  for (const c of rows) {
    // One party record, reused everywhere: match on email, else on name + type.
    const q = supabase.from("contacts").select("id").eq("brokerage_id", brokerageId).limit(1);
    const { data: match } = c.email
      ? await q.ilike("email", c.email).maybeSingle()
      : await q.eq("type", c.role).ilike("full_name", c.full_name).maybeSingle();
    let contactId = match?.id as string | undefined;
    if (contactId) {
      await supabase.from("contacts").update({
        full_name: c.full_name, ...(c.company ? { company: c.company } : {}), ...(c.phone ? { phone: c.phone } : {}), ...(c.email ? { email: c.email } : {}),
      }).eq("id", contactId);
    } else {
      const { data: created } = await supabase.from("contacts").insert({
        brokerage_id: brokerageId, type: c.role, full_name: c.full_name, company: c.company, email: c.email, phone: c.phone, created_by: userId,
      }).select("id").single();
      contactId = created?.id;
    }
    if (contactId) {
      await supabase.from("transaction_contacts").upsert(
        { transaction_id: txId, contact_id: contactId, role: c.role, brokerage_id: brokerageId },
        { onConflict: "transaction_id,contact_id,role", ignoreDuplicates: true },
      );
    }
  }
}
