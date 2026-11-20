import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui";
import { OfferTermsEditor } from "@/components/OfferTermsEditor";
import { loadLibrary, loadOffer, loadOfferDefaults } from "@/lib/offer/server";
import { miniFieldTerms, usableForms } from "@/lib/forms/library";
import { OFFER_STATUS_LABEL as STATUS_LABEL, addressLine } from "@/lib/offer/terms";
import { PacketDownload } from "@/components/OfferPackets";
import { OfferFill } from "@/components/OfferFill";
import { FillNote } from "@/components/FillNote";
import { DuplicateOffer } from "@/components/DuplicateOffer";
import { compareStreet } from "@/lib/match";
import { money } from "@/components/ui";


export default async function OfferTermsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, brokerage } = await requireMember();
  const offer = await loadOffer(supabase, id);
  if (!offer) notFound();

  const [library, { data: titleContacts }, defaults, { data: packets }, { data: openOffers }] = await Promise.all([
    loadLibrary(supabase),
    supabase.from("contacts").select("full_name").eq("type", "title_company").order("full_name").limit(50),
    loadOfferDefaults(supabase, brokerage.id),
    supabase.from("offer_packets").select("id, version, file_name, exported_at").eq("offer_id", id).order("version", { ascending: false }),
    supabase.from("offers").select("id, status, terms, created_at").neq("status", "executed").neq("id", id).limit(200),
  ]);
  // Another open offer on the same address is shown, never merged: two buyers can make offers on one house.
  const twins = offer.status === "executed" ? [] : (openOffers ?? [])
    .filter((o) => compareStreet((o.terms as any)?.property_street, offer.terms.property_street) === "match")
    .map((o) => ({ id: o.id, line: [STATUS_LABEL[o.status], (o.terms as any)?.sales_price != null ? money((o.terms as any).sales_price) : null,
      ((o.terms as any)?.buyers ?? []).filter(Boolean).join(", ") || null].filter(Boolean).join(" · ") }));
  const forms = usableForms(library);
  const titleCompanies = [...new Set([defaults.titleCompany, ...(titleContacts ?? []).map((c) => c.full_name)].filter(Boolean) as string[])];
  const miniTerms = Object.fromEntries(forms.map((f) => [f.id, miniFieldTerms([f.current!.field_map])]));

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url}>
      <Link href="/deals" className="text-[15px] text-brand">Deals</Link>
      <div className="mb-4 mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">{offer.terms.property_street ? addressLine(offer.terms) : "New offer"}</h1>
        <Badge tone={offer.status === "executed" ? "good" : offer.status === "out_for_signature" ? "brand" : "neutral"}>{STATUS_LABEL[offer.status]}</Badge>
      </div>
      {twins.length > 0 && <DuplicateOffer offerId={id} isDraft={offer.status === "draft_offer"} others={twins} />}
      {offer.status === "out_for_signature" && offer.edited_since_export && (
        <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-[15px] font-medium text-warn">Changed since the last export. Export again to get a new version; the earlier one stays as it was.</p>
      )}
      {!!packets?.length && (
        <section className="mb-4 rounded-card bg-card p-[18px] shadow-card">
          <h2 className="mb-2 text-[17px] font-semibold">Exported packets</h2>
          <ul className="flex flex-col gap-1">
            {packets.map((p) => <li key={p.id}><PacketDownload packetId={p.id} version={p.version} fileName={p.file_name} exportedAt={p.exported_at} timezone={brokerage.timezone} /></li>)}
          </ul>
        </section>
      )}
      {offer.status === "draft_offer" && <div className="mb-3"><OfferFill offerId={id} compact /></div>}
      {offer.terms.imported && <FillNote note={offer.terms.imported} />}
      <OfferTermsEditor key={offer.terms.imported?.at ?? "typed"} id={id} initial={offer.terms} titleCompanies={titleCompanies}
        forms={forms.map((f) => ({ id: f.id, name: f.display_name, formClass: f.form_class }))} miniTerms={miniTerms}
        locked={offer.status === "executed"} defaults={defaults.computations} defaultTitleCompany={defaults.titleCompany} />
    </AppShell>
  );
}
