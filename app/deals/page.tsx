import Link from "next/link";
import { expireStaleReads } from "@/lib/extract/stale";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Dropzone } from "@/components/Dropzone";
import { NewMenu } from "@/components/NewMenu";
import { cx, money } from "@/components/ui";
import { startUpload } from "@/app/actions";
import { daysBetween, formatShort, todayIn } from "@/lib/dates";
import { dealStatus } from "@/lib/deal-status";
import { OFFER_STATUS_LABEL } from "@/lib/offer/terms";

type Row = {
  id: string; status: string; stage: string | null; listing_expiration_date: string | null;
  property_street: string | null; property_city: string | null; sales_price: number | null; list_price: number | null;
  deadlines: { key: string; label: string; due_date: string }[];
  checklist_items: { title: string; status: string; deadline_key: string | null; sort: number }[];
  documents: { file_name: string }[];
};

type Tone = "bad" | "warn" | "muted";
const toneCls = (t: Tone) => (t === "bad" ? "font-medium text-bad" : t === "warn" ? "font-medium text-warn" : "text-muted");

/** One card: address big, a status line with the price, then the single next step. The whole card is the tap target. */
function DealCard({ href, address, status, step, tone }: { href: string; address: string; status: string; step: string; tone: Tone }) {
  return (
    <li>
      <Link href={href} className="block rounded-card bg-card px-4 py-3.5 shadow-card ring-brand transition hover:ring-2">
        <div className="text-[18px] font-semibold leading-snug">{address}</div>
        <div className="text-[15px] text-ink/80">{status}</div>
        <div className={cx("mt-0.5 text-[15px]", toneCls(tone))}>{step}</div>
      </Link>
    </li>
  );
}

