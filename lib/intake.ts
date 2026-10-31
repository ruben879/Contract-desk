import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { routeIntake } from "@/lib/address";
import { labelDocuments, loadPdfs, readAddedDocuments, runExtraction } from "@/lib/extract/run";
import { triageDocuments } from "@/lib/extract/read-contract";

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export function isPdf(name: string, type?: string | null) {
  return type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

export function storagePath(brokerageId: string, transactionId: string, documentId: string) {
  return `${brokerageId}/${transactionId}/${documentId}.pdf`;
}
const intakePath = (brokerageId: string, itemId: string, documentId: string) => `${brokerageId}/intake/${itemId}/${documentId}.pdf`;

/** Emailed files wait here, attached to no deal, until routing or a person decides where they go. */
export async function createIntakeItem(opts: {
  brokerageId: string; memberId: string | null; from: string | null; subject: string | null;
  files: { name: string; bytes: Uint8Array }[];
}) {
  const db = supabaseAdmin();
  const { data: item, error } = await db.from("intake_items").insert({
    brokerage_id: opts.brokerageId, member_id: opts.memberId, from_email: opts.from, subject: opts.subject, status: "reading",
  }).select("id").single();
  if (error || !item) throw new Error(error?.message ?? "Could not save the email.");

  for (const f of opts.files) {
    const id = randomUUID();
    const path = intakePath(opts.brokerageId, item.id, id);
    const up = await db.storage.from("documents").upload(path, f.bytes, { contentType: "application/pdf" });
    if (up.error) throw new Error(up.error.message);
    await db.from("documents").insert({
      id, brokerage_id: opts.brokerageId, intake_item_id: item.id, storage_path: path, file_name: f.name,
      size_bytes: f.bytes.byteLength, sha256: createHash("sha256").update(f.bytes).digest("hex"), source: "email",
    });
  }
  return item.id as string;
}

async function loadItem(itemId: string) {
  const db = supabaseAdmin();
  const { data: item } = await db.from("intake_items").select("*").eq("id", itemId).single();
  if (!item) throw new Error("Intake item not found.");
  const { data: docs } = await db.from("documents").select("id, file_name, storage_path, size_bytes").eq("intake_item_id", itemId).order("created_at");
  return { db, item, docs: docs ?? [] };
}

export async function sendToSorting(itemId: string, reason: string, candidates: string[] = []) {
  await supabaseAdmin().from("intake_items").update({ status: "needs_sorting", reason, candidate_transaction_ids: candidates }).eq("id", itemId);
}

/** Put an intake item's documents on a deal and have the agent review what they change. */
type Defer = (task: () => Promise<unknown>) => void;

export async function attachIntakeToDeal(itemId: string, transactionId: string, sortedBy: string | null, defer?: Defer) {
  const { db, item, docs } = await loadItem(itemId);
  const { data: tx } = await db.from("transactions").select("id, brokerage_id, status").eq("id", transactionId).single();
  // Automatic routing only ever picks active deals; a person sorting may also pick a deal not yet confirmed.
  const allowed = sortedBy ? ["active", "needs_review", "reading", "failed"] : ["active"];
  if (!tx || tx.brokerage_id !== item.brokerage_id || !allowed.includes(tx.status)) throw new Error("That deal can't take documents right now.");

  await db.from("documents").update({ transaction_id: tx.id }).eq("intake_item_id", itemId).is("transaction_id", null);
  await db.from("intake_items").update({
    status: sortedBy ? "sorted" : "matched", transaction_id: tx.id, reason: null,
    sorted_by: sortedBy, sorted_at: sortedBy ? new Date().toISOString() : null,
  }).eq("id", itemId);
  await db.from("intake_emails").update({ transaction_id: tx.id }).eq("intake_item_id", itemId);

  const review = async () => {
    try {
      await readAddedDocuments(tx.id, docs.map((d) => d.id), { source: "email", intakeItemId: itemId });
    } catch {
      // Couldn't start the review (deal busy). Undo and let a person attach it in a moment.
      await db.from("documents").update({ transaction_id: null }).eq("intake_item_id", itemId).eq("transaction_id", tx.id);
      await sendToSorting(itemId, "Matched this deal, but another document on it was still being read. Attach it again in a minute.", [tx.id]);
    }
  };
  if (defer) defer(review); else await review();
}

/** Start a new deal from an intake item (an executed contract with no existing deal, or a person's choice). */
export async function createDealFromIntake(itemId: string, opts: { agentMemberId: string | null; createdBy: string | null; sortedBy: string | null; defer?: Defer }) {
  const { db, item } = await loadItem(itemId);
  const { data: tx, error } = await db.from("transactions").insert({
    brokerage_id: item.brokerage_id, agent_member_id: opts.agentMemberId, created_by: opts.createdBy, source: "email", status: "reading",
  }).select("id").single();
  if (error || !tx) throw new Error(error?.message ?? "Could not create the deal.");
  await db.from("documents").update({ transaction_id: tx.id }).eq("intake_item_id", itemId).is("transaction_id", null);
  await db.from("intake_items").update({
    status: opts.sortedBy ? "sorted" : "created", transaction_id: tx.id, reason: null,
    sorted_by: opts.sortedBy, sorted_at: opts.sortedBy ? new Date().toISOString() : null,
  }).eq("id", itemId);
  await db.from("intake_emails").update({ transaction_id: tx.id }).eq("intake_item_id", itemId);
  if (opts.defer) opts.defer(() => runExtraction(tx.id)); else await runExtraction(tx.id);
  return tx.id as string;
}

/**
 * Route an emailed batch. Attaches only on exactly one active-deal address match; starts a deal
 * only for a contract with no existing deal at that address; everything else goes to a person.
 */
export async function processIntakeItem(itemId: string) {
  const { db, item, docs } = await loadItem(itemId);
  if (item.status !== "reading") return;
  try {
    if (!docs.length) throw new Error("No documents.");
    const { triage } = await triageDocuments(await loadPdfs(db, docs));
    await labelDocuments(db, docs.map((d) => d.id), triage.documents);
    await db.from("intake_items").update({ triage }).eq("id", itemId);

    const { data: active } = await db.from("transactions").select("id, property_street, property_city, property_zip")
      .eq("brokerage_id", item.brokerage_id).eq("status", "active");
    const decision = routeIntake({
      isContract: triage.is_new_contract,
      property: triage.address_confidence === "low" ? null : { street: triage.property_street, city: triage.property_city, zip: triage.property_zip },
      activeDeals: (active ?? []).map((d) => ({ id: d.id, street: d.property_street, city: d.property_city, zip: d.property_zip })),
    });

    if (decision.action === "attach") return attachIntakeToDeal(itemId, decision.transactionId, null);
    if (decision.action === "create") {
      const { data: m } = item.member_id ? await db.from("brokerage_members").select("id, user_id").eq("id", item.member_id).single() : { data: null };
      await createDealFromIntake(itemId, { agentMemberId: m?.id ?? null, createdBy: m?.user_id ?? null, sortedBy: null });
      return;
    }
    await sendToSorting(itemId, decision.reason, decision.candidates);
  } catch (e) {
    await sendToSorting(itemId, `Couldn't read these documents automatically${e instanceof Error && e.message ? ` (${e.message})` : ""}. Look them over and choose where they go.`);
  }
}
