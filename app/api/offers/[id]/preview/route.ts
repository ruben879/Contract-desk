import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { loadOffer, uploadedForRender } from "@/lib/offer/server";
import { renderPacket } from "@/lib/offer/render";

export const runtime = "nodejs";
export const maxDuration = 60;

// The Packet as it would export right now. Read-only; nothing is stored.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const offer = await loadOffer(supabase, id);
  if (!offer) return new NextResponse("Not found", { status: 404 });
  const { bytes } = await renderPacket(offer.terms, await uploadedForRender(supabase, offer));
  return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "cache-control": "no-store" } });
}
