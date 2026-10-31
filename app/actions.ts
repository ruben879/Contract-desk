"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/context";
import { isPdf, MAX_FILE_BYTES, storagePath } from "@/lib/intake";
import { SLOT_KEYS } from "@/lib/slots";

type FileMeta = { name: string; size: number; type: string };

function checkFiles(files: FileMeta[]) {
  if (!files.length) throw new Error("Add at least one PDF.");
  for (const f of files) {
    if (!isPdf(f.name, f.type)) throw new Error(`${f.name} isn't a PDF.`);
    if (f.size > MAX_FILE_BYTES) throw new Error(`${f.name} is over 30 MB.`);
  }
}

async function signedUploads(supabase: Awaited<ReturnType<typeof requireMember>>["supabase"], brokerageId: string, txId: string, userId: string, files: FileMeta[], source: "upload", slot: string | null = null) {
  const uploads: { id: string; path: string; token: string; name: string }[] = [];
  for (const f of files) {
    const id = randomUUID();
    const path = storagePath(brokerageId, txId, id);
    const { error: docErr } = await supabase.from("documents").insert({
      id, brokerage_id: brokerageId, transaction_id: txId, storage_path: path, file_name: f.name,
      size_bytes: f.size, source, uploaded_by: userId,
      ...(slot ? { slot, slot_source: "agent" } : {}),
    });
    if (docErr) throw new Error(docErr.message);
    const { data, error } = await supabase.storage.from("documents").createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "Upload could not start.");
    uploads.push({ id, path, token: data.token, name: f.name });
  }
  return uploads;
}

/** New deal from a drag-and-drop: creates the transaction and returns one signed upload per PDF. */
export async function startUpload(files: FileMeta[]) {
  checkFiles(files);
  const { supabase, user, member } = await requireMember();
  // The id is chosen here, not read back with RETURNING: reading back a row in the same statement
  // that creates it is checked against the select policy, which can't see the unsaved row (Oct 31 bug).
  const id = randomUUID();
  const { error } = await supabase.from("transactions").insert({
    id, brokerage_id: member.brokerage_id, agent_member_id: member.id, created_by: user.id, source: "upload", status: "reading",
  });
  if (error) {
    console.error("[upload] could not create deal", error.message);
    throw new Error("Couldn't start the deal. Try again, and tell the broker if it keeps happening.");
  }
  const uploads = await signedUploads(supabase, member.brokerage_id, id, user.id, files, "upload");
  return { transactionId: id, uploads };
}

/** Extra documents on an existing deal. The client then asks for a re-read, which proposes changes for the agent to confirm. */
export async function startAddDocuments(transactionId: string, slot: string | null, files: FileMeta[]) {
  if (slot && !SLOT_KEYS.includes(slot)) throw new Error("Unknown slot.");
  checkFiles(files);
  const { supabase, user, member } = await requireMember();
  const { data: tx } = await supabase.from("transactions").select("id").eq("id", transactionId).maybeSingle();
  if (!tx) throw new Error("Deal not found.");
  return { transactionId, uploads: await signedUploads(supabase, member.brokerage_id, transactionId, user.id, files, "upload", slot) };
}

export async function setChecklistStatus(itemId: string, status: "open" | "done" | "not_needed") {
  const { supabase, user } = await requireMember();
  const { data } = await supabase.from("checklist_items").update({
    status,
    completed_at: status === "open" ? null : new Date().toISOString(),
    completed_by: status === "open" ? null : user.id,
  }).eq("id", itemId).select("transaction_id").single();
  if (data) revalidatePath(`/t/${data.transaction_id}`);
  revalidatePath("/queue");
}

/** Re-file a document into another slot. A person's placement is never overwritten by the reader. */
export async function moveDocument(documentId: string, slot: string) {
  if (!SLOT_KEYS.includes(slot)) throw new Error("Unknown slot.");
  const { supabase } = await requireMember();
  const { data } = await supabase.from("documents").update({ slot, slot_source: "agent" }).eq("id", documentId).select("transaction_id").single();
  if (data?.transaction_id) revalidatePath(`/t/${data.transaction_id}`);
}

/**
 * Throw away a deal that was never confirmed (a failed read, a duplicate start). Its documents
 * and draft reads go with it. Confirmed deals can't be discarded here.
 */
export async function discardDraft(transactionId: string) {
  const { supabase } = await requireMember();
  const { data: tx } = await supabase.from("transactions").select("id, status, confirmed_at").eq("id", transactionId).maybeSingle();
  if (!tx) throw new Error("Deal not found.");
  if (tx.confirmed_at || !["failed", "needs_review"].includes(tx.status)) throw new Error("Only an unconfirmed draft can be discarded.");
  const admin = supabaseAdmin();
  const { data: docs } = await admin.from("documents").select("storage_path").eq("transaction_id", tx.id);
  const paths = (docs ?? []).map((d) => d.storage_path);
  if (paths.length) await admin.storage.from("documents").remove(paths);
  await admin.from("transactions").delete().eq("id", tx.id);
  revalidatePath("/");
  redirect("/");
}
