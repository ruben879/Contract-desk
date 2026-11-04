import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { BlanksLeft, ExportButton, PacketPages } from "@/components/PacketPreview";
import { loadOffer, uploadedForRender } from "@/lib/offer/server";
import { renderPacket } from "@/lib/offer/render";
import { exportBlockers } from "@/lib/offer/terms";

// Screen 2: the packet as it will export, what's still blank, and one action.
export default async function OfferPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, brokerage } = await requireMember();
  const offer = await loadOffer(supabase, id);
  if (!offer) notFound();
  const { parts, blanks } = await renderPacket(offer.terms, await uploadedForRender(supabase, offer));
  const intentional = new Set(offer.terms.intentional_blanks);
  const rows = blanks.map((b) => ({ ...b, intentional: intentional.has(b.id) }))
    .sort((a, b) => Number(a.intentional) - Number(b.intentional));
  const blocked = exportBlockers(offer.terms);
  const { count } = await supabase.from("offer_packets").select("id", { count: "exact", head: true }).eq("offer_id", id);

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url}>
      <Link href={`/o/${id}`} className="text-[15px] text-brand">Back to terms</Link>
      <h1 className="mb-1 mt-1 text-[26px] font-semibold leading-tight tracking-[-0.01em]">Preview</h1>
      <p className="mb-4 text-[15px] text-muted">{parts.map((p) => p.kind === "bundled" ? p.title.replace(/^TREC /, "") : p.title).join(" · ")}</p>

      <div className="mb-4"><ExportButton offerId={id} blocked={blocked} reExport={!!count} /></div>

      <section className="mb-4 rounded-card bg-card p-[18px] shadow-card">
        <h2 className="mb-1 text-[17px] font-semibold">Blanks left</h2>
        <p className="mb-2 text-[14px] text-muted">Mark each one Intentional, or go back and fill it.</p>
        <BlanksLeft offerId={id} blanks={rows} />
      </section>

      <PacketPages src={`/api/offers/${id}/preview?v=${encodeURIComponent(JSON.stringify(offer.terms).length + ":" + Date.now())}`} />
      <p className="pb-6 text-[13.5px] text-muted">Contract Desk doesn't send this anywhere. You choose where it goes.</p>
    </AppShell>
  );
}
