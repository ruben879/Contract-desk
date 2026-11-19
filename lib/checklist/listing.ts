import type { DealContext } from "@/lib/rules";

// The listing-stage checklist: the work between a signed listing agreement and a contract.
// One plain list. To change it, edit the rows below. Keys must stay stable once deals use them;
// they all start with "listing_", which is how a promoted deal knows to keep them.

export type ListingTask = {
  key: `listing_${string}`;
  title: string;
  startsDone?: boolean;                     // the intake itself completes it
  when?: (c: DealContext) => boolean;       // omit = every listing
  reason?: string;                          // shown on triggered tasks
};

export const LISTING_TASKS: ListingTask[] = [
  { key: "listing_agreement", title: "Listing agreement in the file", startsDone: true },
  { key: "listing_sellers_disclosure", title: "Seller's Disclosure Notice obtained and in the file" },
  { key: "listing_mortgage_info", title: "Request for Mortgage Information in the file",
    when: (c) => c.listing_mortgage_info === true, reason: "The listing agreement asks for it" },
  { key: "listing_photos", title: "Photos received" },
  { key: "listing_mls", title: "MLS listing entered and proofed" },
  { key: "listing_sign", title: "Sign installed" },
  { key: "listing_lockbox", title: "Lockbox placed" },
  { key: "listing_showings", title: "Showing instructions set" },
];

export const isListingTask = (ruleKey: string) => ruleKey.startsWith("listing_");
