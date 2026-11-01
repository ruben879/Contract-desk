import { describe, expect, it } from "vitest";
import { freshDb, seedBrokerage } from "./harness";

// Comments and mentions under real row-level security (migration 0006).
async function setup() {
  const { db, as } = await freshDb();
  const crr = await seedBrokerage(db);
  const broker = await crr.member("broker");
  const agentA = await crr.member("agent");
  const agentB = await crr.member("agent");
  const other = await seedBrokerage(db, "Other Realty");
  const outsider = await other.member("broker");
  const tx = (await db.query<{ id: string }>(
    "insert into transactions (brokerage_id, agent_member_id, source, status) values ($1,$2,'upload','active') returning id",
    [crr.brokerageId, agentA.memberId])).rows[0].id;
  return { db, as, crr, broker, agentA, agentB, outsider, tx };
}

const post = (as: any, u: { userId: string; memberId: string }, tx: string, body = "hello") =>
  as(u.userId, "insert into deal_comments (transaction_id, brokerage_id, author_member_id, body) values ($1, gen_random_uuid(), $2, $3) returning id, brokerage_id", [tx, u.memberId, body]);

describe("deal comments", () => {
  it("the assigned agent and the broker can post and read; brokerage comes from the deal", async () => {
    const { as, crr, broker, agentA, tx } = await setup();
    const [c] = await post(as, agentA, tx, "Need the LBP addendum");
    expect(c.brokerage_id).toBe(crr.brokerageId);
    await post(as, broker, tx, "On it");
    expect(await as(agentA.userId, "select body from deal_comments where transaction_id = $1", [tx])).toHaveLength(2);
  });

  it("an agent not on the deal and another brokerage see nothing and can't post", async () => {
    const { as, agentA, agentB, outsider, tx } = await setup();
    await post(as, agentA, tx);
    expect(await as(agentB.userId, "select id from deal_comments")).toHaveLength(0);
    expect(await as(outsider.userId, "select id from deal_comments")).toHaveLength(0);
    await expect(post(as, agentB, tx)).rejects.toThrow();
    await expect(post(as, outsider, tx)).rejects.toThrow();
  });

  it("you can't post as someone else, and only the author can delete", async () => {
    const { as, broker, agentA, tx } = await setup();
    await expect(post(as, { ...broker, memberId: agentA.memberId }, tx)).rejects.toThrow();
    const [c] = await post(as, agentA, tx);
    expect(await as(broker.userId, "delete from deal_comments where id = $1 returning id", [c.id])).toHaveLength(0);
    expect(await as(agentA.userId, "delete from deal_comments where id = $1 returning id", [c.id])).toHaveLength(1);
  });
});

describe("mentions", () => {
  it("author mentions someone on the deal; they see it, mark it read, and nobody else can", async () => {
    const { as, crr, broker, agentA, tx } = await setup();
    const [c] = await post(as, agentA, tx, "@broker please look");
    await as(agentA.userId, "insert into comment_mentions (comment_id, member_id, brokerage_id, transaction_id) values ($1,$2,$3,$4)", [c.id, broker.memberId, crr.brokerageId, tx]);
    const unread = await as(broker.userId, "select comment_id from comment_mentions where member_id = $1 and read_at is null", [broker.memberId]);
    expect(unread).toHaveLength(1);
    // Direct updates are not allowed; the function marks only your own.
    expect(await as(agentA.userId, "update comment_mentions set read_at = now() returning 1")).toHaveLength(0);
    expect((await as(agentA.userId, "select mark_mentions_read($1) as n", [tx]))[0].n).toBe(0);
    expect((await as(broker.userId, "select mark_mentions_read($1) as n", [tx]))[0].n).toBe(1);
    expect(await as(broker.userId, "select 1 from comment_mentions where read_at is null")).toHaveLength(0);
  });

  it("can't mention someone who can't open the deal, or add mentions to another person's comment", async () => {
    const { as, crr, broker, agentA, agentB, tx } = await setup();
    const [c] = await post(as, agentA, tx);
    await expect(as(agentA.userId, "insert into comment_mentions (comment_id, member_id, brokerage_id, transaction_id) values ($1,$2,$3,$4)",
      [c.id, agentB.memberId, crr.brokerageId, tx])).rejects.toThrow();
    await expect(as(broker.userId, "insert into comment_mentions (comment_id, member_id, brokerage_id, transaction_id) values ($1,$2,$3,$4)",
      [c.id, broker.memberId, crr.brokerageId, tx])).rejects.toThrow();
  });
});

describe("migration 0005", () => {
  it("adds the HOA deadline rule to existing and new brokerages, survey no longer defaults", async () => {
    const { db } = await freshDb();
    const { brokerageId } = await seedBrokerage(db);
    const rows = (await db.query<{ key: string; default_days: number | null }>("select key, default_days from deadline_rules where brokerage_id = $1 order by sort", [brokerageId])).rows;
    expect(rows.map((r) => r.key)).toEqual(["earnest_money", "option_end", "title_commitment", "survey", "closing", "hoa_info"]);
    expect(rows.find((r) => r.key === "survey")!.default_days).toBeNull();
  });
  it("backfills hoa_info for brokerages that existed before it", async () => {
    const { db } = await freshDb("0004");
    const { brokerageId } = await seedBrokerage(db);
    const fs = await import("node:fs"); const path = await import("node:path");
    await db.exec(fs.readFileSync(path.join(__dirname, "../../supabase/migrations/0005_checklist_gaps.sql"), "utf8"));
    const keys = (await db.query<{ key: string }>("select key from deadline_rules where brokerage_id = $1", [brokerageId])).rows.map((r) => r.key);
    expect(keys).toContain("hoa_info");
  });
});
