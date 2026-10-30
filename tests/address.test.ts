import { describe, expect, it } from "vitest";
import { parseStreet, routeIntake, sameProperty } from "@/lib/address";

describe("sameProperty", () => {
  const deal = { street: "5512 98th Street", city: "Lubbock", zip: "79424" };
  it("matches common spelling differences", () => {
    expect(sameProperty({ street: "5512 98th St.", zip: "79424-1234" }, deal)).toBe(true);
    expect(sameProperty({ street: "5512 98TH ST" }, deal)).toBe(true);
    expect(sameProperty({ street: "5512 98th" }, deal)).toBe(true); // suffix missing on one side is not a conflict
  });
  it("refuses near misses", () => {
    expect(sameProperty({ street: "5514 98th St" }, deal)).toBe(false);
    expect(sameProperty({ street: "5512 98th Dr" }, deal)).toBe(false);
    expect(sameProperty({ street: "5512 98th St", zip: "79423" }, deal)).toBe(false);
    expect(sameProperty({ street: "5512 98th St", city: "Wolfforth" }, deal)).toBe(false);
    expect(sameProperty({ street: "98th St" }, deal)).toBe(false);
  });
  it("handles directions and units", () => {
    expect(sameProperty({ street: "100 North Main Street Apt 4" }, { street: "100 N Main St #4", city: null, zip: null })).toBe(true);
    expect(sameProperty({ street: "100 N Main St Unit 4" }, { street: "100 N Main St Unit 5", city: null, zip: null })).toBe(false);
    expect(sameProperty({ street: "100 S Main St" }, { street: "100 N Main St", city: null, zip: null })).toBe(false);
  });
  it("parses", () => expect(parseStreet("1201 Avenue Q")).toEqual({ number: "1201", dir: null, name: "avenue q", suffix: null, unit: null }));
});

describe("routeIntake", () => {
  const deals = [
    { id: "a", street: "5512 98th Street", city: "Lubbock", zip: "79424" },
    { id: "b", street: "100 N Main St", city: "Lubbock", zip: "79401" },
    { id: "c", street: "100 N Main St", city: "Lubbock", zip: "79401" },
  ];
  const amend = (street: string | null) => routeIntake({ isContract: false, property: street ? { street } : null, activeDeals: deals });
  it("attaches only on exactly one match", () => expect(amend("5512 98th St")).toEqual({ action: "attach", transactionId: "a" }));
  it("sorts multiple matches with candidates", () => expect(amend("100 North Main")).toMatchObject({ action: "sort", candidates: ["b", "c"] }));
  it("sorts no match and unreadable addresses", () => {
    expect(amend("7 Oak Ln")).toMatchObject({ action: "sort", candidates: [] });
    expect(amend(null)).toMatchObject({ action: "sort", reason: expect.stringContaining("Couldn't read") });
  });
  it("never duplicates: a contract for an address with an active deal goes to sorting", () => {
    expect(routeIntake({ isContract: true, property: { street: "5512 98th St" }, activeDeals: deals })).toMatchObject({ action: "sort", candidates: ["a"] });
    expect(routeIntake({ isContract: true, property: { street: "7 Oak Ln" }, activeDeals: deals })).toEqual({ action: "create" });
  });
});
