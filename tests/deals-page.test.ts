import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Nov 20: production showed "Deals 0 / No open deals yet" while 4002 97th Street and 5104 County
// Road 7920 were active. The deals query asked for documents.held; when that column is missing
// (migration 0013 not applied) PostgREST errors the whole query and the page read that as empty.
// This fake answers like PostgREST: any select that names a missing column fails.

const h2 = vi.hoisted(() => ({ missing: [] as string[] }));
const TX = [
  { id: "t1", status: "closed", stage: "contract", property_street: "17 W Brookhollow Dr", property_city: "Ransom Canyon", sales_price: 425000, list_price: null, listing_expiration_date: null, created_at: "2026-10-28" },
  { id: "t2", status: "active", stage: "contract", property_street: "4002 97th Street", property_city: "Lubbock", sales_price: 270000, list_price: null, listing_expiration_date: null, created_at: "2026-11-10" },
  { id: "t3", status: "active", stage: "listing", property_street: "5104 County Road 7920", property_city: null, sales_price: null, list_price: 1200000, listing_expiration_date: "2027-05-31", created_at: "2026-11-19" },
];
function q(table: string) {
  let cols = ""; const f: ((r: any) => boolean)[] = [];
  const b: any = {
    select(c: string) { cols = c; return b; },
    in(col: string, v: string[]) { f.push((r) => v.includes(r[col])); return b; },
    eq(col: string, v: unknown) { f.push((r) => r[col] === v); return b; },
    neq(col: string, v: unknown) { f.push((r) => r[col] !== v); return b; },
    not() { return b; }, order() { return b; }, limit() { return b; }, returns() { return b; },
    then(res: any) {
      const bad = h2.missing.find((m) => new RegExp(`\\b${m.split(".")[1]}\\b`).test(cols) && (table === m.split(".")[0] || cols.includes(`${m.split(".")[0]}(`)));
      if (bad) return Promise.resolve({ data: null, error: { message: `column ${bad} does not exist` } }).then(res);
      const rows = table === "transactions" ? TX.map((t) => ({ ...t, deadlines: t.id === "t2" ? [{ key: "closing", label: "Closing", due_date: "2026-12-14" }] : [], checklist_items: [], documents: [] }))
        : table === "offers" ? [{ id: "o1", status: "out_for_signature", terms: { property_street: "2131 S Loop 289", sales_price: 135000, buyers: ["Eduardo Gurrola"] }, edited_since_export: false }]
        : [];
      return Promise.resolve({ data: rows.filter((r) => f.every((fn) => fn(r))), error: null }).then(res);
    },
  };
  return b;
}
vi.mock("@/lib/context", () => ({ requireMember: async () => ({ supabase: { from: q }, brokerage: { id: "b", name: "Clear Rock Realty", timezone: "America/Chicago" }, isBrokerOrStaff: true }) }));
vi.mock("@/lib/extract/stale", () => ({ expireStaleReads: async () => {} }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: any) => h("main", null, children) }));
vi.mock("@/components/NewMenu", () => ({ NewMenu: () => null }));
vi.mock("@/components/Dropzone", () => ({ Dropzone: () => null }));
vi.mock("@/app/actions", () => ({ startUpload: 0 }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: any) => h("a", { href, ...p }, children) }));

const { default: Deals } = await import("@/app/deals/page");
const render = async (tab?: string) => renderToStaticMarkup(await Deals({ searchParams: Promise.resolve({ tab }) }));

describe("Deals tab", () => {
  it("shows the two open deals even when documents.held doesn't exist yet", async () => {
    h2.missing = ["documents.held"];
    const html = await render();
    expect(html).toContain("4002 97th Street, Lubbock");
    expect(html).toContain("5104 County Road 7920");
    expect(html).not.toContain("Brookhollow");   // closed deals aren't on this list
    expect(html).toMatch(/Deals <span[^>]*>2<\/span>/);
    expect(html).toContain("$270,000");
    expect(html).toContain("Listing · List $1,200,000");
    expect(html).not.toContain("No open deals yet");
  });
  it("with every column present, the same", async () => {
    h2.missing = [];
    const html = await render();
    expect(html).toMatch(/Deals <span[^>]*>2<\/span>/);
  });
  it("a failed deals query says so, never 'No open deals yet'", async () => {
    h2.missing = ["transactions.stage"];
    const html = await render();
    expect(html).toContain("Couldn&#x27;t load your deals");
    expect(html).not.toContain("No open deals yet");
  });
});
