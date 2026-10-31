"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { attachIntakeToDeal, createDealFromIntake } from "@/lib/intake";

// Every choice here is a person's explicit decision. Access is checked with their own session (RLS)
// before the admin client moves anything.

async function openItem(itemId: string) {
  const ctx = await requireMember();
  const { data: item } = await ctx.supabase.from("intake_items").select("id, status, member_id").eq("id", itemId).maybeSingle();
  if (!item || item.status !== "needs_sorting") throw new Error("Already sorted.");
  return { ...ctx, item };
}

export async function attachToDeal(itemId: string, fd: FormData) {
  const { supabase, user, item } = await openItem(itemId);
  const txId = String(fd.get("transaction_id") ?? "");
  const { data: tx } = await supabase.from("transactions").select("id, status").eq("id", txId).maybeSingle();
  if (!tx || !["active", "needs_review", "reading", "failed"].includes(tx.status)) throw new Error("Pick an open deal.");
  await attachIntakeToDeal(item.id, tx.id, user.id, (task) => after(task));
  revalidatePath("/sort");
  redirect(`/t/${tx.id}`);
}

export async function startDeal(itemId: string) {
  const { user, member, item, isBrokerOrStaff } = await openItem(itemId);
  const agent = item.member_id ?? (isBrokerOrStaff ? null : member.id);
  const txId = await createDealFromIntake(item.id, { agentMemberId: agent, createdBy: user.id, sortedBy: user.id, defer: (task) => after(task) });
  redirect(`/t/${txId}`);
}

export async function discard(itemId: string) {
  const { user, item } = await openItem(itemId);
  await supabaseAdmin().from("intake_items").update({ status: "discarded", sorted_by: user.id, sorted_at: new Date().toISOString() }).eq("id", item.id);
  revalidatePath("/sort");
}
