// Where a deal is in its life: a listing (signed listing agreement, no purchase contract yet)
// or under contract. Stored on transactions.stage. Pure, so it's tested.

export const STAGES = ["listing", "contract"] as const;
export type Stage = (typeof STAGES)[number];

/** Listing facts the listing agreement gives. Shown on listing deals; never used as contract terms. */
export type ListingFacts = {
  list_price: number | null;
  listing_start_date: string | null;
  listing_expiration_date: string | null;
  listing_mortgage_info: boolean | null;
};

export const EMPTY_LISTING: ListingFacts = { list_price: null, listing_start_date: null, listing_expiration_date: null, listing_mortgage_info: null };

export function listingFromTx(tx: Record<string, any>): ListingFacts {
  return {
    list_price: tx.list_price == null ? null : Number(tx.list_price),
    listing_start_date: tx.listing_start_date ?? null,
    listing_expiration_date: tx.listing_expiration_date ?? null,
    listing_mortgage_info: tx.listing_mortgage_info ?? null,
  };
}

type DocLike = { kind: string };

/** The packet holds a listing agreement and no purchase contract. */
export function isListingPacket(documents: DocLike[]): boolean {
  return documents.some((d) => d.kind === "listing_agreement") && !documents.some((d) => d.kind === "contract");
}

/**
 * The stage a deal should be in after a confirm.
 * - A contract deal never goes back to listing.
 * - A listing deal moves to contract only when an executed purchase contract is part of what's confirmed.
 * - A brand-new deal (first confirm) is a listing when its packet is a listing agreement with no contract.
 */
export function nextStage(opts: { current: Stage | null; firstConfirm: boolean; documents: DocLike[] }): Stage {
  const { current, firstConfirm, documents } = opts;
  const hasContract = documents.some((d) => d.kind === "contract");
  if (firstConfirm) return isListingPacket(documents) ? "listing" : "contract";
  if (current === "listing") return hasContract ? "contract" : "listing";
  return "contract";
}
