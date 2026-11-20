"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMember } from "@/lib/context";
import { isPdf, MAX_FILE_BYTES, storagePath } from "@/lib/intake";
import { SLOT_KEYS } from "@/lib/slots";
import { readAddedDocuments } from "@/lib/extract/run";

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
  revalidatePath("/");
  revalidatePath("/deals");
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

// ---------- Documents: remove, and the three ways out of a held document (Nov 18 rulings) ----------

/** The document, if this person can see it (RLS), with its deal. */
async function visibleDoc(documentId: string) {
  const { supabase, user } = await requireMember();
  const { data: doc } = await supabase.from("documents")
    .select("id, brokerage_id, transaction_id, file_name, storage_path, slot, held").eq("id", documentId).maybeSingle();
  if (!doc?.transaction_id) throw new Error("Document not found.");
  return { supabase, user, doc: doc as typeof doc & { transaction_id: string } };
}

function refreshDeal(id: string) {
  revalidatePath(`/t/${id}`);
  revalidatePath("/deals");
  revalidatePath("/");
}

/**
 * Remove a document from a deal for good: the file and its row. A change review waiting on it
 * is set aside, and any other documents in that review are checked again on their own.
 */
export async function removeDocument(documentId: string) {
  const { user, doc } = await visibleDoc(documentId);
  const admin = supabaseAdmin();
  const { data: open } = await admin.from("extractions").select("id, document_ids")
    .eq("transaction_id", doc.transaction_id).eq("kind", "amendment").in("status", ["pending", "ready"]);
  const affected = (open ?? []).filter((e) => (e.document_ids as string[]).includes(doc.id));
  for (const e of affected) await admin.from("extractions").update({ status: "dismissed", error: "A document in it was removed" }).eq("id", e.id);
  const rest = [...new Set(affected.flatMap((e) => (e.document_ids as string[]).filter((x) => x !== doc.id)))];

  const { error } = await admin.from("documents").delete().eq("id", doc.id);
  if (error) throw new Error("Couldn't remove it. Try again.");
  await admin.storage.from("documents").remove([doc.storage_path]);
  await admin.from("transaction_events").insert({
    brokerage_id: doc.brokerage_id, transaction_id: doc.transaction_id, kind: "document_removed", actor: user.id,
    summary: `Removed ${doc.file_name}${doc.held ? " (it didn't match this deal)" : ""}`,
  });
  if (rest.length) after(() => readAddedDocuments(doc.transaction_id, rest).catch((e) => console.error("[remove reread]", e)));
  refreshDeal(doc.transaction_id);
}

/** "Keep it on this deal anyway": the agent overrides the door. It's then read for changes like any other document. */
export async function keepHeldDocument(documentId: string) {
  const { user, doc } = await visibleDoc(documentId);
  if (!doc.held) return;
  const slot = (doc.held as { slot?: string | null }).slot ?? null;
  const admin = supabaseAdmin();
  await admin.from("documents").update({
    held: null, held_override: true, ...(slot ? { slot, slot_source: "agent" } : {}),
  }).eq("id", doc.id);
  await admin.from("transaction_events").insert({
    brokerage_id: doc.brokerage_id, transaction_id: doc.transaction_id, kind: "document_kept", actor: user.id,
    summary: `Kept ${doc.file_name} on this deal although it doesn't match`, document_ids: [doc.id],
  });
  after(() => readAddedDocuments(doc.transaction_id, [doc.id]).catch((e) => console.error("[keep reread]", e)));
  refreshDeal(doc.transaction_id);
}

/** "Wrong deal": move it to the deal it belongs to, where it's checked like a new arrival (and held again if it doesn't fit there either). */
export async function moveHeldDocument(documentId: string, targetId: string) {
  const { supabase, user, doc } = await visibleDoc(documentId);
  if (targetId === doc.transaction_id) throw new Error("Pick a different deal.");
  const { data: target } = await supabase.from("transactions").select("id, status, property_street").eq("id", targetId).maybeSingle();
  if (!target || ["closed", "cancelled"].includes(target.status)) throw new Error("That deal isn't open.");
  const admin = supabaseAdmin();
  await admin.from("documents").update({ transaction_id: target.id, held: null, held_override: false, slot: null, slot_source: null }).eq("id", doc.id);
  await admin.from("transaction_events").insert({
    brokerage_id: doc.brokerage_id, transaction_id: doc.transaction_id, kind: "document_moved", actor: user.id,
    summary: `Moved ${doc.file_name} to ${target.property_street ?? "another deal"}`,
  });
  after(() => readAddedDocuments(target.id, [doc.id]).catch((e) => console.error("[move reread]", e)));
  refreshDeal(doc.transaction_id);
  refreshDeal(target.id);
  redirect(`/t/${target.id}`);
}
