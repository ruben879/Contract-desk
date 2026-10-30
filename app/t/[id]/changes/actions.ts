"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyConfirmedTerms } from "@/lib/apply";
import { ADDENDUM_KEYS, DISCLOSURE_STATUSES, FINANCING_TYPES, type AddendumKey } from "@/lib/addenda";
import { TERM_KIND, TERM_LABEL, termsFromTx, type Terms } from "@/lib/terms";

const parsers = {
  money: z.preprocess((v) => (typeof v === "string" ? v.replace(/[$,\s]/g, "") : v), z.coerce.number().nonnegative()),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.coerce.number().int().min(0).max(365),
  financing: z.enum(FINANCING_TYPES),
  disclosure: z.enum(DISCLOSURE_STATUSES),
  text: z.string().trim().min(1),
} as const;

export type ChangesState = { error?: string } | undefined;

async function loadOpen(extractionId: string, transactionId: string) {
  const ctx = await requireMember();
  const { data: tx } = await ctx.supabase.from("transactions").select("*").eq("id", transactionId).maybeSingle();
  if (!tx) throw new Error("Deal not found.");
  const { data: ex } = await supabaseAdmin().from("extractions").select("id, status, result, document_ids, source, intake_item_id")
    .eq("id", extractionId).eq("transaction_id", transactionId).eq("kind", "amendment").maybeSingle();
  if (!ex || ex.status !== "ready") throw new Error("These changes were already handled.");
  return { ...ctx, tx, ex };
}

export async function confirmChanges(transactionId: string, extractionId: string, _prev: ChangesState, fd: FormData): Promise<ChangesState> {
  let ctx;
  try { ctx = await loadOpen(extractionId, transactionId); } catch (e) { return { error: (e as Error).message }; }
  const { supabase, user, tx, ex } = ctx;

  const current = termsFromTx(tx);
  const next: Terms = { ...current, addenda: [...current.addenda] };
  const keys = fd.getAll("change").map(String).filter((k) => k in TERM_KIND);
  for (const key of keys) {
    const raw = fd.get(`value_${key}`);
    const p = parsers[TERM_KIND[key] as keyof typeof parsers].safeParse(raw);
    if (!p.success) return { error: `Check the new ${TERM_LABEL[key].toLowerCase()}.` };
    (next as any)[key] = p.data;
  }
  const valid = new Set<string>(ADDENDUM_KEYS);
  for (const a of fd.getAll("add").map(String)) if (valid.has(a) && !next.addenda.includes(a as AddendumKey)) next.addenda.push(a as AddendumKey);
  const remove = new Set(fd.getAll("remove").map(String));
  next.addenda = next.addenda.filter((a) => !remove.has(a));
  // A signed Seller's Disclosure arriving means the buyer now has it.
  if (fd.getAll("add").includes("sellers_disclosure") && next.seller_disclosure !== "not_required" && !keys.includes("seller_disclosure")) next.seller_disclosure = "received";

  try {
    await applyConfirmedTerms({
      supabase, transactionId, userId: user.id, terms: next,
      event: { kind: "amendment_confirmed", summary: (ex.result as any)?.summary || "Changes from added documents confirmed", documentIds: ex.document_ids },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }
  await supabaseAdmin().from("extractions").update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: user.id, applied: next }).eq("id", ex.id);
  redirect(`/t/${transactionId}`);
}

export async function dismissChanges(transactionId: string, extractionId: string) {
  const { user, tx, ex } = await loadOpen(extractionId, transactionId);
  const admin = supabaseAdmin();
  await admin.from("extractions").update({ status: "dismissed", error: "Dismissed by agent", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", ex.id);
  await admin.from("transaction_events").insert({
    brokerage_id: tx.brokerage_id, transaction_id: transactionId, kind: "amendment_dismissed", actor: user.id,
    summary: "Added documents reviewed: no changes applied", document_ids: ex.document_ids,
  });
  redirect(`/t/${transactionId}`);
}

/** Routing matched the wrong deal: take the emailed documents off it and send them to sorting. */
export async function notThisDeal(transactionId: string, extractionId: string) {
  const { user, tx, ex, member } = await loadOpen(extractionId, transactionId);
  if (ex.source !== "email" || !ex.intake_item_id) throw new Error("Only emailed documents can be sent back.");
  const admin = supabaseAdmin();
  await admin.from("documents").update({ transaction_id: null }).eq("intake_item_id", ex.intake_item_id).eq("transaction_id", transactionId);
  await admin.from("extractions").update({ status: "dismissed", error: "Agent said not for this deal", confirmed_by: user.id, confirmed_at: new Date().toISOString() }).eq("id", ex.id);
  const where = [tx.property_street, tx.property_city].filter(Boolean).join(", ");
  await admin.from("intake_items").update({
    status: "needs_sorting", transaction_id: null, candidate_transaction_ids: [],
    reason: `${member.full_name || member.email} said these aren't for ${where || "the matched deal"}.`,
  }).eq("id", ex.intake_item_id);
  await admin.from("transaction_events").insert({
    brokerage_id: tx.brokerage_id, transaction_id: transactionId, kind: "amendment_dismissed", actor: user.id,
    summary: "Emailed documents removed: not for this deal", document_ids: ex.document_ids,
  });
  redirect("/sort");
}
