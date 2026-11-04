import { NextResponse } from "next/server";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { inspectPdf } from "@/lib/extract/pdf";
import { factsToImport, readOfferFacts } from "@/lib/extract/read-facts";
import { friendlyReadError } from "@/lib/extract/errors";
import { applyRenImport, ImportRefused } from "@/lib/offer/ren-import";
import { draftToFill, saveFilledTerms } from "@/lib/offer/fill";

export const runtime = "nodejs";
export const maxDuration = 300;

// "Fill from a document": read one uploaded PDF for offer facts and place them, blanks only.
// The PDF is read and then removed; the offer keeps only its file name as provenance.
export async function POST(req: Request) {
  const { brokerage } = await requireMember();
  const body = (await req.json().catch(() => null)) as { offerId?: string | null; path?: string; fileName?: string } | null;
  const path = body?.path ?? "";
  if (!path.startsWith(`${brokerage.id}/offer-sources/`)) return NextResponse.json({ error: "Upload not found." }, { status: 400 });
  const admin = supabaseAdmin();
  try {
    const { data: blob } = await admin.storage.from("documents").download(path);
    if (!blob) return NextResponse.json({ error: "Upload not found. Try again." }, { status: 400 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-")) return NextResponse.json({ error: "That file isn't a PDF." }, { status: 400 });
    const info = await inspectPdf(bytes).catch(() => null);
    const fileName = (body?.fileName || "document.pdf").slice(0, 200);
    const read = await readOfferFacts({ name: fileName, base64: Buffer.from(bytes).toString("base64"), isScanned: info?.isScanned ?? true });
    const { parsed, could_not_read, suggestions } = factsToImport(read);
    const { supabase, id, terms, brokerageId } = await draftToFill(body?.offerId ?? null);
    await saveFilledTerms(supabase, id, brokerageId, applyRenImport(terms, parsed, fileName, new Date(), { kind: "document", could_not_read, suggestions }));
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof ImportRefused) return NextResponse.json({ error: e.message }, { status: 400 });
    const { message, detail } = friendlyReadError(e);
    console.error("[offer fill] failed", { detail });
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await admin.storage.from("documents").remove([path]);
  }
}
