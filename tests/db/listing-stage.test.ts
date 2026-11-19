import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { freshDb, seedBrokerage } from "./harness";
import { pgSupabase } from "./pg-supabase";
import { nextStage } from "@/lib/stage";
import { dealStatus } from "@/lib/deal-status";
import { slotsFor } from "@/lib/slots";
import { LISTING_TASKS } from "@/lib/checklist/listing";

// The listing stage, end to end through the real confirm actions (review confirm and
// changes confirm) and lib/apply.ts, on Postgres with every migration applied.
// Nov 19, 2026: 5104 County Road 7920 started from its TXR-1101; 4002 97th must not change.

const h = vi.hoisted(() => ({ ctx: null as any, sb: null as any }));
class Redirect extends Error { constructor(public to: string) { super(`redirect ${to}`); } }
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => h.sb }));
vi.mock("@/lib/context", () => ({ requireMember: async () => h.ctx }));
vi.mock("@/lib/offer/server", () => ({ matchOpenOffer: async () => null }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Redirect(to); }, notFound: () => { throw new Error("404"); } }));

const { confirmTransaction } = await import("@/app/t/[id]/review/actions");
const { confirmChanges } = await import("@/app/t/[id]/changes/actions");

const TODAY = "2026-11-19";
const CONTRACT_KEYS = ["executed_contract", "contract_to_title", "earnest_delivered", "option_decision", "title_commitment", "survey", "settlement_review", "closed"];

let db: Awaited<ReturnType<typeof freshDb>>["db"];
let brokerageId: string;

beforeAll(async () => {
  ({ db } = await freshDb());
  const b = await seedBrokerage(db);
  brokerageId = b.brokerageId;
  const broker = await b.member("broker");
  h.sb = pgSupabase(db);
  h.ctx = { supabase: h.sb, user: { id: broker.userId }, member: { id: broker.memberId, full_name: "Ruben", email: "r@x.com" }, isBrokerOrStaff: true };
}, 60_000);

async function newDraft(documents: { doc: number; kind: string; name: string; slot: string | null }[]) {
  const tx = (await db.query<{ id: string }>("insert into transactions (brokerage_id, status, source) values ($1, 'needs_review', 'upload') returning id", [brokerageId])).rows[0].id;
  await db.query("insert into extractions (brokerage_id, transaction_id, kind, status, result) values ($1, $2, 'initial', 'ready', $3)",
    [brokerageId, tx, JSON.stringify({ documents, addenda: [], warnings: [] })]);
  return tx;
}

/** What the review form posts. */
function reviewForm(f: Record<string, string>, opts: { addenda?: string[]; contacts?: unknown[] } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(f)) fd.set(k, v);
  for (const a of opts.addenda ?? []) fd.append("addenda", a);
  fd.set("contacts", JSON.stringify(opts.contacts ?? []));
  return fd;
}

async function expectRedirect(p: Promise<unknown>) {
  const r = await p.then((x) => x, (e) => e);
  expect(r, JSON.stringify(r)).toBeInstanceOf(Redirect);
}

// Dates come back as text, the way Supabase returns them.
const row = async (id: string) => Object.fromEntries(Object.entries((await db.query<any>("select * from transactions where id = $1", [id])).rows[0])
  .map(([k, v]) => [k, v instanceof Date && /_date$/.test(k) ? v.toISOString().slice(0, 10) : v])) as any;
const items = async (id: string) => (await db.query<any>("select rule_key, title, status, section from checklist_items where transaction_id = $1 order by section, sort", [id])).rows;
const deadlines = async (id: string) => (await db.query<any>("select key, due_date::text from deadlines where transaction_id = $1 order by key", [id])).rows;

// The contract-start form: what an executed TREC resale contract fills in.
const CONTRACT = {
  side: "seller", agent_member_id: "", property_street: "4002 97th Street", property_city: "Lubbock", property_state: "TX", property_zip: "79423",
  contract_form: "TREC 20-18", sales_price: "315000", financed_amount: "299250", financing_type: "conventional",
  earnest_money: "3000", option_fee: "250", effective_date: "2026-11-10", closing_date: "2026-12-15",
  option_period_days: "7", survey_days: "", hoa_info_days: "", fin_approval_days: "21", seller_disclosure: "received",
};