// Deals and Offers, as two tabs (Ruben, Nov 18). The page's main job is getting back into an
// existing deal; starting something new is the one New button.
export default async function Deals({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  const tab = (await searchParams).tab === "offers" ? "offers" : "deals";
  await expireStaleReads(brokerage.id);
  const today = todayIn(brokerage.timezone);

  // Nov 20 fix: the deals query must not depend on documents.held (migration 0013). When that column
  // was missing, the whole query errored, the error was ignored, and Deals showed 0. The held count
  // now comes from its own query, and a failed deals query says so instead of "No open deals yet".
  const [{ data, error: dealsError }, { data: pending }, { data: offers }, { data: heldDocs }] = await Promise.all([
    supabase.from("transactions")
      .select("id, status, stage, listing_expiration_date, property_street, property_city, sales_price, list_price, deadlines(key, label, due_date), checklist_items(title, status, deadline_key, sort), documents(file_name)")
      .in("status", ["reading", "needs_review", "failed", "active"]).order("created_at", { ascending: false }).returns<Row[]>(),
    supabase.from("extractions").select("transaction_id").eq("kind", "amendment").eq("status", "ready"),
    // Offers not yet executed. Tolerates the offers table not existing yet (before migration 0009).
    supabase.from("offers").select("id, status, terms, edited_since_export, updated_at").neq("status", "executed").order("updated_at", { ascending: false }).limit(50),
    // Documents stopped at the door. If this fails (e.g. before migration 0013), the list still shows.
    supabase.from("documents").select("transaction_id").not("held", "is", null),
  ]);
  if (dealsError) console.error("[deals] couldn't load deals:", dealsError.message);
  const heldCount = new Map<string, number>();
  for (const d of heldDocs ?? []) heldCount.set(d.transaction_id, (heldCount.get(d.transaction_id) ?? 0) + 1);
  const amended = new Set((pending ?? []).map((p) => p.transaction_id));

  const deals = (data ?? []).map((r) => {
    const address = r.property_street ? [r.property_street, r.property_city].filter(Boolean).join(", ") : r.documents[0]?.file_name ?? "New contract";
    const due = new Map(r.deadlines.map((d) => [d.key, d.due_date]));
    const late = r.checklist_items
      .filter((i) => i.status === "open" && i.deadline_key && (due.get(i.deadline_key) ?? "9999") < today)
      .sort((a, b) => due.get(a.deadline_key!)!.localeCompare(due.get(b.deadline_key!)!) || a.sort - b.sort);
    const next = r.deadlines.filter((d) => d.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    const held = heldCount.get(r.id) ?? 0;

    const listing = r.stage === "listing";
    const price = listing ? (r.list_price != null ? `List ${money(Number(r.list_price))}` : null) : (r.sales_price != null ? money(Number(r.sales_price)) : null);
    const label = r.status === "active" ? dealStatus({ status: r.status, today, deadlines: r.deadlines, stage: r.stage, listingExpires: r.listing_expiration_date }).label : "New deal";
    const status = [label, price].filter(Boolean).join(" · ");

    let step: string; let tone: Tone = "muted"; let rank = 3; let sortKey = next?.due_date ?? "9999";
    if (r.status === "reading") { step = "Reading the contract now"; rank = 1; }
    else if (r.status === "failed") { step = "Couldn't read it. Tap to see why."; tone = "warn"; rank = 1; }
    else if (r.status === "needs_review") { step = "Check what we read"; tone = "warn"; rank = 1; }
    else if (held) { step = held === 1 ? "A document doesn't match this deal" : `${held} documents don't match this deal`; tone = "bad"; rank = 0; sortKey = "0000"; }
    else if (amended.has(r.id)) { step = "Review what changed"; tone = "warn"; rank = 1; }
    else if (late.length) {
      step = `Late: ${late[0].title}${late.length > 1 ? `, and ${late.length - 1} more` : ""}`; tone = "bad"; rank = 0; sortKey = due.get(late[0].deadline_key!)!;
    } else if (listing) step = r.listing_expiration_date ? `Listing expires ${formatShort(r.listing_expiration_date)}` : "Listing";
    else if (next) step = `${next.label} ${daysBetween(today, next.due_date) === 0 ? "today" : formatShort(next.due_date)}`;
    else step = "No upcoming dates";
    return { id: r.id, address, status, step, tone, rank, sortKey };
  }).sort((a, b) => a.rank - b.rank || a.sortKey.localeCompare(b.sortKey) || a.address.localeCompare(b.address));

  const offerCards = (offers ?? []).map((o) => {
    const t = (o.terms ?? {}) as { property_street?: string; property_city?: string; sales_price?: number; buyers?: string[] };
    const buyers = (t.buyers ?? []).filter(Boolean);
    return {
      id: o.id,
      address: t.property_street ? [t.property_street, t.property_city].filter(Boolean).join(", ") : "New offer",
      status: [OFFER_STATUS_LABEL[o.status as keyof typeof OFFER_STATUS_LABEL], t.sales_price != null ? money(t.sales_price) : null].filter(Boolean).join(" · "),
      step: o.edited_since_export ? "Changed since export: export it again"
        : o.status === "draft_offer" ? "Finish the terms and export"
        : buyers.length ? `Buyer${buyers.length > 1 ? "s" : ""}: ${buyers.join(", ")}` : "Waiting on signatures",
      tone: (o.edited_since_export ? "warn" : "muted") as Tone,
    };
  });

  const tabCls = (on: boolean) => cx("flex-1 rounded-lg py-2 text-center text-[15px] font-semibold",
    on ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink");

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url}>
      <div className="mb-4 mt-2 flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em]">{isBrokerOrStaff ? "Deals" : "Your deals"}</h1>
        <NewMenu />
      </div>

      <nav aria-label="Deals or offers" className="mb-4 flex gap-1 rounded-xl bg-brand-soft p-1">
        <Link href="/deals" aria-current={tab === "deals" ? "page" : undefined} className={tabCls(tab === "deals")}>
          Deals <span className="font-normal text-muted">{dealsError ? "" : deals.length}</span>
        </Link>
        <Link href="/deals?tab=offers" aria-current={tab === "offers" ? "page" : undefined} className={tabCls(tab === "offers")}>
          Offers <span className="font-normal text-muted">{offerCards.length}</span>
        </Link>
      </nav>

      {tab === "deals" ? (
        <>
          {dealsError
            ? <p className="mt-6 font-medium text-bad">Couldn't load your deals. Refresh to try again; if it keeps happening, tell Ruben.</p>
            : deals.length === 0
            ? <p className="mt-6 text-muted">No open deals yet. Tap New and start from a contract.</p>
            : <ul className="space-y-2.5">{deals.map((d) => <DealCard key={d.id} href={`/t/${d.id}`} address={d.address} status={d.status} step={d.step} tone={d.tone} />)}</ul>}
          <div className="mt-5">
            <Dropzone slim start={startUpload} label="Or drop a contract here to start a deal" />
          </div>
        </>
      ) : offerCards.length === 0 ? (
        <p className="mt-6 text-muted">No open offers. Tap New and write one.</p>
      ) : (
        <ul className="space-y-2.5">{offerCards.map((o) => <DealCard key={o.id} href={`/o/${o.id}`} {...o} />)}</ul>
      )}
    </AppShell>
  );
}
