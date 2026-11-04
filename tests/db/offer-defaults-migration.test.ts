import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { freshDb, seedBrokerage } from "./harness";

describe("migration 0011: title payer and survey join the offer settings", () => {
  it("seeds Clear Rock's values, keeps anything the brokerage already changed, and new brokerages get all keys", async () => {
    const { db } = await freshDb("0010");
    const { brokerageId: b } = await seedBrokerage(db);
    await db.query(`update brokerages set offer_defaults = offer_defaults || '{"earnest_pct": 2}'::jsonb where id = $1`, [b]);
    await db.exec(fs.readFileSync("supabase/migrations/0011_offer_choice_defaults.sql", "utf8"));
    const [row] = (await db.query<{ d: any }>("select offer_defaults d from brokerages where id = $1", [b])).rows;
    expect(row.d).toMatchObject({ earnest_pct: 2, option_period_days: 10, title_policy_payer: "seller", survey_option: "seller_existing", survey_days: 5, survey_new_payer: "buyer" });
    const { brokerageId: fresh } = await seedBrokerage(db, "Another");
    const [n] = (await db.query<{ d: any }>("select offer_defaults d from brokerages where id = $1", [fresh])).rows;
    expect(n.d).toMatchObject({ earnest_pct: 1, title_policy_payer: "seller", survey_option: "seller_existing", survey_days: 5, survey_new_payer: "buyer" });
  }, 30_000);
});
