import { describe, expect, it } from "vitest";
import { freshDb, seedBrokerage } from "./harness";

// Regression for the Oct 31 live failure: the first upload's
// insert into transactions ... returning id was rejected by row-level security.

describe("starting a deal as a signed-in user", () => {
  it("broker can create a deal and read back its id (insert ... returning)", async () => {
    const { db, as } = await freshDb();
    const { brokerageId, member } = await seedBrokerage(db);
    const broker = await member("broker");
    const rows = await as(broker.userId,
      "insert into transactions (brokerage_id, agent_member_id, created_by, source, status) values ($1,$2,$3,'upload','reading') returning id",
      [brokerageId, broker.memberId, broker.userId]);
    expect(rows).toHaveLength(1);
  });

  it("agent can create their own deal and add its documents", async () => {
    const { db, as } = await freshDb();
    const { brokerageId, member } = await seedBrokerage(db);
    const agent = await member("agent");
    const [tx] = await as(agent.userId,
      "insert into transactions (brokerage_id, agent_member_id, created_by, source, status) values ($1,$2,$3,'upload','reading') returning id",
      [brokerageId, agent.memberId, agent.userId]);
    const docs = await as(agent.userId,
      "insert into documents (brokerage_id, transaction_id, storage_path, file_name, source) values ($1,$2,'p','contract.pdf','upload') returning id",
      [brokerageId, tx.id]);
    expect(docs).toHaveLength(1);
  });
});

describe("the app's upload code works even before migration 0004 is applied", () => {
  it("insert with an app-chosen id and no RETURNING succeeds on the 0001-0003 schema", async () => {
    const { db, as } = await freshDb("0003");
    const { brokerageId, member } = await seedBrokerage(db);
    const broker = await member("broker");
    const id = crypto.randomUUID();
    await as(broker.userId, "insert into transactions (id, brokerage_id, agent_member_id, created_by, source, status) values ($1,$2,$3,$4,'upload','reading')",
      [id, brokerageId, broker.memberId, broker.userId]);
    const seen = await as(broker.userId, "select id from transactions where id = $1", [id]);
    expect(seen).toHaveLength(1);
    // and its documents (signed upload rows) go in too
    await as(broker.userId, "insert into documents (brokerage_id, transaction_id, storage_path, file_name, source) values ($1,$2,'p','c.pdf','upload')", [brokerageId, id]);
  });
});

describe("isolation still holds", () => {
  it("an agent cannot create a deal assigned to someone else, or in another brokerage", async () => {
    const { db, as } = await freshDb();
    const crr = await seedBrokerage(db);
    const other = await seedBrokerage(db, "Other");
    const agent = await crr.member("agent");
    const colleague = await crr.member("agent");
    await expect(as(agent.userId,
      "insert into transactions (brokerage_id, agent_member_id, source) values ($1,$2,'upload') returning id",
      [other.brokerageId, agent.memberId])).rejects.toThrow(/row-level security/);
    await expect(as(agent.userId,
      "insert into transactions (brokerage_id, agent_member_id, source) values ($1,$2,'upload') returning id",
      [crr.brokerageId, colleague.memberId])).rejects.toThrow(/row-level security/);
  });

  it("agents see only their own deals; broker sees all; other brokerages see none", async () => {
    const { db, as } = await freshDb();
    const crr = await seedBrokerage(db);
    const other = await seedBrokerage(db, "Other");
    const broker = await crr.member("broker"), a = await crr.member("agent"), b = await crr.member("agent");
    const outsider = await other.member("broker");
    for (const m of [a, b]) await db.query("insert into transactions (brokerage_id, agent_member_id, source) values ($1,$2,'upload')", [crr.brokerageId, m.memberId]);
    const count = async (u: string) => (await as<{ n: number }>(u, "select count(*)::int n from transactions"))[0].n;
    expect(await count(broker.userId)).toBe(2);
    expect(await count(a.userId)).toBe(1);
    expect(await count(outsider.userId)).toBe(0);
  });
});
