import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A deal's documents with short-lived signed URLs, in the order a read sent them
 * (so "Doc 2, p. 3" from the reader points at the right file). Others follow by upload time.
 */
export async function orderedDocs(supabase: SupabaseClient, transactionId: string, order: string[] = []) {
  const { data } = await supabase.from("documents")
    .select("id, file_name, storage_path, page_count, is_scanned, kind, slot, slot_source, created_at")
    .eq("transaction_id", transactionId).order("created_at");
  const all = data ?? [];
  const first = order.map((id) => all.find((d) => d.id === id)).filter((d): d is (typeof all)[number] => !!d);
  const rest = all.filter((d) => !order.includes(d.id));
  return Promise.all([...first, ...rest].map(async (d) => {
    const { data: s } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 3600);
    return { ...d, url: s?.signedUrl };
  }));
}
