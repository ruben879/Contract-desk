import { describe, expect, it } from "vitest";
import { freshDb, seedBrokerage } from "./harness";

const insertForm = (b: string) => `insert into library_forms (brokerage_id, display_name, form_class) values ('${b}', 'Sale of Other Property', 'TXR') returning id`;

describe("Form Library isolation (brokerage A vs B)", () => {
  it("brokerage B cannot see A's form, its versions, or its acknowledgments", async () => {
    const { db, as } = await freshDb();
    const A = await seedBrokerage(db, "A"), B = await seedBrokerage(db, "B");
    const brokerA = await A.member("broker"), brokerB = await B.member("broker"), agentB = await B.member("agent");
    const [form] = await as<{ id: string }>(brokerA.userId, insertForm(A.brokerageId));
    await as(brokerA.userId, `insert into library_form_versions (brokerage_id, form_id, version, storage_path, sha256, file_name, page_count, fields)
      values ($1, $2, 1, $3, 'x', 'f.pdf', 1, '[]')`, [A.brokerageId, form.id, `${A.brokerageId}/${form.id}/v1.pdf`]);
    await as(brokerA.userId, "insert into form_acknowledgments (brokerage_id, form_id, user_id, text_version, reason) values ($1,$2,$3,'txr-v1','upload')",
      [A.brokerageId, form.id, brokerA.userId]);
    for (const u of [brokerB.userId, agentB.userId]) {
      expect(await as(u, "select id from library_forms")).toEqual([]);
      expect(await as(u, "select id from library_form_versions")).toEqual([]);
      expect(await as(u, "select id from form_acknowledgments")).toEqual([]);
    }
    expect(await as(brokerA.userId, "select id from library_forms")).toHaveLength(1);
  });

  it("agents can see their library but cannot upload, map, rename, or reclassify", async () => {
    const { db, as } = await freshDb();
    const A = await seedBrokerage(db, "A");
    const broker = await A.member("broker"), agent = await A.member("agent");
    const [form] = await as<{ id: string }>(broker.userId, insertForm(A.brokerageId));
    expect(await as(agent.userId, "select id from library_forms")).toHaveLength(1);
    await expect(as(agent.userId, insertForm(A.brokerageId))).rejects.toThrow(/row-level security/);
    expect(await as(agent.userId, "update library_forms set display_name = 'x', form_class = 'Brokerage' where id = $1 returning id", [form.id])).toEqual([]);
  });

  it("an uploaded version's file can never be swapped", async () => {
    const { db, as } = await freshDb();
    const A = await seedBrokerage(db, "A");
    const broker = await A.member("broker");
    const [form] = await as<{ id: string }>(broker.userId, insertForm(A.brokerageId));
    const [v] = await as<{ id: string }>(broker.userId, `insert into library_form_versions (brokerage_id, form_id, version, storage_path, sha256, file_name, page_count, fields)
      values ($1, $2, 1, 'p1', 'aaa', 'f.pdf', 1, '[]') returning id`, [A.brokerageId, form.id]);
    await expect(as(broker.userId, "update library_form_versions set sha256 = 'bbb' where id = $1", [v.id])).rejects.toThrow(/cannot be changed/);
    expect(await as(broker.userId, "update library_form_versions set field_map = '{\"a\":{\"blank\":true}}' where id = $1 returning id", [v.id])).toHaveLength(1);
  });
});

describe("offers", () => {
  it("agents see their own offers; broker sees all; other brokerages none; packets are server-written only", async () => {
    const { db, as } = await freshDb();
    const A = await seedBrokerage(db, "A"), B = await seedBrokerage(db, "B");
    const broker = await A.member("broker"), a1 = await A.member("agent"), a2 = await A.member("agent"), out = await B.member("broker");
    const [o] = await as<{ id: string }>(a1.userId, "insert into offers (brokerage_id, agent_member_id) values ($1,$2) returning id", [A.brokerageId, a1.memberId]);
    expect(await as(a1.userId, "select id from offers")).toHaveLength(1);
    expect(await as(a2.userId, "select id from offers")).toHaveLength(0);
    expect(await as(broker.userId, "select id from offers")).toHaveLength(1);
    expect(await as(out.userId, "select id from offers")).toHaveLength(0);
    await expect(as(a1.userId, "insert into offer_packets (brokerage_id, offer_id, version, storage_path, file_name, sha256, forms, terms_snapshot) values ($1,$2,1,'p','f','s','[]','{}')",
      [A.brokerageId, o.id])).rejects.toThrow(/row-level security/);
  });
});
