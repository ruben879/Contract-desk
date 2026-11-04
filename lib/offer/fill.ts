import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireMember } from "@/lib/context";
import { loadOffer, startingTerms, withBrokerageDefaults } from "./server";
import { ImportRefused } from "./ren-import";
import type { OfferTerms } from "./terms";

/** The draft to fill: an existing draft offer, or a new one started now for the signed-in agent. */
export async function draftToFill(offerId: string | null) {
  const { supabase, member, brokerage, user } = await requireMember();
  if (!offerId) {
    const terms = await startingTerms(supabase, member, brokerage, null);
    const { data, error } = await supabase.from("offers")
      .insert({ brokerage_id: brokerage.id, agent_member_id: member.id, terms, created_by: user.id }).select("id").single();
    if (error || !data) throw new ImportRefused("Couldn't start the offer. Try again.");
    return { supabase, id: data.id as string, terms, brokerageId: brokerage.id };
  }
  const offer = await loadOffer(supabase, offerId);
  if (!offer) throw new ImportRefused("Offer not found.");
  if (offer.status !== "draft_offer") throw new ImportRefused("Only a draft offer can be filled this way. This one has already been exported.");
  return { supabase, id: offer.id, terms: offer.terms, brokerageId: offer.brokerage_id };
}

/** Save filled Terms; the brokerage computations apply to whatever still isn't hand-entered. */
export async function saveFilledTerms(supabase: SupabaseClient, id: string, brokerageId: string, terms: OfferTerms) {
  const final = await withBrokerageDefaults(supabase, brokerageId, terms);
  const { error } = await supabase.from("offers").update({ terms: final, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new ImportRefused("Couldn't save the filled terms. Try again.");
}
