import { after, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { readAddedDocuments } from "@/lib/extract/run";

export const runtime = "nodejs";
export const maxDuration = 300;

// Documents were added to a deal. Works in every state (see readAddedDocuments).
// Access is checked with the user's own session (RLS) before anything runs.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { documentIds } = (await req.json().catch(() => ({}))) as { documentIds?: string[] };
  const supabase = await supabaseServer();
  const { data: tx } = await supabase.from("transactions").select("id, status").eq("id", id).maybeSingle();
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tx.status === "closed" || tx.status === "cancelled") return NextResponse.json({ ok: true, skipped: tx.status });

  const { data: docs } = await supabase.from("documents").select("id").eq("transaction_id", id).in("id", documentIds ?? []);
  const ids = (docs ?? []).map((d) => d.id);
  if (!ids.length) return NextResponse.json({ error: "No documents" }, { status: 400 });

  after(() => readAddedDocuments(id, ids).catch((e) => console.error("[reread]", e)));
  return NextResponse.json({ ok: true, status: tx.status }, { status: 202 });
}
