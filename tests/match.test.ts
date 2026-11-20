import { describe, expect, it } from "vitest";
import { compareParties, comparePrice, compareStreet, matchDocument, normalizeStreet } from "@/lib/match";
import { reviewHeading } from "@/lib/review-heading";

const DEAL = { property_street: "4002 97th Street", parties: ["John Buyer", "Mary Seller"], price: 315000 };

describe("which deal a document is for (lib/match.ts)", () => {
  it("reads street spellings the same", () => {
    expect(normalizeStreet("4002 97TH ST.")).toBe("4002 97th st");
    expect(compareStreet("4002 97th Street", "4002 97th St")).toBe("match");
    expect(compareStreet("4002 97th", "4002 97th Street")).toBe("match");
    expect(compareStreet("2131 South Loop 289", "2131 S Loop 289")).toBe("match");
    expect(compareStreet("5104 County Road 7920", "5104 CR 7920")).toBe("match");
    expect(compareStreet("4002 97th St", "4004 97th St")).toBe("differ");
    expect(compareStreet(null, "4002 97th St")).toBe("unknown");
    expect(compareStreet("Lot 7, Block 2", "4002 97th St")).toBe("unknown");
  });
  it("parties and price", () => {
    expect(compareParties(["Juan Ayala", "GM Capital LLC"], DEAL.parties)).toBe("differ");
    expect(compareParties(["J. Buyer"], DEAL.parties)).toBe("match");
    expect(compareParties([], DEAL.parties)).toBe("unknown");
    expect(comparePrice(315000, 315000)).toBe("match");
    expect(comparePrice(null, 315000)).toBe("unknown");
  });
  it("the Nov 18 case: the Ayala/GM Capital contract for 2312 145th St on 4002 97th is stopped", () => {
    const m = matchDocument({ property_street: "2312 145th St", parties: ["Juan Ayala", "GM Capital, LLC"], price: 189000 }, DEAL);
    expect(m).toEqual({ address: "differ", parties: "differ", price: "differ", mismatch: true });
  });
  it("an amendment to this deal that changes the price is not stopped", () => {
    expect(matchDocument({ property_street: "4002 97th Street", parties: ["John Buyer", "Mary Seller"], price: 309000 }, DEAL).mismatch).toBe(false);
  });
  it("matching on any one of the three lets it through", () => {
    expect(matchDocument({ property_street: "9 Other St", parties: ["Mary Seller"], price: 1 }, DEAL).mismatch).toBe(false);
    expect(matchDocument({ property_street: "9 Other St", parties: ["Someone Else"], price: 315000 }, DEAL).mismatch).toBe(false);
  });
  it("a document with no address on it (an HOA letter, a receipt) is never stopped", () => {
    expect(matchDocument({ property_street: null, parties: ["HOA Board"], price: 50 }, DEAL).mismatch).toBe(false);
  });
  it("a different address alone, with nothing else to compare, goes through to the review (which says so)", () => {
    expect(matchDocument({ property_street: "9 Other St", parties: [], price: null }, DEAL).mismatch).toBe(false);
  });
});

describe("review heading follows the finding (lib/review-heading.ts)", () => {
  const base = { docNames: ["Ayala contract.pdf"], dealStreet: "4002 97th Street", promotes: false };
  it("never tells the agent to 'confirm it belongs' when the read says a different address", () => {
    const h = reviewHeading({ ...base, nothing: true, seen: [{ doc: 1, property_street: "2312 145th St", parties: [], price: null }] });
    expect(h.title).toBe("This document names a different address");
    expect(h.body).toContain("2312 145th St");
    expect(h.body).not.toMatch(/belongs on this deal/);
    expect(h.tone).toBe("bad");
  });
  it("says so when the agent kept a mismatch on purpose", () => {
    const h = reviewHeading({ ...base, nothing: true, seen: [], kept: [{ file_name: "Ayala contract.pdf", property_street: "2312 145th St", parties: ["Juan Ayala"], price: 189000 }] });
    expect(h.title).toBe("You kept a document that doesn't match this deal");
    expect(h.body).toContain("We found nothing in it that changes this deal.");
  });
  it("plain cases", () => {
    expect(reviewHeading({ ...base, nothing: true, seen: [{ doc: 1, property_street: "4002 97th St", parties: [], price: null }] }).title).toBe("Nothing changes on this deal");
    expect(reviewHeading({ ...base, nothing: false, seen: [] }).title).toBe("Confirm what changed");
    expect(reviewHeading({ ...base, promotes: true, nothing: false, seen: [] }).title).toBe("Confirm the contract");
  });
});