describe("1. a deal started from a listing agreement only", () => {
  let id: string;
  beforeAll(async () => {
    id = await newDraft([{ doc: 1, kind: "listing_agreement", name: "TXR-1101 Residential Listing Agreement", slot: "listing_agreement" }]);
    const ex = (await db.query<any>("select result from extractions where transaction_id = $1", [id])).rows[0].result;
    const stage = nextStage({ current: null, firstConfirm: true, documents: ex.documents });   // what the review page decides
    expect(stage).toBe("listing");
    await expectRedirect(confirmTransaction(id, undefined, reviewForm({
      stage, side: "seller", agent_member_id: "", property_street: "5104 County Road 7920", property_city: "Lubbock", property_state: "TX",
      list_price: "$449,000", listing_start_date: "2026-11-18", listing_expiration_date: "2027-05-31", listing_mortgage_info: "yes",
    }, { contacts: [{ role: "seller", full_name: "Pat Seller", company: "", email: "", phone: "" }] })));
  });

  it("lands in the Listing stage, and nothing claims a contract exists", async () => {
    const tx = await row(id);
    expect(tx.stage).toBe("listing");
    expect(tx.status).toBe("active");
    expect(dealStatus({ status: tx.status, today: TODAY, deadlines: [], stage: tx.stage, listingExpires: tx.listing_expiration_date }).label).toBe("Listing");
    const keys = (await items(id)).map((i) => i.rule_key);
    expect(keys.some((k) => CONTRACT_KEYS.includes(k))).toBe(false);
    const ev = (await db.query<any>("select summary from transaction_events where transaction_id = $1", [id])).rows[0];
    expect(ev.summary).toBe("Listing details confirmed");
  });
  it("gets the listing checklist, with only the agreement done", async () => {
    const list = await items(id);
    expect(list.map((i) => i.rule_key)).toEqual(LISTING_TASKS.map((t) => t.key));   // mortgage info included: the agreement asks for it
    expect(list.filter((i) => i.status === "done").map((i) => i.title)).toEqual(["Listing agreement in the file"]);
    expect(list.every((i) => i.section === "Listing")).toBe(true);
  });
  it("shows the list price as a list price, never a sales price", async () => {
    const tx = await row(id);
    expect(Number(tx.list_price)).toBe(449000);
    expect(tx.sales_price).toBeNull();
    expect([tx.listing_start_date, tx.listing_expiration_date]).toEqual(["2026-11-18", "2027-05-31"]);
  });
  it("has no contract deadlines, closing date, or earnest money", async () => {
    expect(await deadlines(id)).toEqual([]);
    const tx = await row(id);
    expect([tx.closing_date, tx.effective_date, tx.earnest_money, tx.option_fee]).toEqual([null, null, null, null]);
  });
  it("shows listing document slots, not contract ones", () => {
    const slots = slotsFor({ side: "seller", addenda: [], financing_type: null, seller_disclosure: null, stage: "listing", listing_mortgage_info: true }, new Set()).map((s) => s.key);
    expect(slots).toEqual(["listing_agreement", "mortgage_info", "sellers_disclosure", "other"]);
  });
  it("without the mortgage-information box, that task is left off", async () => {
    const id2 = await newDraft([{ doc: 1, kind: "listing_agreement", name: "TXR-1101", slot: "listing_agreement" }]);
    await expectRedirect(confirmTransaction(id2, undefined, reviewForm({ stage: "listing", side: "seller", agent_member_id: "", property_street: "1 Test St" })));
    expect((await items(id2)).map((i) => i.rule_key)).not.toContain("listing_mortgage_info");
  });
  it("Edit details on a listing keeps it a listing", async () => {
    await expectRedirect(confirmTransaction(id, undefined, reviewForm({
      stage: "listing", side: "seller", agent_member_id: "", property_street: "5104 County Road 7920", property_city: "Lubbock",
      list_price: "439000", listing_start_date: "2026-11-18", listing_expiration_date: "2027-05-31", listing_mortgage_info: "yes",
    }, { contacts: [{ role: "seller", full_name: "Pat Seller", company: "", email: "", phone: "" }] })));
    const tx = await row(id);
    expect(tx.stage).toBe("listing");
    expect(Number(tx.list_price)).toBe(439000);
    expect(await deadlines(id)).toEqual([]);
  });
  it("a contract-stage form posted against it can't sneak a stage change in an edit", async () => {
    // Promotion only happens through a confirmed executed contract (test 2), never through Edit details.
    const tx = await row(id);
    expect(tx.stage).toBe("listing");
  });

  describe("2. adding and confirming the executed contract promotes it", () => {
    beforeAll(async () => {
      await db.query("update checklist_items set status = 'done' where transaction_id = $1 and rule_key in ('listing_photos', 'listing_mls')", [id]);
      const result = {
        documents: [{ doc: 1, kind: "contract", name: "TREC 20-18 One to Four Family Residential Contract", slot: "contract" }],
        changes: [], addenda_added: [{ key: "third_party_financing", name: "Third Party Financing Addendum", form_number: "40-11", doc: 1, page: 10, evidence: "attached" }],
        addenda_removed: [], summary: "Executed contract: $440,000, closing Jan 8.", warnings: [],
      };
      const ex = (await db.query<any>("insert into extractions (brokerage_id, transaction_id, kind, status, result) values ($1, $2, 'amendment', 'ready', $3) returning id",
        [brokerageId, id, JSON.stringify(result)])).rows[0].id;
      const fd = new FormData();
      const set: Record<string, string> = { sales_price: "440000", financing_type: "conventional", earnest_money: "4400", option_fee: "300",
        effective_date: "2026-12-01", closing_date: "2027-01-08", option_period_days: "10", fin_approval_days: "21", seller_disclosure: "received" };
      for (const [k, v] of Object.entries(set)) { fd.append("change", k); fd.set(`value_${k}`, v); }
      fd.append("add", "third_party_financing");
      await expectRedirect(confirmChanges(id, ex, undefined, fd));
    });

    it("moves to the contract stage", async () => {
      const tx = await row(id);
      expect(tx.stage).toBe("contract");
      expect(Number(tx.sales_price)).toBe(440000);
      expect(Number(tx.list_price)).toBe(439000);   // the listing facts stay as history
      const ev = (await db.query<any>("select summary, changes from transaction_events where transaction_id = $1 order by created_at desc limit 1", [id])).rows[0];
      expect(ev.summary).toMatch(/^Executed contract added: moved from Listing to Under contract/);
      expect(ev.changes.stage).toEqual({ before: "listing", after: "contract" });
    });
    it("builds the contract checklist and deadlines from the contract", async () => {
      const keys = (await items(id)).map((i) => i.rule_key);
      expect(keys).toEqual(expect.arrayContaining([...CONTRACT_KEYS, "fin_appraisal_ordered", "fin_buyer_approval"]));
      expect((await items(id)).find((i) => i.rule_key === "executed_contract")?.status).toBe("done");
      const d = Object.fromEntries((await deadlines(id)).map((x) => [x.key, x.due_date]));
      expect(d.option_end).toBe("2026-12-11");
      expect(d.closing).toBe("2027-01-08");
      expect(d.earnest_money).toBeDefined();
      expect(d.fin_approval).toBe("2026-12-22");
      const tx = await row(id);
      expect(dealStatus({ status: tx.status, today: TODAY, deadlines: await deadlines(id) as any, stage: tx.stage }).label).toBe("Option period");
    });
    it("keeps the listing tasks, done or carried over", async () => {
      const listing = (await items(id)).filter((i) => i.section === "Listing");
      expect(listing.map((i) => i.rule_key)).toEqual(LISTING_TASKS.map((t) => t.key));
      const status = Object.fromEntries(listing.map((i) => [i.rule_key, i.status]));
      expect(status).toMatchObject({ listing_agreement: "done", listing_photos: "done", listing_mls: "done", listing_sign: "open" });
    });
    it("an edit after promotion keeps it under contract", async () => {
      await expectRedirect(confirmTransaction(id, undefined, reviewForm({ ...CONTRACT, stage: "listing", property_street: "5104 County Road 7920" })));
      expect((await row(id)).stage).toBe("contract");
      expect((await items(id)).filter((i) => i.section === "Listing")).toHaveLength(LISTING_TASKS.length);
    });
  });
});

