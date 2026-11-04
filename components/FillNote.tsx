import type { ImportNote } from "@/lib/offer/terms";
import { formatDate } from "@/lib/dates";

const LABEL: Record<string, string> = {
  buyers: "buyers", sellers: "sellers", property_street: "street address", property_city: "city", property_zip: "ZIP", property_county: "county",
  lot: "lot", block: "block", subdivision: "addition", year_built: "year built", sales_price: "sales price", earnest_money: "earnest money",
  option_fee: "option fee", option_period_days: "option period", financing_type: "financing", financed_amount: "loan amount",
  loan_term_years: "loan term", loan_rate_cap: "rate cap", fin_approval_days: "buyer approval days", closing_date: "closing date",
  title_company: "title company", title_policy_payer: "title policy payer", survey_option: "survey", survey_days: "survey days",
  survey_new_payer: "new survey payer", appraisal_option: "appraisal option", appraisal_days: "appraisal days", appraisal_value: "appraisal amount",
  hoa_association: "association", hoa_info_days: "HOA information days", hoa_fee_cap: "HOA fee cap",
  buyer_broker_comp_type: "compensation type", buyer_broker_comp_value: "compensation", buyer_notice_email: "buyer email",
  buyer_notice_phone: "buyer phone", buyer_notice_address: "buyer notice address",
  listing_broker_firm: "listing brokerage", listing_broker_license: "listing brokerage license", listing_broker_address: "listing brokerage address", listing_agent_name: "listing agent",
  listing_agent_license: "listing agent license", listing_agent_email: "listing agent email", listing_agent_phone: "listing agent phone",
};
const words = (keys: string[]) => keys.map((k) => LABEL[k] ?? k.replace(/^addenda: /, "").replace(/_/g, " ")).join(", ");

/** One provenance line after a fill, with the short notes underneath. */
export function FillNote({ note }: { note: ImportNote }) {
  const line = note.kind === "ren"
    ? ["Terms imported", note.prepared ? `prepared ${formatDate(note.prepared)}` : null, note.mls_number ? `MLS ${note.mls_number}` : null].filter(Boolean).join(" · ")
    : `Filled from ${note.file_name ?? "a document"}`;
  const notes = [
    note.kind === "document" && note.could_not_read.length ? `Could not read: ${note.could_not_read.join(", ")}.` : null,
    note.kept.length ? `Kept what was already on the offer for: ${words(note.kept)}.` : null,
    ...note.problems,
    note.unused.length ? `In the file but not used (no place on the offer yet): ${note.unused.join(", ")}.` : null,
    note.unknown.length ? `Not part of the format, ignored: ${note.unknown.join(", ")}.` : null,
  ].filter(Boolean) as string[];
  return (
    <div className="mb-4 rounded-xl bg-paper px-4 py-2.5 text-[14px]">
      <p className="font-medium">{line}</p>
      {notes.length > 0 && <ul className="mt-1 list-disc pl-5 text-muted">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  );
}
