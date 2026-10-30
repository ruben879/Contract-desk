import { describe, expect, it } from "vitest";
import { matchItems, valueVariants } from "@/lib/highlight";

const items = ["C. Sales Price (Sum of A and B):", "$", "315,000.00", "4. LICENSE HOLDER", "within", "7", "days after the Effective Date"];

describe("matchItems", () => {
  it("finds a verbatim quote across split items", () => expect(matchItems(items, "Sales Price (Sum of A and B): $ 315,000.00")).toEqual([0, 1, 2]));
  it("ignores spacing and punctuation differences", () => expect(matchItems(items, "within 7 days after the effective date")).toEqual([4, 5, 6]));
  it("falls back to the value when the quote was paraphrased", () => expect(matchItems(items, "price is three fifteen", 315000)).toEqual([2]));
  it("falls back to the longest run of quote words", () => expect(matchItems(items, "Buyer must act within 7 days after closing")).toEqual([4, 5, 6]));
  it("returns null when nothing matches", () => expect(matchItems(items, "Third Party Financing", null)).toBeNull());
  it("prints dates the ways forms show them", () => expect(valueVariants("2026-12-04")).toEqual(["December 4, 2026", "12/4/2026", "12/4/26", "December 4"]));
});
