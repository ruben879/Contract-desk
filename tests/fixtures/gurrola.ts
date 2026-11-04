import fs from "node:fs";
import { applyBrokerageDefaults, emptyTerms, enforceRules, STANDARD_OFFER_DEFAULTS as D, type OfferTerms } from "@/lib/offer/terms";

export const gurrolaFile = () => JSON.parse(fs.readFileSync("tests/fixtures/Offer_Import_2131_S_Loop_289.json", "utf8"));

/** A brand-new offer as startingTerms makes it: our side from profiles, brokerage computations applied. */
export function freshOffer(): OfferTerms {
  return enforceRules(applyBrokerageDefaults({
    ...emptyTerms(), buyer_broker_firm: "Clear Rock Realty", buyer_agent_name: "Ruben Trujillo", buyer_agent_email: "ruben@clearrockrealty.com",
    buyer_broker_comp_type: "percent", buyer_broker_comp_value: 2.5,
  }, D, "Brokerage Default Title"));
}
