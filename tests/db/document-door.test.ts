import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { freshDb, seedBrokerage } from "./harness";
import { pgSupabase } from "./pg-supabase";

// Nov 18 rulings 3 and 4, end to end on Postgres with every migration: a document that matches
// the deal on nothing is stopped at the door; the three ways out; and Remove on any document.
// The reader is replaced by a stand-in that answers per file name, like the real one would.

const h = vi.hoisted(() => ({ ctx: null as any, sb: null as any, after: [] as Promise<unknown>[], reads: [] as string[][] }));
class Redirect extends Error { constructor(public to: string) { super(`redirect ${to}`); } }
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => h.sb }));
vi.mock("@/lib/context", () => ({ requireMember: async () => h.ctx }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Redirect(to); }, notFound: () => { throw new Error("404"); } }));
vi.mock("next/server", async (orig) => ({ ...(await orig<any>()), after: (fn: () => Promise<unknown>) => { h.after.push(fn()); } }));

// What the reader says about each file, by name.
const SAYS: Record<string, { kind: string; name: string; slot: string; street: string | null; parties: string[]; price: number | null; changes?: any[] }> = {
  "Ayala contract.pdf": { kind: "contract", name: "One to Four Family Residential Contract", slot: "contract", street: "2312 145th St", parties: ["Juan Ayala", "GM Capital, LLC"], price: 189000,
    changes: [{ key: "sales_price", value: 189000, confidence: "high", doc: 1, page: 1, quote: "", box: null, source: "Para 3" }] },
  "Amendment.pdf": { kind: "amendment", name: "Amendment to Contract", slot: "amendments", street: "4002 97th Street", parties: ["John Buyer", "Mary Seller"], price: 310000,
    changes: [{ key: "sales_price", value: 310000, confidence: "high", doc: 1, page: 1, quote: "", box: null, source: "Para 2A" }] },
  "HOA letter.pdf": { kind: "other", name: "HOA resale certificate", slot: "other", street: null, parties: [], price: null },
};
vi.mock("@/lib/extract/read-contract", () => ({
  readChanges: async (_base: unknown, pdfs: { name: string }[]) => {
    h.reads.push(pdfs.map((p) => p.name));
    const per = pdfs.map((p, i) => ({ ...SAYS[p.name], doc: i + 1 }));
    return {
      model: "stand-in",
      changes: {
        changes: per.flatMap((x) => (x.changes ?? []).map((c: any) => ({ ...c, doc: x.doc }))),
        addenda_added: [], addenda_removed: [],
        documents: per.map((x) => ({ doc: x.doc, kind: x.kind, name: x.name, slot: x.slot })),
        seen: per.map((x) => ({ doc: x.doc, property_street: x.street, parties: x.parties, price: x.price })),
        summary: per.map((x) => x.name).join("; "), warnings: [],
      },
    };
  },
}));

const run = await import("@/lib/extract/run");
const actions = await import("@/app/actions");
const { reviewHeading } = await import("@/lib/review-heading");

let db: Awaited<ReturnType<typeof freshDb>>["db"];
let brokerageId: string, dealId: string, otherId: string;
let pdf: Uint8Array;

async function addDoc(tx: string, name: string, slot: string | null = null) {
  const id = crypto.randomUUID();
  const path = `${brokerageId}/${tx}/${id}.pdf`;
  await db.query("insert into documents (id, brokerage_id, transaction_id, storage_path, file_name, source, slot, slot_source) values ($1,$2,$3,$4,$5,'upload',$6,$7)",
    [id, brokerageId, tx, path, name, slot, slot ? "agent" : null]);
  h.sb.storage.files.set(`documents/${path}`, pdf);
  return id;
}
const doc = async (id: string) => (await db.query<any>("select * from documents where id = $1", [id])).rows[0];
const reviews = async (tx: string) => (await db.query<any>("select status, error, document_ids, result from extractions where transaction_id = $1 and kind = 'amendment' order by created_at", [tx])).rows;
const settle = async () => { while (h.after.length) await h.after.shift(); };

