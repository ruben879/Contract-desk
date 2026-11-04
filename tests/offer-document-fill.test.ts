import { describe, expect, it } from "vitest";
import { FACT_KEYS, factsFormat, factsFromWire, factsToImport } from "@/lib/extract/read-facts";
import { applyRenImport, parseRenImport } from "@/lib/offer/ren-import";
import { applyBrokerageDefaults, enforceRules, STANDARD_OFFER_DEFAULTS as D, type OfferTerms } from "@/lib/offer/terms";
import { freshOffer, gurrolaFile } from "./fixtures/gurrola";

// The reader's answer for a FlexMLS detail print of MLS #202614455, as the structured output returns it.
// (Shape-for-shape what the API sends back; the real print is read live, which needs the API key.)
const flexPrint = {
  fields: [
    { field: "mls_number", value: "202614455", confidence: "high", page: 1 },
    { field: "property_street", value: "2131 S Loop 289", confidence: "high", page: 1 },
    { field: "property_city", value: "Lubbock", confidence: "high", page: 1 },
    { field: "property_state", value: "TX", confidence: "high", page: 1 },
    { field: "property_zip", value: "79423", confidence: "high", page: 1 },
    { field: "property_county", value: "Lubbock County", confidence: "high", page: 1 },
    { field: "legal_description", value: "Lot 377, Beverly Heights Addition", confidence: "high", page: 1 },
    { field: "year_built", value: "1959", confidence: "high", page: 1 },
    { field: "hoa_mandatory", value: "no", confidence: "medium", page: 1 },
    { field: "sellers", value: "Estate of Karl Sheridan Morris", confidence: "medium", page: 2 },
    { field: "title_company", value: "True Title", confidence: "high", page: 2 },
    { field: "title_company_address", value: "5010 122nd Street, Lubbock, TX 79424", confidence: "high", page: 2 },
    { field: "listing_broker_firm", value: "Taylor Reid Realty", confidence: "high", page: 1 },
    { field: "listing_broker_license", value: "9010699", confidence: "medium", page: 1 },
    { field: "listing_agent_name", value: "Stuart Bartley", confidence: "high", page: 1 },
    { field: "listing_agent_email", value: "stuart@lindseybartleyteam.com", confidence: "high", page: 1 },
    { field: "listing_agent_phone", value: "806-543-6877", confidence: "low", page: 1 },
  ],
  warnings: [],
};
const settle = (t: OfferTerms) => enforceRules(applyBrokerageDefaults(t, D, "Brokerage Default Title"));
function fill(t: OfferTerms, wire: unknown, name = "MLS 202614455 detail.pdf") {
  const { parsed, could_not_read, suggestions } = factsToImport(factsFromWire(wire));
  return settle(applyRenImport(t, parsed, name, new Date(), { kind: "document", could_not_read, suggestions }));
}

describe("Fill from a document: FlexMLS print for MLS #202614455", () => {
  const t = fill(freshOffer(), flexPrint);
  it("fills the property facts, legal, seller, title company and listing side", () => {
    expect([t.property_street, t.property_city, t.property_zip, t.property_county]).toEqual(["2131 S Loop 289", "Lubbock", "79423", "Lubbock"]);
    expect([t.lot, t.subdivision, t.year_built]).toEqual(["377", "Beverly Heights", 1959]);
    expect(t.sellers).toEqual(["Estate of Karl Sheridan Morris"]);
    expect(t.title_company).toBe("True Title");
    expect(t.title_company_address).toBe("5010 122nd Street, Lubbock, TX 79424");
    expect([t.listing_agent_name, t.listing_broker_firm, t.listing_agent_email]).toEqual(["Stuart Bartley", "Taylor Reid Realty", "stuart@lindseybartleyteam.com"]);
  });
  it("leaves sales price, earnest money and closing date for the agent", () => {
    expect([t.sales_price, t.earnest_money, t.option_fee, t.closing_date, t.financing_type]).toEqual([null, null, null, null, null]);
  });
  it("honest blanks: a low-confidence value stays blank and is listed as could not read", () => {
    expect(t.listing_agent_phone).toBeNull();
    expect(t.imported!.could_not_read).toContain("Listing agent phone (unclear, left blank)");
  });
  it("addenda are suggestions, never decisions", () => {
    expect(t.imported!.suggestions).toEqual(["lead_based_paint"]); // built 1959
    expect(t.addenda).not.toContain("lead_based_paint");
    const hoa = fill(freshOffer(), { fields: [{ field: "hoa_mandatory", value: "Yes - mandatory", confidence: "high", page: 1 }], warnings: [] });
    expect(hoa.imported!.suggestions).toEqual(["hoa"]);
    expect(hoa.addenda).toEqual([]);
  });
  it("records provenance: the document's file name", () => {
    expect(t.imported).toMatchObject({ kind: "document", file_name: "MLS 202614455 detail.pdf", mls_number: "202614455" });
  });
  it("the Ren import produces the fuller result", () => {
    const ren = settle(applyRenImport(freshOffer(), parseRenImport(gurrolaFile()), "ren.json"));
    expect(ren.imported!.filled.length).toBeGreaterThan(t.imported!.filled.length);
    for (const k of ["sales_price", "closing_date", "financing_type", "earnest_money"] as const) { expect(ren[k]).not.toBeNull(); expect(t[k]).toBeNull(); }
  });
});

describe("Fill from a document: rules", () => {
  it("facts only: the reader has no field for any negotiated term", () => {
    const allowed = ((factsFormat.schema.properties as any).fields.items.properties.field.enum) as string[];
    expect(allowed).toEqual([...FACT_KEYS]);
    for (const k of ["sales_price", "list_price", "earnest_money", "option_fee", "option_period_days", "closing_date", "financed_amount", "loan_origination_cap", "origination_cap_pct"]) expect(allowed).not.toContain(k);
    // Even if a reader answer carried one, it would be dropped.
    const r = factsFromWire({ fields: [{ field: "sales_price", value: "139900", confidence: "high" }], warnings: [] });
    expect(r.facts).toEqual({});
  });
  it("blanks only: never overwrites typed or imported values; a second document fills more", () => {
    const typed = settle({ ...freshOffer(), sellers: ["Typed Seller"], touched: ["sellers"] });
    const first = fill(typed, { fields: flexPrint.fields.filter((f) => f.field !== "title_company"), warnings: [] });
    expect(first.sellers).toEqual(["Typed Seller"]);
    expect(first.title_company).toBe("Brokerage Default Title");
    const second = fill(first, { fields: [{ field: "title_company", value: "True Title", confidence: "high", page: 1 }, { field: "property_street", value: "2131 South Loop 289", confidence: "high", page: 1 }], warnings: [] }, "lcad.pdf");
    expect(second.title_company).toBe("True Title");          // newly filled
    expect(second.property_street).toBe("2131 S Loop 289");   // not overwritten by the second read
    expect(second.imported!.kept).toContain("property_street");
  });
  it("a document that reads nothing lists what it couldn't find and changes nothing", () => {
    const before = freshOffer();
    const t = fill(before, { fields: [], warnings: ["This looks like a photo of a yard sign."] });
    expect(t.sellers).toEqual(before.sellers);
    expect(t.imported!.could_not_read).toEqual(expect.arrayContaining(["Seller", "Street address", "Legal description", "Title company"]));
    expect(t.imported!.problems).toContain("This looks like a photo of a yard sign.");
  });
});
