import type { PGlite } from "@electric-sql/pglite";

// A small stand-in for the supabase-js query builder, backed by a real Postgres (PGlite) with
// every migration applied. It covers only what the confirm path uses (lib/apply.ts and the two
// confirm actions), so those can run end to end in a test. Row-level security is not applied here.

type Filter = { sql: string; params: unknown[] };
const q = (c: string) => `"${c.replace(/"/g, "")}"`;
const toParam = (v: unknown) =>
  v !== null && typeof v === "object" && !(v instanceof Date) && (!Array.isArray(v) || v.some((x) => x !== null && typeof x === "object"))
    ? JSON.stringify(v) : v;

export function pgSupabase(db: PGlite) {
  function from(table: string) {
    let op: "select" | "update" | "delete" | "insert" | "upsert" = "select";
    let values: Record<string, unknown>[] = [];
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    const filters: { col: string; kind: string; val: unknown }[] = [];
    let limit: number | null = null;
    let order: { col: string; asc: boolean } | null = null;
    let single: "one" | "maybe" | null = null;
    let head = false;

    function where(params: unknown[]): string {
      const parts = filters.map(({ col, kind, val }) => {
        if (kind === "is") return `${q(col)} is ${val === null ? "null" : "not null"}`;
        if (kind === "in") { params.push(val); return `${q(col)}::text = any($${params.length}::text[])`; }
        params.push(toParam(val));
        const opSql = { eq: "=", neq: "<>", gt: ">", lt: "<", ilike: "ilike" }[kind]!;
        return kind === "ilike" ? `${q(col)}::text ilike $${params.length}` : `${q(col)}::text ${opSql} $${params.length}::text`;
      });
      return parts.length ? ` where ${parts.join(" and ")}` : "";
    }

    async function run(): Promise<{ data: any; error: { message: string } | null; count?: number }> {
      try {
        const params: unknown[] = [];
        let sql = "";
        if (op === "select") {
          sql = `select * from ${q(table)}${where(params)}${order ? ` order by ${q(order.col)} ${order.asc ? "asc" : "desc"}` : ""}${limit ? ` limit ${limit}` : ""}`;
        } else if (op === "update") {
          const v = values[0];
          const sets = Object.keys(v).map((k) => { params.push(toParam(v[k])); return `${q(k)} = $${params.length}`; });
          sql = `update ${q(table)} set ${sets.join(", ")}${where(params)} returning *`;
        } else if (op === "delete") {
          sql = `delete from ${q(table)}${where(params)} returning *`;
        } else {
          if (!values.length) return { data: [], error: null };
          const cols = [...new Set(values.flatMap((r) => Object.keys(r)))];
          const rows = values.map((r) => `(${cols.map((c) => { params.push(c in r ? toParam(r[c]) : null); return `$${params.length}`; }).join(", ")})`);
          sql = `insert into ${q(table)} (${cols.map(q).join(", ")}) values ${rows.join(", ")}`;
          if (op === "upsert") {
            const on = (upsertOpts.onConflict ?? "id").split(",").map((s) => q(s.trim())).join(", ");
            sql += upsertOpts.ignoreDuplicates ? ` on conflict (${on}) do nothing`
              : ` on conflict (${on}) do update set ${cols.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}`;
          }
          sql += " returning *";
        }
        const rows = (await db.query<any>(sql, params)).rows;
        if (head) return { data: null, error: null, count: rows.length };
        if (single === "one") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected one row, got ${rows.length}` } };
        if (single === "maybe") return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    }

    const b: any = {
      select(_cols?: string, opts?: { head?: boolean }) { if (opts?.head) head = true; return b; },
      update(v: Record<string, unknown>) { op = "update"; values = [v]; return b; },
      delete() { op = "delete"; return b; },
      insert(v: Record<string, unknown> | Record<string, unknown>[]) { op = "insert"; values = Array.isArray(v) ? v : [v]; return b; },
      upsert(v: Record<string, unknown> | Record<string, unknown>[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = "upsert"; values = Array.isArray(v) ? v : [v]; upsertOpts = o; return b;
      },
      eq(col: string, val: unknown) { filters.push({ col, kind: "eq", val }); return b; },
      neq(col: string, val: unknown) { filters.push({ col, kind: "neq", val }); return b; },
      gt(col: string, val: unknown) { filters.push({ col, kind: "gt", val }); return b; },
      ilike(col: string, val: unknown) { filters.push({ col, kind: "ilike", val }); return b; },
      in(col: string, val: unknown[]) { filters.push({ col, kind: "in", val: val.map(String) }); return b; },
      is(col: string, val: unknown) { filters.push({ col, kind: "is", val }); return b; },
      order(col: string, o: { ascending?: boolean } = {}) { order = { col, asc: o.ascending !== false }; return b; },
      limit(n: number) { limit = n; return b; },
      returns() { return b; },
      single() { single = "one"; return run(); },
      maybeSingle() { single = "maybe"; return run(); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return run().then(res, rej); },
    };
    return b;
  }
  return { from } as any;
}
