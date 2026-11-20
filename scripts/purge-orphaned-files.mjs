// Storage hygiene: find files in the "documents" bucket that no document row points to, and
// (only with --delete) remove them. Run from the repo with the live keys in your shell, never in chat:
//
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/purge-orphaned-files.mjs
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/purge-orphaned-files.mjs --delete
//
// The first run only lists. Nov 18: the removed Ayala contract left
// .../36905706-8476-458f-a5ca-f4b5ca51937c.pdf behind; it should be on the list.
// Files under offer-sources/ (offer fills read and then removed) are skipped if under a day old.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first."); process.exit(1); }
const doDelete = process.argv.includes("--delete");
const db = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = "documents";

async function listAll(prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const e of data) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...(await listAll(path)));   // a folder
      else out.push({ path, created: e.created_at });
    }
    if (data.length < 1000) return out;
  }
}

const files = await listAll();
const known = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("documents").select("storage_path").range(from, from + 999);
  if (error) throw error;
  data.forEach((d) => known.add(d.storage_path));
  if (data.length < 1000) break;
}
const dayAgo = Date.now() - 24 * 3600 * 1000;
const orphans = files.filter((f) => !known.has(f.path) && !(f.path.includes("/offer-sources/") && new Date(f.created).getTime() > dayAgo));

console.log(`${files.length} files in "${BUCKET}", ${known.size} document rows, ${orphans.length} orphaned:`);
for (const o of orphans) console.log(`  ${o.path}  (${o.created})`);
if (!orphans.length) process.exit(0);
if (!doDelete) { console.log("\nNothing deleted. Run again with --delete to remove these."); process.exit(0); }
for (let i = 0; i < orphans.length; i += 100) {
  const { error } = await db.storage.from(BUCKET).remove(orphans.slice(i, i + 100).map((o) => o.path));
  if (error) { console.error("Remove failed:", error.message); process.exit(1); }
}
console.log(`Deleted ${orphans.length} file(s).`);
