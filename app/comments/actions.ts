"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/context";
import { MAX_COMMENT, mentionIds, sanitizeMentions } from "@/lib/comments";

// Comments are written only by a person pressing Post. Nothing in the app posts one on its own,
// and they never go into the deal's system history (transaction_events).

export type PostResult = { ok: true } | { ok: false; error: string };

/** Members who can open this deal: broker and staff, plus the assigned agent. Only they can be mentioned. */
async function dealAudience(supabase: Awaited<ReturnType<typeof requireMember>>["supabase"], transactionId: string) {
  const { data: tx } = await supabase.from("transactions").select("id, brokerage_id, agent_member_id").eq("id", transactionId).maybeSingle();
  if (!tx) return null;
  const { data: team } = await supabase.from("brokerage_members").select("id, full_name, email, role")
    .eq("brokerage_id", tx.brokerage_id).eq("active", true);
  const members = team ?? [];
  const allowed = new Set(members.filter((m) => m.role !== "agent" || m.id === tx.agent_member_id).map((m) => m.id));
  const nameOf = (id: string) => { const m = members.find((x) => x.id === id); return m ? m.full_name || m.email : null; };
  return { tx, allowed, nameOf };
}

export async function postComment(transactionId: string, raw: string): Promise<PostResult> {
  const { supabase, member } = await requireMember();
  const text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > MAX_COMMENT) return { ok: false, error: `Keep it under ${MAX_COMMENT.toLocaleString()} characters.` };

  const aud = await dealAudience(supabase, transactionId);
  if (!aud) return { ok: false, error: "Deal not found." };
  const body = sanitizeMentions(text, aud.allowed, aud.nameOf);

  // RLS: you can only post on deals you can see, and only as yourself.
  const { data: comment, error } = await supabase.from("deal_comments")
    .insert({ transaction_id: transactionId, brokerage_id: aud.tx.brokerage_id, author_member_id: member.id, body })
    .select("id, brokerage_id").single();
  if (error || !comment) return { ok: false, error: "Couldn't post that. Try again." };

  const mentioned = mentionIds(body).filter((id) => id !== member.id);
  if (mentioned.length) {
    const { error: mErr } = await supabase.from("comment_mentions").insert(
      mentioned.map((id) => ({ comment_id: comment.id, member_id: id, brokerage_id: comment.brokerage_id, transaction_id: transactionId })),
    );
    if (mErr) console.error("[comments] mentions", mErr.message);
  }

  revalidatePath(`/t/${transactionId}`);
  revalidatePath("/queue");
  return { ok: true };
}

export async function deleteComment(commentId: string) {
  const { supabase } = await requireMember();
  // RLS: only the author can delete.
  const { data } = await supabase.from("deal_comments").delete().eq("id", commentId).select("transaction_id");
  const t = data?.[0]?.transaction_id;
  if (t) revalidatePath(`/t/${t}`);
  revalidatePath("/queue");
}

/** Mark your mentions read: on one deal (opening it), or all of them (from the Queue). */
export async function markMentionsRead(transactionId?: string) {
  const { supabase } = await requireMember();
  await supabase.rpc("mark_mentions_read", { t: transactionId ?? null });
  if (!transactionId) revalidatePath("/queue");
}
