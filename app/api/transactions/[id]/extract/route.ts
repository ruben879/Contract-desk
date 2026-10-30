import { after, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runExtraction } from "@/lib/extract/run";

export const runtime = "nodejs";
export const maxDuration = 300;

// Starts (or retries) reading the contract. Access is checked with the user's own session (RLS).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: tx } = await supabase.from("transactions").select("id, status").eq("id", id).maybeSingle();
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["reading", "failed"].includes(tx.status)) return NextResponse.json({ ok: true, status: tx.status });

  if (tx.status === "failed") await supabaseAdmin().from("transactions").update({ status: "reading" }).eq("id", id);
  after(() => runExtraction(id));
  return NextResponse.json({ ok: true, status: "reading" }, { status: 202 });
}
