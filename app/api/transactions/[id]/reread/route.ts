import { after, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAmendmentRead } from "@/lib/extract/run";

export const runtime = "nodejs";
export const maxDuration = 300;

// Re-read newly added documents on a confirmed deal. Access is checked with the user's session (RLS).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { documentIds } = (await req.json().catch(() => ({}))) as { documentIds?: string[] };
  const supabase = await supabaseServer();
  const { data: tx } = await supabase.from("transactions").select("id, status").eq("id", id).maybeSingle();
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tx.status !== "active") return NextResponse.json({ ok: true, skipped: "not_active" });

  const { data: docs } = await supabase.from("documents").select("id").eq("transaction_id", id).in("id", documentIds ?? []);
  const ids = (docs ?? []).map((d) => d.id);
  if (!ids.length) return NextResponse.json({ error: "No documents" }, { status: 400 });

  const { data: running } = await supabaseAdmin().from("extractions").select("id")
    .eq("transaction_id", id).eq("kind", "amendment").eq("status", "running").maybeSingle();
  if (running) return NextResponse.json({ error: "Still reading the last document. Try again in a minute." }, { status: 409 });

  after(() => runAmendmentRead(id, ids).catch(() => {}));
  return NextResponse.json({ ok: true }, { status: 202 });
}