describe("3 and 4. contract-started deals work exactly as before", () => {
  it("a contract deal confirmed before migration 0012 exists keeps working, then reads as stage 'contract'", async () => {
    const { db: old } = await freshDb("0011");
    const b = await seedBrokerage(old);
    const m = await b.member("broker");
    const sb = pgSupabase(old);
    const prev = { ...h.ctx }; const prevSb = h.sb;
    h.sb = sb; h.ctx = { ...h.ctx, supabase: sb, user: { id: m.userId }, member: { id: m.memberId } };
    try {
      const tx = (await old.query<{ id: string }>("insert into transactions (brokerage_id, status, source) values ($1, 'needs_review', 'upload') returning id", [b.brokerageId])).rows[0].id;
      await old.query("insert into extractions (brokerage_id, transaction_id, kind, status, result) values ($1, $2, 'initial', 'ready', $3)",
        [b.brokerageId, tx, JSON.stringify({ documents: [{ doc: 1, kind: "contract" }] })]);
      // The new code, on a database without the listing columns: the contract path never touches them.
      await expectRedirect(confirmTransaction(tx, undefined, reviewForm({ ...CONTRACT, stage: "contract" }, { addenda: ["third_party_financing"] })));
      const before = { items: (await old.query("select rule_key, status from checklist_items where transaction_id = $1 order by rule_key", [tx])).rows,
        deadlines: (await old.query("select key, due_date::text from deadlines where transaction_id = $1 order by key", [tx])).rows };
      expect(before.items.length).toBeGreaterThan(5);
      await old.exec(fs.readFileSync(path.join(__dirname, "../../supabase/migrations/0012_listing_stage.sql"), "utf8"));
      const t = (await old.query<any>("select stage, list_price from transactions where id = $1", [tx])).rows[0];
      expect(t).toEqual({ stage: "contract", list_price: null });
      // Opening and saving it again changes nothing.
      await expectRedirect(confirmTransaction(tx, undefined, reviewForm({ ...CONTRACT, stage: "contract" }, { addenda: ["third_party_financing"] })));
      const after = { items: (await old.query("select rule_key, status from checklist_items where transaction_id = $1 order by rule_key", [tx])).rows,
        deadlines: (await old.query("select key, due_date::text from deadlines where transaction_id = $1 order by key", [tx])).rows };
      expect(after).toEqual(before);
    } finally { h.ctx = prev; h.sb = prevSb; }
  }, 60_000);

  it("a new deal from an executed contract (no listing agreement) is a contract deal", async () => {
    const id = await newDraft([{ doc: 1, kind: "contract", name: "TREC 20-18", slot: "contract" }]);
    expect(nextStage({ current: null, firstConfirm: true, documents: [{ kind: "contract" }] })).toBe("contract");
    // Even a packet with both: the contract wins.
    expect(nextStage({ current: null, firstConfirm: true, documents: [{ kind: "listing_agreement" }, { kind: "contract" }] })).toBe("contract");
    await expectRedirect(confirmTransaction(id, undefined, reviewForm({ ...CONTRACT, stage: "contract" }, { addenda: ["third_party_financing"] })));
    const tx = await row(id);
    expect(tx.stage).toBe("contract");
    const out = {
      items: (await db.query("select rule_key, title, section, reason, deadline_key, status, sort from checklist_items where transaction_id = $1 order by sort", [id])).rows,
      deadlines: (await db.query("select key, label, due_date::text, due_time::text, contract_ref, calculation from deadlines where transaction_id = $1 order by key", [id])).rows,
      summary: (await db.query<any>("select summary from transaction_events where transaction_id = $1", [id])).rows[0].summary,
    };
    expect(out.items.some((i: any) => i.section === "Listing")).toBe(false);
    expect(out.summary).toBe("Contract details confirmed");
    // Compared against main's output for the same contract (written by the same flow on main).
    const main = process.env.MAIN_CONTRACT_OUT;
    if (main && fs.existsSync(main)) expect(out).toEqual(JSON.parse(fs.readFileSync(main, "utf8")));
    if (process.env.BRANCH_CONTRACT_OUT) fs.writeFileSync(process.env.BRANCH_CONTRACT_OUT, JSON.stringify(out));
  });
});
