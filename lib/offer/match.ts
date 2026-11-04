import { sameProperty } from "@/lib/address";
import { formatDate } from "@/lib/dates";
import { FINANCING_LABELS, type FinancingType } from "@/lib/addenda";
import { lastName, OFFER_FINANCING_LABELS, type OfferTerms } from "./terms";

// Return match: an executed contract arriving through intake is linked to the Offer file it came
// from when the property address matches AND at least one buyer last name matches. Then the
// confirm screen shows Written vs Signed for the terms that matter.

export type ExtractedForMatch = {
  property_street: string | null; property_city: string | null; property_zip: string | null;
  buyers: string[] | null;
  sales_price: number | null; earnest_money: number | null; option_fee: number | null; option_period_days: number | null;
  closing_date: string | null; financing_type: string | null; addenda: string[];
};

const lastNames = (names: string[] | null | undefined) =>
  new Set((names ?? []).flatMap((n) => n.split(/\s+(?:and|&)\s+/i)).map((n) => lastName(n).toLowerCase()).filter(Boolean));

export function offerMatches(t: OfferTerms, ex: ExtractedForMatch) {
  if (!t.property_street || !ex.property_street) return false;
  const addressOk = sameProperty(
    { street: t.property_street, city: t.property_city, zip: t.property_zip },
    { street: ex.property_street, city: ex.property_city, zip: ex.property_zip },
  );
  if (!addressOk) return false;
  const signed = lastNames(ex.buyers);
  return [...lastNames(t.buyers)].some((n) => signed.has(n));
}

export function findOfferMatch<O extends { id: string; terms: OfferTerms }>(offers: O[], ex: ExtractedForMatch): O | null {
  const hits = offers.filter((o) => offerMatches(o.terms, ex));
  return hits.length === 1 ? hits[0] : null; // two plausible offers: don't guess
}

export type DiffRow = { key: string; label: string; written: string; signed: string; changed: boolean };

const money = (n: number | null) => (n == null ? "Blank" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }));
const days = (n: number | null) => (n == null ? "Blank" : `${n} day${n === 1 ? "" : "s"}`);
const ADDENDUM_LABEL: Record<string, string> = {
  third_party_financing: "Financing", hoa: "HOA", lead_based_paint: "Lead-based paint", appraisal_termination: "Appraisal termination",
};
const COMPARED_ADDENDA = Object.keys(ADDENDUM_LABEL);

export function writtenVsSigned(t: OfferTerms, ex: ExtractedForMatch): DiffRow[] {
  const row = (key: string, label: string, w: string, s: string): DiffRow => ({ key, label, written: w, signed: s, changed: w !== s });
  const fin = (f: string | null) => (f ? (OFFER_FINANCING_LABELS as Record<string, string>)[f] ?? FINANCING_LABELS[f as FinancingType] ?? f : "Blank");
  const addenda = (keys: string[]) => {
    const present = COMPARED_ADDENDA.filter((k) => keys.includes(k)).map((k) => ADDENDUM_LABEL[k]);
    return present.length ? present.join(", ") : "None";
  };
  return [
    row("sales_price", "Sales price", money(t.sales_price), money(ex.sales_price)),
    row("earnest_money", "Earnest money", money(t.earnest_money), money(ex.earnest_money)),
    row("option_fee", "Option fee", money(t.option_fee), money(ex.option_fee)),
    row("option_period_days", "Option period", days(t.option_period_days), days(ex.option_period_days)),
    row("closing_date", "Closing date", t.closing_date ? formatDate(t.closing_date) : "Blank", ex.closing_date ? formatDate(ex.closing_date) : "Blank"),
    row("financing_type", "Financing", fin(t.financing_type), fin(ex.financing_type)),
    row("addenda", "Addenda", addenda(t.addenda), addenda(ex.addenda)),
  ];
}
