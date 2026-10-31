"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { readAddedDocuments } from "@/lib/extract/run";

/**
 * The agent started a new deal, but the reader found another deal at the same address.
 * Move this draft's documents onto that deal (where they're read the normal way for its state)
 * and remove the empty draft. Only for drafts that were never confirmed, and only by a person.
 */
export async function mergeDraftInto(draftId: string, targetId: string) {
  const { supabase } = await requireMember();
  // Both deals must be visible to this person (RLS), and the draft must still be a draft.
  const [{ data: draft }, { data: target }] = await Promise.all([
    supabase.from("transactions").select("id, brokerage_id, status, confirmed_at").eq("id", draftId).maybeSingle(),
    supabase.from("transactions").select("id, brokerage_id, status").eq("id", targetId).maybeSingle(),
  ]);
  if (!draft || !target || draft.brokerage_id !== target.brokerage_id) throw new Error("Deal not found.");
  if (draft.confirmed_at || !["needs_review", "failed"].includes(draft.status)) throw new Error("Only an unconfirmed draft can be merged.");
  if (!["active", "needs_review", "failed", "reading"].includes(target.status)) throw new Error("That deal can't take documents right now.");

  const db = supabaseAdmin();
  const { data: docs } = await db.from("documents").select("id").eq("transaction_id", draftId);
  const ids = (docs ?? []).map((d) => d.id);
  await db.from("documents").update({ transaction_id: targetId }).eq("transaction_id", draftId);
  await db.from("intake_items").update({ transaction_id: targetId }).eq("transaction_id", draftId);
  await db.from("intake_emails").update({ transaction_id: targetId }).eq("transaction_id", draftId);
  await db.from("transactions").delete().eq("id", draftId); // its draft reads go with it

  if (ids.length) after(() => readAddedDocuments(targetId, ids).catch((e) => console.error("[merge]", e)));
  redirect(`/t/${targetId}`);
}
