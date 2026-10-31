import { expireStaleReads } from "@/lib/extract/stale";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Badge, Button, Card, inputCls } from "@/components/ui";
import { SLOT_LABEL } from "@/lib/slots";
import type { Triage } from "@/lib/extract/schema";
import { attachToDeal, discard, startDeal } from "./actions";

export const maxDuration = 300; // server actions here start reads in the background

const addr = (d: { property_street: string | null; property_city: string | null }) =>
  [d.property_street, d.property_city].filter(Boolean).join(", ") || "Address not confirmed";

export default async function SortPage() {
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  await expireStaleReads(brokerage.id);

  const [{ data: items }, { data: deals }, { data: team }] = await Promise.all([
    supabase.from("intake_items").select("*").eq("status", "needs_sorting").order("created_at"),
    supabase.from("transactions").select("id, status, property_street, property_city, agent_member_id").in("status", ["active", "needs_review", "reading", "failed"]).order("property_street"),
    supabase.from("brokerage_members").select("id, full_name, email").eq("brokerage_id", brokerage.id),
  ]);
  const who = (id: string | null) => { const m = team?.find((t) => t.id === id); return m ? m.full_name || m.email : "Unassigned"; };
  // Deals not yet confirmed have no confirmed address; show what the reader found, marked as a draft.
  const draftIds = (deals ?? []).filter((d) => d.status !== "active").map((d) => d.id);
  const { data: drafts } = draftIds.length
    ? await supabase.from("extractions").select("transaction_id, result").in("transaction_id", draftIds).eq("kind", "initial").eq("status", "ready")
    : { data: [] };
  const draftAddr = new Map((drafts ?? []).map((x: any) => [x.transaction_id, x.result?.property_street?.value as string | null]));
  for (const d of deals ?? []) {
    if (d.status !== "active") (d as any).property_street = `Draft: ${draftAddr.get(d.id) ?? "address not read yet"}`;
  }
  const dealById = new Map((deals ?? []).map((d) => [d.id, d]));

  const withDocs = await Promise.all((items ?? []).map(async (it) => {
    const { data: docs } = await supabase.from("documents").select("id, file_name, storage_path, slot").eq("intake_item_id", it.id).is("transaction_id", null);
    const signed = await Promise.all((docs ?? []).map(async (d) => ({
      ...d, url: (await supabase.storage.from("documents").createSignedUrl(d.storage_path, 3600)).data?.signedUrl,
    })));
    return { ...it, docs: signed };
  }));

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings={isBrokerOrStaff}>
      <h1 className="text-xl font-bold">Needs sorting</h1>
      <p className="mt-1 text-sm text-muted">Emailed documents we couldn't place with certainty. Nothing is attached to a deal until you choose.</p>

      {withDocs.length === 0 && <Card className="mt-4 text-center text-muted">All sorted.</Card>}

      <div className="mt-4 space-y-4">
        {withDocs.map((it) => {
          const t = it.triage as Triage | null;
          const candidates = (it.candidate_transaction_ids as string[]).map((id) => dealById.get(id)).filter((d): d is NonNullable<typeof d> => !!d);
          const others = (deals ?? []).filter((d) => !it.candidate_transaction_ids.includes(d.id));
          return (
            <Card key={it.id} className="space-y-3">
              <div>
                <div className="font-semibold">{it.subject || "(no subject)"}</div>
                <div className="text-xs text-muted">
                  From {it.from_email ?? "unknown"} · {new Date(it.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: brokerage.timezone })}
                  {it.member_id && <> · sent to {who(it.member_id)}'s address</>}
                </div>
              </div>

              <div className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{it.reason}</div>

              {t && (
                <div className="text-sm">
                  {t.summary && <div>{t.summary}</div>}
                  <div className="text-xs text-muted">
                    Address on the documents: {t.property_street ? [t.property_street, t.property_city, t.property_zip].filter(Boolean).join(", ") : "not readable"}
                    {t.property_street && t.address_confidence !== "high" && <> <Badge tone="warn">{t.address_confidence} confidence</Badge></>}
                  </div>
                </div>
              )}

              <ul className="space-y-1 text-sm">
                {it.docs.map((d: { id: string; file_name: string; slot: string | null; url?: string }) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <a href={d.url} target="_blank" className="truncate text-brand">{d.file_name}</a>
                    {d.slot && <span className="shrink-0 text-xs text-muted">{SLOT_LABEL[d.slot]}</span>}
                  </li>
                ))}
              </ul>

              {candidates.length > 0 && (
                <div className="space-y-2">
                  {candidates.map((d, i) => (
                    <form key={d.id} action={attachToDeal.bind(null, it.id)}>
                      <input type="hidden" name="transaction_id" value={d.id} />
                      <Button size="lg" variant={i === 0 ? "primary" : "quiet"} className={i === 0 ? "" : "border border-brand"}>
                        Attach to {addr(d)} · {who(d.agent_member_id)}
                      </Button>
                    </form>
                  ))}
                </div>
              )}

              <form action={attachToDeal.bind(null, it.id)} className="flex gap-2">
                <select name="transaction_id" required defaultValue="" className={inputCls}>
                  <option value="" disabled>{candidates.length ? "Or pick another deal" : "Pick the deal this belongs to"}</option>
                  {others.map((d) => <option key={d.id} value={d.id}>{addr(d)} · {who(d.agent_member_id)}</option>)}
                </select>
                <Button variant={candidates.length ? "quiet" : "primary"} className="shrink-0">Attach</Button>
              </form>

              <div className="flex flex-wrap gap-4 border-t border-line pt-3 text-sm">
                <form action={startDeal.bind(null, it.id)}><button className="font-medium text-brand">Start a new deal from this</button></form>
                <form action={discard.bind(null, it.id)}><button className="text-muted hover:text-bad">Not a deal document</button></form>
              </div>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
