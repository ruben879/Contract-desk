import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Brokerage, Member } from "@/lib/context";
import { applyBrokerageDefaults, emptyTerms, enforceRules, normalizeDefaults, normalizeTerms, type OfferDefaults, type OfferTerms } from "./terms";
import type { UploadedFormForRender } from "./render";
import type { FieldMap } from "@/lib/forms/library";
import type { P22Slot } from "@/lib/forms/registry";

/**
 * The brokerage's offer settings. Tolerant of migrations not yet run: anything missing falls back to
 * the standard values (Clear Rock's), so the computations always work.
 */
export async function loadOfferDefaults(supabase: SupabaseClient, brokerageId: string) {
  const { data: base } = await supabase.from("brokerages").select("default_title_company, default_buyer_comp_type, default_buyer_comp_value").eq("id", brokerageId).maybeSingle();
  const { data: extra } = await supabase.from("brokerages").select("offer_defaults").eq("id", brokerageId).maybeSingle();
  return {
    titleCompany: (base?.default_title_company as string | null) ?? null,
    compType: (base?.default_buyer_comp_type as OfferTerms["buyer_broker_comp_type"]) ?? null,
    compValue: base?.default_buyer_comp_value == null ? null : Number(base.default_buyer_comp_value),
    computations: normalizeDefaults((extra as { offer_defaults?: unknown } | null)?.offer_defaults) as OfferDefaults,
  };
}

/** Computed and standard values into every Term the agent hasn't edited by hand. */
export async function withBrokerageDefaults(supabase: SupabaseClient, brokerageId: string, t: OfferTerms) {
  const d = await loadOfferDefaults(supabase, brokerageId);
  return enforceRules(applyBrokerageDefaults(t, d.computations, d.titleCompany));
}

/** A new offer's Terms, starting from the profiles and (optionally) a buyer contact. Nothing invented. */
export async function startingTerms(supabase: SupabaseClient, member: Member, brokerage: Brokerage, buyerContactId?: string | null): Promise<OfferTerms> {
  const t = emptyTerms();
  const d = await loadOfferDefaults(supabase, brokerage.id);
  const office = [brokerage.address_street, [brokerage.address_city, [brokerage.address_state ?? "TX", brokerage.address_zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  Object.assign(t, {
    buyer_broker_firm: brokerage.name, buyer_broker_license: brokerage.license_number, buyer_broker_address: office || null,
    buyer_agent_name: member.full_name, buyer_agent_license: member.license_number, buyer_agent_email: member.email, buyer_agent_phone: member.phone,
    buyer_supervisor_name: brokerage.broker_name, buyer_supervisor_license: brokerage.broker_license_number,
    buyer_broker_comp_type: d.compType, buyer_broker_comp_value: d.compValue,
  });
  if (buyerContactId) {
    const { data: c } = await supabase.from("contacts").select("id, full_name, email, phone").eq("id", buyerContactId).maybeSingle();
    if (c) Object.assign(t, { buyers: [c.full_name], buyer_contact_ids: [c.id], buyer_notice_email: c.email, buyer_notice_phone: c.phone });
  }
  return enforceRules(applyBrokerageDefaults(t, d.computations, d.titleCompany));
}

export async function loadOffer(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("offers").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  // Until execution, the brokerage computations apply on every read, so Preview and Export always
  // carry them (including offers saved before a computation existed). Executed offers stay as written.
  const terms = data.status === "executed" ? normalizeTerms(data.terms) : await withBrokerageDefaults(supabase, data.brokerage_id, normalizeTerms(data.terms));
  return { ...data, terms } as { id: string; brokerage_id: string; agent_member_id: string | null; status: string; terms: OfferTerms; last_exported_at: string | null; edited_since_export: boolean; executed_transaction_id: string | null };
}

export type LibraryFormRow = {
  id: string; display_name: string; form_class: "TREC" | "TXR" | "Brokerage"; p22_slot: P22Slot | null; archived: boolean;
  current: { id: string; version: number; storage_path: string; fields: { name: string; type: string }[]; field_map: FieldMap; mapping_complete: boolean } | null;
};

/** This brokerage's library (RLS keeps it to the signed-in member's brokerage). */
export async function loadLibrary(supabase: SupabaseClient): Promise<LibraryFormRow[]> {
  const { data } = await supabase.from("library_forms")
    .select("id, display_name, form_class, p22_slot, archived, current:library_form_versions!library_forms_current_fk(id, version, storage_path, fields, field_map, mapping_complete)")
    .order("display_name");
  return (data ?? []) as unknown as LibraryFormRow[];
}

/**
 * Uploaded forms picked in this offer, ready to render. Only mapping-complete forms of the offer's
 * own brokerage: checked here against the offer, not just hidden in the screen.
 */
export async function uploadedForRender(supabase: SupabaseClient, offer: { brokerage_id: string; terms: OfferTerms }): Promise<UploadedFormForRender[]> {
  if (!offer.terms.uploaded_forms.length) return [];
  const lib = await loadLibrary(supabase);
  const out: UploadedFormForRender[] = [];
  for (const id of offer.terms.uploaded_forms) {
    const f = lib.find((x) => x.id === id);
    if (!f || f.archived || !f.current?.mapping_complete) continue;
    const { data: v } = await supabase.from("library_form_versions").select("brokerage_id").eq("id", f.current.id).single();
    if (v?.brokerage_id !== offer.brokerage_id) continue;
    const { data: blob } = await supabaseAdmin().storage.from("library-forms").download(f.current.storage_path);
    if (!blob) continue;
    out.push({
      formId: f.id, versionId: f.current.id, displayName: f.display_name, p22Slot: f.p22_slot,
      bytes: new Uint8Array(await blob.arrayBuffer()), fieldMap: f.current.field_map,
      fieldTypes: Object.fromEntries(f.current.fields.map((x) => [x.name, x.type])),
    });
  }
  return out;
}

/**
 * Return match for an executed contract: the one open Offer file whose address matches AND that
 * shares at least one buyer last name. Read-only; the caller decides what to do with it.
 * Tolerates the offers table not existing yet (before migration 0009): no match.
 */
export async function matchOpenOffer(supabase: SupabaseClient, ex: import("./match").ExtractedForMatch) {
  const { findOfferMatch } = await import("./match");
  const { data, error } = await supabase.from("offers").select("id, brokerage_id, status, terms").neq("status", "executed").is("executed_transaction_id", null);
  if (error || !data) return null;
  const offers = data.map((o) => ({ ...o, terms: normalizeTerms(o.terms) }));
  return findOfferMatch(offers, ex);
}
