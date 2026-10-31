import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

// Real Postgres (PGlite) with Supabase's auth and storage stubbed, every migration applied,
// and a helper that runs SQL as a signed-in user so row-level security is actually enforced.

const MIGRATIONS = path.join(__dirname, "../../supabase/migrations");

/** upTo: apply only migrations whose file name sorts at or before it (e.g. "0003" = production before the fix). */
export async function freshDb(upTo?: string) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
    create role authenticated;`);
  for (const f of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && (!upTo || f.slice(0, upTo.length) <= upTo)).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
  }
  await db.exec(`grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant usage on schema auth to authenticated;`);

  /** Run SQL as a signed-in user, exactly as PostgREST does (role authenticated + JWT sub). */
  async function as<T = any>(userId: string, sql: string, params: unknown[] = []) {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
    try { return (await db.query<T>(sql, params)).rows; }
    finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
  }
  return { db, as };
}

let n = 0;
export async function seedBrokerage(db: PGlite, name = "Clear Rock Realty") {
  const b = (await db.query<{ id: string }>("insert into brokerages (name, slug) values ($1, $2) returning id", [name, `b${++n}`])).rows[0].id;
  async function member(role: "broker" | "agent" | "staff") {
    const userId = crypto.randomUUID();
    await db.query("insert into auth.users values ($1, $2)", [userId, `${userId}@x.com`]);
    const id = (await db.query<{ id: string }>("insert into brokerage_members (brokerage_id, user_id, email, role) values ($1,$2,$3,$4) returning id",
      [b, userId, `${userId}@x.com`, role])).rows[0].id;
    return { userId, memberId: id };
  }
  return { brokerageId: b, member };
}
