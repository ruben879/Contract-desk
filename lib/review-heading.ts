import { compareStreet } from "@/lib/match";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// The heading on a change review says what the read FOUND, never a generic script
// (Nov 18: the Ayala contract's review said "confirm it belongs on this deal" while its own
// analysis said it was for 2312 145th St). Pure, so it's tested.

type Seen = { doc: number; property_street: string | null; parties: string[]; price: number | null };
type Kept = { file_name: string; property_street: string | null; parties: string[]; price: number | null };

export function reviewHeading(input: {
  docNames: string[];
  dealStreet: string | null;
  seen: Seen[];
  kept?: Kept[];
  promotes: boolean;
  nothing: boolean;     // no term, addendum, or removal proposed
}): { title: string; body: string; tone: "warn" | "bad" | "plain" } {
  const from = `From ${input.docNames.join(", ")}.`;
  const kept = input.kept ?? [];
  if (kept.length) {
    const k = kept[0];
    const what = [k.property_street && `for ${k.property_street}`, k.parties.length ? k.parties.join(", ") : null, k.price ? money(k.price) : null].filter(Boolean).join(", ");
    return {
      title: "You kept a document that doesn't match this deal",
      body: `${k.file_name} is ${what || "for a different property"}. You chose to keep it on this deal. ${input.nothing
        ? "We found nothing in it that changes this deal."
        : "Confirm only the changes that really apply here; uncheck the rest."}`,
      tone: "bad",
    };
  }
  const other = input.seen.find((s) => compareStreet(s.property_street, input.dealStreet) === "differ");
  if (other) {
    const name = input.docNames[other.doc - 1] ?? "This document";
    return {
      title: "This document names a different address",
      body: `${name} is for ${other.property_street}, and this deal is ${input.dealStreet ?? "a different property"}. Check that it belongs here before you confirm anything.`,
      tone: "bad",
    };
  }
  if (input.promotes) {
    return { title: "Confirm the contract", tone: "plain",
      body: `${from} This is the executed contract for this listing. Confirming moves the deal from Listing to Under contract and builds the contract checklist and dates. The listing tasks stay.` };
  }
  if (input.nothing) {
    return { title: "Nothing changes on this deal", tone: "plain",
      body: `${from} We read it and found no change to price, dates, or terms.` };
  }
  return { title: "Confirm what changed", tone: "plain", body: `${from} Nothing changes on the deal until you confirm.` };
}
