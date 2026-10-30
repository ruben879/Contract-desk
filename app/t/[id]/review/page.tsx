import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { SourceLayout } from "@/components/SourceViewer";
import { ExtractionSchema, type Extraction } from "@/lib/extract/schema";
import { orderedDocs } from "@/lib/docs";
import { ReviewForm, type ContactDraft, type FieldMeta } from "./ReviewForm";
import type { DeadlineRule } from "@/lib/deadlines/compute";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Which side are we on? License numbers first (from the brokerage profile), firm name as a fallback. */
function suggestSide(ex: Extraction | null, b: { name: string; license_number: string | null }) {
  if (!ex) return null;
  const lic = norm(b.license_number);
  const name = norm(b.name).slice(0, 10);
  const ours = (firm: string | null, license: string | null) =>
    (!!lic && norm(license) === lic) || (!!name && norm(firm).includes(name));
  const listing = ours(ex.listing_broker_firm.value, ex.listing_broker_license.value);
  const buyer = ours(ex.buyer_broker_firm.value, ex.buyer_broker_license.value);
  return listing && buyer ? "both" : listing ? "seller" : buyer ? "buyer" : null;
}

function contactsFromExtraction(ex: Extraction, ourAgentLicenses: Set<string>): ContactDraft[] {
  const rows: ContactDraft[] = [];
  for (const n of ex.buyers.value ?? []) rows.push({ role: "buyer", full_name: n, company: "", email: "", phone: "" });
  for (const n of ex.sellers.value ?? []) rows.push({ role: "seller", full_name: n, company: "", email: "", phone: "" });
  // Our own agents live in their profile, not in Contacts. Only add the other side's agent.
  const isOurs = (lic: string | null) => !!lic && ourAgentLicenses.has(norm(lic));
  if (ex.listing_agent_name.value && !isOurs(ex.listing_agent_license.value))
    rows.push({ role: "listing_agent", full_name: ex.listing_agent_name.value, company: ex.listing_broker_firm.value ?? "", email: ex.listing_agent_email.value ?? "", phone: ex.listing_agent_phone.value ?? "" });
  if (ex.buyer_agent_name.value && !isOurs(ex.buyer_agent_license.value))
    rows.push({ role: "buyer_agent", full_name: ex.buyer_agent_name.value, company: ex.buyer_broker_firm.value ?? "", email: ex.buyer_agent_email.value ?? "", phone: ex.buyer_agent_phone.value ?? "" });
  if (ex.title_company.value) rows.push({ role: "title_company", full_name: ex.escrow_officer.value || ex.title_company.value, company: ex.title_company.value, email: "", phone: "" });
  if (ex.lender_name.value) rows.push({ role: "lender", full_name: ex.lender_name.value, company: ex.lender_name.value, email: "", phone: "" });
  return rows;
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();

  const { data: tx } = await supabase.from("transactions").select("*").eq("id", id).maybeSingle();
  if (!tx) notFound();
  if (tx.status === "reading" || tx.status === "failed") redirect(`/t/${id}`);

  const [{ data: exRow }, { data: links }, { data: team }, { data: rules }, { data: deadlines }] = await Promise.all([
    supabase.from("extractions").select("result, status, document_ids").eq("transaction_id", id).eq("kind", "initial")
      .in("status", ["ready", "confirmed"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("transaction_contacts").select("role, contacts(full_name, company, email, phone)").eq("transaction_id", id),
    supabase.from("brokerage_members").select("id, full_name, email, role, license_number").eq("brokerage_id", brokerage.id).eq("active", true).order("full_name"),
    supabase.from("deadline_rules").select("*").eq("brokerage_id", brokerage.id),
    supabase.from("deadlines").select("key, label, due_date, due_time").eq("transaction_id", id),
  ]);

  const ex = exRow?.result ? ExtractionSchema.parse(exRow.result) : null;
  const confirmed = !!tx.confirmed_at;
  const docs = await orderedDocs(supabase, id, exRow?.document_ids ?? []);

  // Suggest the agent from license numbers on the broker information page.
  const licenses = new Set((team ?? []).map((m) => norm(m.license_number)).filter(Boolean));
  const side = tx.side ?? suggestSide(ex, brokerage);
  let agentId = tx.agent_member_id as string | null;
  let agentHint: string | null = null;
  if (!confirmed && ex) {
    const want = side === "seller" ? [ex.listing_agent_license.value] : side === "buyer" ? [ex.buyer_agent_license.value] : [ex.listing_agent_license.value, ex.buyer_agent_license.value];
    const match = (team ?? []).find((m) => m.license_number && want.some((w) => norm(w) === norm(m.license_number)));
    if (match && !agentId) { agentId = match.id; }
    if (match) agentHint = `Matched ${match.full_name || match.email} by license number on the contract.`;
  }

  const pick = <K extends keyof Extraction>(k: K, txVal: unknown) => (confirmed ? txVal : (ex?.[k] as { value: unknown } | undefined)?.value);
  const values: Record<string, unknown> = {
    contract_form: pick("contract_form", tx.contract_form),
    property_street: pick("property_street", tx.property_street),
    property_city: pick("property_city", tx.property_city),
    property_state: pick("property_state", tx.property_state) ?? "TX",
    property_zip: pick("property_zip", tx.property_zip),
    property_county: pick("property_county", tx.property_county),
    legal_description: pick("legal_description", tx.legal_description),
    sales_price: pick("sales_price", tx.sales_price),
    financed_amount: pick("financed_amount", tx.financed_amount),
    financing_type: pick("financing_type", tx.financing_type),
    effective_date: pick("effective_date", tx.effective_date),
    closing_date: pick("closing_date", tx.closing_date),
    earnest_money: pick("earnest_money", tx.earnest_money),
    option_fee: pick("option_fee", tx.option_fee),
    option_period_days: pick("option_period_days", tx.option_period_days),
    survey_days: pick("survey_days", tx.survey_days),
    seller_disclosure: pick("seller_disclosure", tx.seller_disclosure) ?? "unknown",
    side, agent_member_id: agentId,
  };

  const meta: Record<string, FieldMeta> = {};
  if (ex) for (const [k, f] of Object.entries(ex)) {
    if (f && typeof f === "object" && "confidence" in f) {
      const x = f as Extraction["sales_price"];
      meta[k] = { confidence: x.confidence, found: x.value != null, value: x.value, doc: x.doc, page: x.page, quote: x.quote, box: x.box, source: x.source };
    }
  }

  const contacts: ContactDraft[] = confirmed
    ? (links ?? []).map((l: any) => ({ role: l.role, full_name: l.contacts.full_name, company: l.contacts.company ?? "", email: l.contacts.email ?? "", phone: l.contacts.phone ?? "" }))
    : ex ? contactsFromExtraction(ex, licenses) : [];

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings={isBrokerOrStaff} wide>
      <SourceLayout docs={docs.map((d) => ({ name: d.file_name, url: d.url, scanned: !!d.is_scanned }))}>
        <ReviewForm
          id={id}
          confirmed={confirmed}
          values={values}
          meta={meta}
          extractedAddenda={ex?.addenda ?? []}
          selectedAddenda={confirmed ? (tx.addenda as string[]) : (ex?.addenda ?? []).filter((a) => a.evidence === "attached").map((a) => a.key)}
          contacts={contacts}
          warnings={confirmed ? [] : ex?.warnings ?? []}
          docCount={docs.length}
          hasScan={docs.some((d) => d.is_scanned)}
          team={isBrokerOrStaff ? team ?? [] : null}
          agentHint={agentHint}
          rules={(rules ?? []) as DeadlineRule[]}
          currentDeadlines={confirmed ? deadlines ?? [] : null}
        />
      </SourceLayout>
    </AppShell>
  );
}