beforeAll(async () => {
  ({ db } = await freshDb());
  const b = await seedBrokerage(db);
  brokerageId = b.brokerageId;
  const broker = await b.member("broker");
  h.sb = pgSupabase(db);
  h.ctx = { supabase: h.sb, user: { id: broker.userId }, member: { id: broker.memberId, brokerage_id: brokerageId }, brokerage: { id: brokerageId }, isBrokerOrStaff: true };
  const p = await PDFDocument.create(); p.addPage(); pdf = await p.save();

  const mk = async (street: string, price: number, buyer: string, seller: string) => {
    const id = (await db.query<any>("insert into transactions (brokerage_id, status, source, property_street, sales_price, confirmed_at) values ($1,'active','upload',$2,$3, now()) returning id", [brokerageId, street, price])).rows[0].id;
    for (const [role, name] of [["buyer", buyer], ["seller", seller]]) {
      const c = (await db.query<any>("insert into contacts (brokerage_id, type, full_name) values ($1,$2,$3) returning id", [brokerageId, role, name])).rows[0].id;
      await db.query("insert into transaction_contacts (brokerage_id, transaction_id, contact_id, role) values ($1,$2,$3,$4)", [brokerageId, id, c, role]);
    }
    return id;
  };
  dealId = await mk("4002 97th Street", 315000, "John Buyer", "Mary Seller");
  otherId = await mk("2312 145th St", 189000, "Juan Ayala", "GM Capital LLC");
}, 60_000);
beforeEach(() => { h.reads = []; });

