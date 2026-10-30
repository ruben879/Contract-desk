import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// If a background read is cut off (deploy, crash, timeout), nothing would ever move it out
// of "reading". Anything stuck past this limit is marked failed so a person can retry or sort it.
const STALE_MINUTES = 10;

export async function expireStaleReads(brokerageId: string) {
  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const note = "This read didn't finish (it was cut off). Try again.";

  const { data: stuck } = await db.from("extractions").update({ status: "failed", error: note, finished_at: new Date().toISOString() })
    .eq("brokerage_id", brokerageId).eq("status", "running").lt("started_at", cutoff).select("transaction_id, kind");
  for (const s of stuck ?? []) {
    if (s.kind === "initial") await db.from("transactions").update({ status: "failed" }).eq("id", s.transaction_id).eq("status", "reading");
  }
  // A deal stuck in "reading" with no extraction row at all (cut off before it started).
  await db.from("transactions").update({ status: "failed" })
    .eq("brokerage_id", brokerageId).eq("status", "reading").lt("updated_at", cutoff);
  await db.from("intake_items").update({ status: "needs_sorting", reason: "Couldn't finish reading this email automatically. Look it over and choose where it goes." })
    .eq("brokerage_id", brokerageId).eq("status", "reading").lt("created_at", cutoff);
}
