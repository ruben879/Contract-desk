import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { termsFromTx } from "@/lib/terms";
import { inspectPdf } from "./pdf";
import { readChanges, readContract, type PdfInput } from "./read-contract";

const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
type Db = ReturnType<typeof supabaseAdmin>;

/** Download, inspect (scan or not), and base64 the documents, in the order given. */
export async function loadPdfs(db: Db, docs: { id: string; file_name: string; storage_path: string; size_bytes: number | null }[]) {
  const pdfs: PdfInput[] = [];
  let total = 0;
  for (const doc of docs) {
    const { data: blob, error } = await db.storage.from("documents").download(doc.storage_path);
    if (error || !blob) throw new Error(`Could not open ${doc.file_name}.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    total += bytes.byteLength;
    if (total > MAX_TOTAL_BYTES) throw new Error("These PDFs are larger than 30 MB combined. Split the packet and try again.");
    const info = await inspectPdf(bytes).catch(() => null);
    await db.from("documents").update({
      page_count: info?.pageCount ?? null, is_scanned: info?.isScanned ?? null, size_bytes: doc.size_bytes ?? bytes.byteLength,
    }).eq("id", doc.id);
    pdfs.push({ name: doc.file_name, base64: Buffer.from(bytes).toString("base64"), isScanned: info?.isScanned ?? true });
  }
  return pdfs;
}

/** Record what each document is, and file it into a slot unless a person already placed it. */
export async function labelDocuments(db: Db, ids: string[], kinds: { doc: number; kind: string; slot?: string | null }[]) {
  for (const k of kinds) {
    const id = ids[k.doc - 1];
    if (!id) continue;
    await db.from("documents").update({ kind: k.kind }).eq("id", id);
    if (k.slot) await db.from("documents").update({ slot: k.slot, slot_source: "reader" }).eq("id", id).is("slot", null);
  }
}

/**
 * First read of a new deal. Saves a DRAFT only. The agent's confirm step is the only path
 * from draft to real data.
 */
export async function runExtraction(transactionId: string) {
  const db = supabaseAdmin();
  const { data: tx } = await db.from("transactions").select("id, brokerage_id, status").eq("id", transactionId).single();
  if (!tx || !["reading", "failed"].includes(tx.status)) return;
  await db.from("transactions").update({ status: "reading", updated_at: new Date().toISOString() }).eq("id", tx.id);

  const { data: docs } = await db.from("documents").select("id, file_name, storage_path, size_bytes").eq("transaction_id", tx.id).order("created_at");
  const ids = (docs ?? []).map((d) => d.id);
  const { data: ex } = await db.from("extractions")
    .insert({ brokerage_id: tx.brokerage_id, transaction_id: tx.id, kind: "initial", status: "running", document_ids: ids, started_at: new Date().toISOString() })
    .select("id").single();

  try {
    if (!docs?.length) throw new Error("No documents were found on this transaction.");
    const { extraction, model } = await readContract(await loadPdfs(db, docs));
    await labelDocuments(db, ids, extraction.documents);
    await db.from("extractions").update({ status: "ready", result: extraction, model, finished_at: new Date().toISOString() }).eq("id", ex!.id);
    await db.from("transactions").update({ status: "needs_review", updated_at: new Date().toISOString() }).eq("id", tx.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong reading this contract.";
    await db.from("extractions").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", ex!.id);
    await db.from("transactions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", tx.id);
  }
}

/**
 * Re-read after documents are added to a confirmed deal (amendments, new addenda, a signed
 * disclosure). Produces a proposed diff for the agent to confirm. Never touches the deal itself.
 */
export async function runAmendmentRead(
  transactionId: string,
  documentIds: string[],
  opts: { source?: "upload" | "email"; intakeItemId?: string | null; waitForRunning?: boolean } = {},
) {
  const db = supabaseAdmin();
  const { data: tx } = await db.from("transactions").select("*").eq("id", transactionId).single();
  if (!tx || tx.status !== "active" || !documentIds.length) return;

  // One open review per deal. A new upload while one waits folds into it and re-reads them together.
  const openReview = () => db.from("extractions").select("id, status, document_ids, source, intake_item_id")
    .eq("transaction_id", tx.id).eq("kind", "amendment").in("status", ["pending", "running", "ready"]).maybeSingle();
  let { data: open } = await openReview();
  // Email routing can't ask anyone to retry, so it waits (up to ~2 minutes) for a running read to finish.
  for (let i = 0; open?.status === "running" && opts.waitForRunning && i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    ({ data: open } = await openReview());
  }
  if (open?.status === "running") throw new Error("Still reading the last document. Add this one in a minute.");
  const source = opts.source === "email" || open?.source === "email" ? "email" : "upload";
  const intakeItemId = opts.intakeItemId ?? open?.intake_item_id ?? null;
  const ids = [...new Set([...(open?.document_ids ?? []), ...documentIds])];
  if (open) await db.from("extractions").update({ status: "dismissed", error: "Replaced by a newer read" }).eq("id", open.id);

  const base = termsFromTx(tx);
  const { data: ex, error } = await db.from("extractions")
    .insert({ brokerage_id: tx.brokerage_id, transaction_id: tx.id, kind: "amendment", status: "running", document_ids: ids, base, source, intake_item_id: intakeItemId, started_at: new Date().toISOString() })
    .select("id").single();
  if (error || !ex) throw new Error(error?.message ?? "Could not start reading.");

  try {
    const { data: docs } = await db.from("documents").select("id, file_name, storage_path, size_bytes").in("id", ids).eq("transaction_id", tx.id);
    const ordered = ids.map((id) => docs?.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
    if (!ordered.length) throw new Error("No documents were found.");

    const { changes, model } = await readChanges(base, await loadPdfs(db, ordered));
    await labelDocuments(db, ordered.map((d) => d.id), changes.documents);

    const somethingChanged = changes.changes.length > 0 || changes.addenda_added.length > 0 || changes.addenda_removed.length > 0;
    // An amendment with "no changes" still goes to the agent: a missed change is worse than an extra tap.
    const isAmendment = changes.documents.some((d) => d.kind === "amendment");
    // Anything routed in by email always goes to the agent: they should see what landed on their deal.
    const needsAgent = source === "email" || somethingChanged || isAmendment || changes.warnings.length > 0;

    await db.from("extractions").update({
      status: needsAgent ? "ready" : "dismissed",
      error: needsAgent ? null : "No term changes",
      result: changes, model, finished_at: new Date().toISOString(),
    }).eq("id", ex.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong reading this document.";
    await db.from("extractions").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", ex.id);
  }
}