describe("3. a document that matches the deal on nothing is stopped at the door", () => {
  let ayala: string;
  beforeAll(async () => {
    ayala = await addDoc(dealId, "Ayala contract.pdf", "contract");   // dropped on the Executed contract row, like Nov 18
    await run.runAmendmentRead(dealId, [ayala]);
  });

  it("is held: not filed into a slot", async () => {
    const d = await doc(ayala);
    expect(d.held).toBeTruthy();
    expect(d.slot).toBeNull();
    expect(d.held.seen).toEqual({ property_street: "2312 145th St", parties: ["Juan Ayala", "GM Capital, LLC"], price: 189000 });
    expect(d.held.looks_like).toBe("One to Four Family Residential Contract");
    expect(d.held.slot).toBe("contract");   // remembered, in case the agent keeps it
  });
  it("never enters the 'what changed' review, and nothing on the deal moved", async () => {
    const r = await reviews(dealId);
    expect(r.map((x) => x.status)).toEqual(["dismissed"]);
    expect(r[0].error).toBe("Doesn't match this deal");
    const tx = (await db.query<any>("select sales_price from transactions where id = $1", [dealId])).rows[0];
    expect(Number(tx.sales_price)).toBe(315000);
  });
  it("a real amendment added alongside a mismatch is read on its own", async () => {
    const amend = await addDoc(dealId, "Amendment.pdf");
    const stray = await addDoc(dealId, "Ayala contract.pdf");
    await run.runAmendmentRead(dealId, [amend, stray]);
    expect(h.reads).toEqual([["Amendment.pdf", "Ayala contract.pdf"], ["Amendment.pdf"]]);
    expect((await doc(stray)).held).toBeTruthy();
    expect((await doc(amend)).held).toBeNull();
    expect((await doc(amend)).slot).toBe("amendments");
    const ready = (await reviews(dealId)).find((x) => x.status === "ready");
    expect(ready.document_ids).toEqual([amend]);
    expect(ready.result.changes.map((c: any) => c.value)).toEqual([310000]);   // nothing from the Ayala contract
    await actions.removeDocument(stray); await settle();
  });
  it("a document with no address (an HOA letter) is never stopped", async () => {
    const hoa = await addDoc(dealId, "HOA letter.pdf");
    await run.runAmendmentRead(dealId, [hoa]);
    expect((await doc(hoa)).held).toBeNull();
  });

  it("'Keep it on this deal anyway' files it, reads it, and the review says what it found", async () => {
    const kept = await addDoc(dealId, "Ayala contract.pdf", "contract");
    await run.runAmendmentRead(dealId, [kept]);
    expect((await doc(kept)).held).toBeTruthy();
    // Clear any open review first so this one is its own.
    await db.query("update extractions set status = 'dismissed' where transaction_id = $1 and status = 'ready'", [dealId]);
    await actions.keepHeldDocument(kept); await settle();
    const d = await doc(kept);
    expect([d.held, d.held_override, d.slot]).toEqual([null, true, "contract"]);
    const ready = (await reviews(dealId)).filter((x) => x.status === "ready").at(-1);
    expect(ready.document_ids).toEqual([kept]);
    expect(ready.result.kept_mismatch[0]).toMatchObject({ file_name: "Ayala contract.pdf", property_street: "2312 145th St" });
    const heading = reviewHeading({ docNames: ["Ayala contract.pdf"], dealStreet: "4002 97th Street", seen: ready.result.seen, kept: ready.result.kept_mismatch, promotes: false, nothing: false });
    expect(heading.title).toBe("You kept a document that doesn't match this deal");
    const ev = (await db.query<any>("select kind from transaction_events where transaction_id = $1 order by created_at desc limit 1", [dealId])).rows[0];
    expect(ev.kind).toBe("document_kept");
    await db.query("update extractions set status = 'dismissed' where transaction_id = $1 and status = 'ready'", [dealId]);
  });

  it("'Wrong deal' moves it to the deal it belongs to, where it fits", async () => {
    const r = await actions.moveHeldDocument(ayala, otherId).then(() => null, (e) => e);
    expect(r).toBeInstanceOf(Redirect);
    expect((r as Redirect).to).toBe(`/t/${otherId}`);
    await settle();
    const d = await doc(ayala);
    expect(d.transaction_id).toBe(otherId);
    expect(d.held).toBeNull();
    expect(d.slot).toBe("contract");   // filed on the right deal by the reader
    const ev = (await db.query<any>("select summary from transaction_events where transaction_id = $1 and kind = 'document_moved'", [dealId])).rows[0];
    expect(ev.summary).toBe("Moved Ayala contract.pdf to 2312 145th St");
  });
});

describe("4. Remove on a filed document", () => {
  it("deletes the row and the file, and notes it in the history", async () => {
    const id = await addDoc(dealId, "HOA letter.pdf", "other");
    const path = (await doc(id)).storage_path;
    await actions.removeDocument(id); await settle();
    expect(await doc(id)).toBeUndefined();
    expect(h.sb.storage.removed).toContain(`documents/${path}`);
    expect(h.sb.storage.files.has(`documents/${path}`)).toBe(false);
    const ev = (await db.query<any>("select kind, summary from transaction_events where transaction_id = $1 order by created_at desc limit 1", [dealId])).rows[0];
    expect(ev).toEqual({ kind: "document_removed", summary: "Removed HOA letter.pdf" });
  });
  it("removing a document a review was built on sets that review aside and re-checks the rest", async () => {
    const a = await addDoc(dealId, "Amendment.pdf");
    const hoa = await addDoc(dealId, "HOA letter.pdf");
    await run.runAmendmentRead(dealId, [a, hoa]);
    expect((await reviews(dealId)).filter((x) => x.status === "ready").at(-1).document_ids).toEqual([a, hoa]);
    h.reads = [];
    await actions.removeDocument(a); await settle();
    expect(h.reads).toEqual([["HOA letter.pdf"]]);
    expect((await reviews(dealId)).filter((x) => x.status === "ready").every((x) => !x.document_ids.includes(a))).toBe(true);
  });
  it("can't remove a document on a deal you can't see", async () => {
    await expect(actions.removeDocument(crypto.randomUUID())).rejects.toThrow("Document not found.");
  });
});
