import { it, expect } from "vitest";
import { ExtractionSchema, ChangeSchema } from "@/lib/extract/schema";
it("parses partial junk safely", () => {
  const r = ExtractionSchema.parse({ sales_price: { value: "315000", confidence: "high", doc: 1, page: 2, quote: "$315,000", box: [0.1, 0.2, 0.3, 0.25], source: "Para 3C" }, buyers: "oops", effective_date: { value: "Oct 28", confidence: "high" } });
  expect(r.sales_price.value).toBe(315000);
  expect(r.sales_price.box).toEqual([0.1, 0.2, 0.3, 0.25]);
  expect(r.buyers.value).toBeNull();
  expect(r.effective_date.value).toBeNull();
  expect(r.addenda).toEqual([]);
  const c = ChangeSchema.parse({ changes: [{ key: "closing_date", value: "2026-12-11", confidence: "high", doc: 1, page: 1, quote: "x", box: null, source: "Para 2" }], summary: "s" });
  expect(c.changes[0].key).toBe("closing_date");
});
