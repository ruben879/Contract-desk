"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadOffer, startingTerms, uploadedForRender } from "@/lib/offer/server";
import { enforceRules, exportBlockers, normalizeTerms, packetFileName, type OfferTerms } from "@/lib/offer/terms";
import { renderPacket } from "@/lib/offer/render";

/** "New offer" from Deals (blank) or from a contact (that contact as the buyer). */
export async function createOffer(fd: FormData) {
  const { supabase, user, member, brokerage } = await requireMember();
  const buyer = String(fd.get("buyer_contact_id") ?? "") || null;
  const terms = await startingTerms(supabase, member, brokerage, buyer);
  const { data, error } = await supabase.from("offers")
    .insert({ brokerage_id: brokerage.id, agent_member_id: member.id, terms, created_by: user.id }).select("id").single();
  if (error || !data) throw new Error("Couldn't start the offer. Try again.");
  redirect(`/o/${data.id}`);
}

/** Autosave from the Terms screen. The effective date is never accepted (it isn't a Term). */
export async function saveTerms(id: string, raw: unknown): Promise<{ ok: true } | { error: string }> {
  const { supabase } = await requireMember();
  const offer = await loadOffer(supabase, id);
  if (!offer) return { error: "Offer not found." };
  if (offer.status === "executed") return { error: "This offer was executed; its terms are now the signed contract's." };
  const terms = enforceRules(normalizeTerms(raw));
  const { error } = await supabase.from("offers").update({
    terms, updated_at: new Date().toISOString(),
    ...(offer.status === "out_for_signature" ? { edited_since_export: true } : {}),
  }).eq("id", id);
  return error ? { error: "Couldn't save. Check your connection." } : { ok: true };
}

/** Typed buyer names become contacts when the agent moves on to Preview (not on every keystroke). */
async function saveTypedBuyers(id: string) {
  const { supabase, user, brokerage } = await requireMember();
  const offer = await loadOffer(supabase, id);
  if (!offer) return;
  const t = offer.terms;
  const { data: linked } = t.buyer_contact_ids.length
    ? await supabase.from("contacts").select("id, full_name").in("id", t.buyer_contact_ids) : { data: [] };
  const known = new Set((linked ?? []).map((c) => c.full_name.trim().toLowerCase()));
  const ids = [...t.buyer_contact_ids];
  for (const name of t.buyers.map((b) => b.trim()).filter(Boolean)) {
    if (known.has(name.toLowerCase())) continue;
    const { data: existing } = await supabase.from("contacts").select("id").eq("type", "buyer").ilike("full_name", name).limit(1).maybeSingle();
    const contactId = existing?.id ?? (await supabase.from("contacts").insert({ brokerage_id: brokerage.id, type: "buyer", full_name: name, created_by: user.id }).select("id").single()).data?.id;
    if (contactId) ids.push(contactId);
  }
  if (ids.length !== t.buyer_contact_ids.length) await supabase.from("offers").update({ terms: { ...t, buyer_contact_ids: ids } }).eq("id", id);
}

export async function goToPreview(id: string) {
  await saveTypedBuyers(id);
  redirect(`/o/${id}/preview`);
}

export async function setBlankIntentional(id: string, blankId: string, intentional: boolean) {
  const { supabase } = await requireMember();
  const offer = await loadOffer(supabase, id);
  if (!offer) return;
  const set = new Set(offer.terms.intentional_blanks);
  if (intentional) set.add(blankId); else set.delete(blankId);
  await supabase.from("offers").update({ terms: { ...offer.terms, intentional_blanks: [...set] } }).eq("id", id);
  revalidatePath(`/o/${id}/preview`);
}

/**
 * Export: render the Packet, store it as the next version (never overwriting an earlier one),
 * mark the offer out for signature. Nothing is sent anywhere: the agent gets the file.
 */
export async function exportPacket(id: string): Promise<{ url: string; fileName: string; version: number } | { error: string }> {
  const { supabase, user } = await requireMember();
  const offer = await loadOffer(supabase, id);
  if (!offer) return { error: "Offer not found." };
  const blockers = exportBlockers(offer.terms);
  if (blockers.length) return { error: `Add these first: ${blockers.join(", ")}.` };

  const uploaded = await uploadedForRender(supabase, offer);
  const { bytes, parts } = await renderPacket(offer.terms, uploaded);
  const admin = supabaseAdmin();
  const { data: last } = await admin.from("offer_packets").select("version").eq("offer_id", id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const fileName = packetFileName(offer.terms, version);
  const path = `${offer.brokerage_id}/${id}/v${version}.pdf`;
  const up = await admin.storage.from("offer-packets").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) return { error: "Couldn't save the packet. Try again." };
  const { error } = await admin.from("offer_packets").insert({
    brokerage_id: offer.brokerage_id, offer_id: id, version, storage_path: path, file_name: fileName,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    forms: parts, terms_snapshot: offer.terms as OfferTerms, exported_by: user.id,
  });
  if (error) { await admin.storage.from("offer-packets").remove([path]); return { error: "Couldn't save the packet. Try again." }; }
  await supabase.from("offers").update({
    status: offer.status === "executed" ? "executed" : "out_for_signature",
    last_exported_at: new Date().toISOString(), edited_since_export: false,
  }).eq("id", id);
  const { data: signed } = await admin.storage.from("offer-packets").createSignedUrl(path, 600, { download: fileName });
  revalidatePath(`/o/${id}`);
  return { url: signed!.signedUrl, fileName, version };
}

/** A short-lived link to an earlier packet, exactly as it was exported. */
export async function packetLink(packetId: string): Promise<{ url: string } | { error: string }> {
  const { supabase } = await requireMember();
  const { data: p } = await supabase.from("offer_packets").select("storage_path, file_name").eq("id", packetId).maybeSingle();
  if (!p) return { error: "Packet not found." };
  const { data } = await supabase.storage.from("offer-packets").createSignedUrl(p.storage_path, 600, { download: p.file_name });
  return data ? { url: data.signedUrl } : { error: "Couldn't open the packet." };
}
