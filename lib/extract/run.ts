import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { termsFromTx } from "@/lib/terms";
import { inspectPdf } from "./pdf";
import { readChanges, readContract, type PdfInput } from "./read-contract";
import { friendlyReadError, ReaderError } from "./errors";

// The reader accepts requests up to 32 MB, and PDFs grow by a third when encoded, so ~22 MB of PDFs per read.
const MAX_TOTAL_BYTES = 22 * 1024 * 1024;
type Db = ReturnType<typeof supabaseAdmin>;

/** Download, inspect (scan or not), and base64 the documents, in the order given. */
export async function loadPdfs(db: Db, docs: { id: string; file_name: string; storage_path: string; size_bytes: number | null }[]) {
  const pdfs: PdfInput[] = [];
  let total = 0;
  for (const doc of docs) {
    // A document row is created just before its upload finishes, so give a fresh upload a moment.
    let { data: blob, error } = await db.storage.from("documents").download(doc.storage_path);
    for (let i = 0; (error || !blob) && i < 4; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      ({ data: blob, error } = await db.storage.from("documents").download(doc.storage_path));
    }
    if (error || !blob) throw new ReaderError(`Couldn't open ${doc.file_name}. If it was still uploading, try again.`, error?.message);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    total += bytes.byteLength;
    if (total > MAX_TOTAL_BYTES) throw new ReaderError("These documents are more than 22 MB together, too big to read at once. Split the packet into smaller PDFs and add them.");
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
export async function runExtraction(transactionId: string, depth = 0): Promise<void> {
  const db = supabaseAdmin();
  const { data: tx } = await db.from("transactions").select("id, brokerage_id, status").eq("id", transactionId).single();
  if (!tx || !["reading", "failed"].includes(tx.status)) return;

  // Only one read of the whole file at a time. A document added mid-read is picked up when it ends.
  const { data: running } = await db.from("extractions").select("id").eq("transaction_id", tx.id).eq("kind", "initial")
    .eq("status", "running").gt("started_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
  if (running?.length) return;
  await db.from("transactions").update({ status: "reading", updated_at: new Date().toISOString() }).eq("id", tx.id);

  const { data: docs } = await db.from("documents").select("id, file_name, storage_path, size_bytes").eq("transaction_id", tx.id).order("created_at");
  const ids = (docs ?? []).map((d) => d.id);
  const { data: ex } = await db.from("extractions")
    .insert({ brokerage_id: tx.brokerage_id, transaction_id: tx.id, kind: "initial", status: "running", document_ids: ids, started_at: new Date().toISOString() })
    .select("id").single();

  try {
    if (!docs?.length) throw new ReaderError("There are no documents on this deal yet. Add the contract.");
    const { extraction, model } = await readContract(await loadPdfs(db, docs));
    await labelDocuments(db, ids, extraction.documents);
    // An earlier draft read of fewer documents is replaced by this one.
    await db.from("extractions").update({ status: "dismissed", error: "Replaced by a read that includes added documents" })
      .eq("transaction_id", tx.id).eq("kind", "initial").eq("status", "ready");
    await db.from("extractions").update({ status: "ready", result: extraction, model, finished_at: new Date().toISOString() }).eq("id", ex!.id);
    await db.from("transactions").update({ status: "needs_review", updated_at: new Date().toISOString() }).eq("id", tx.id);
  } catch (e) {
    const { message, detail } = friendlyReadError(e);
    console.error("[read] failed", { transactionId, detail });
    await db.from("extractions").update({ status: "failed", error: message, result: { debug: detail }, finished_at: new Date().toISOString() }).eq("id", ex!.id);
    await db.from("transactions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", tx.id);
  }

  // Documents added while this read ran: read the whole file again so the draft includes them.
  const { data: now } = await db.from("documents").select("id").eq("transaction_id", tx.id);
  const added = (now ?? []).some((d) => !ids.includes(d.id));
  if (added && depth < 3) {
    await db.from("transactions").update({ status: "reading" }).eq("id", tx.id).in("status", ["needs_review", "failed"]);
    return runExtraction(tx.id, depth + 1);
  }
}

/**
 * Documents were added to a deal, by upload, email routing, sorting, or a merge. One rule for
 * every state, so a file never has to arrive in one batch:
 *   reading       -> the read in progress picks them up when it ends
 *   needs_review  -> read the whole file again; still a draft until the agent confirms
 *   failed        -> same, which also retries the read
 *   active        -> amendment re-read with a diff to confirm
 */
export async function readAddedDocuments(
  transactionId: string,
  documentIds: string[],
  opts: { source?: "upload" | "email"; intakeItemId?: string | null } = {},
) {
  const db = supabaseAdmin();
  const { data: tx } = await db.from("transactions").select("id, status").eq("id", transactionId).single();
  if (!tx || !documentIds.length) return;
  if (tx.status === "active") return runAmendmentRead(tx.id, documentIds, { ...opts, waitForRunning: true });
  if (tx.status === "needs_review" || tx.status === "failed") {
    await db.from("transactions").update({ status: "reading", updated_at: new Date().toISOString() }).eq("id", tx.id);
    return runExtraction(tx.id);
  }
  if (tx.status === "reading") return runExtraction(tx.id); // no-op if a read is running; it re-reads at the end
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
    if (!ordered.length) throw new ReaderError("The documents to check weren't found. Add them again.");

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
    const { message, detail } = friendlyReadError(e);
    console.error("[read] failed", { transactionId, detail });
    await db.from("extractions").update({ status: "failed", error: message, result: { debug: detail }, finished_at: new Date().toISOString() }).eq("id", ex.id);
  }
}
