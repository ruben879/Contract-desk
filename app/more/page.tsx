import Link from "next/link";
import { requireMember, memberIntakeAddress, missingProfile } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { CopyText } from "@/components/CopyText";
import { Card } from "@/components/ui";

function Row({ href, title, line }: { href: string; title: string; line: string }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-paper">
        <span className="min-w-0">
          <span className="block font-medium">{title}</span>
          <span className="block text-[15px] text-muted">{line}</span>
        </span>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-muted" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
      </Link>
    </li>
  );
}

// Everything that isn't today's work, one tap away.
export default async function More() {
  const { supabase, member, brokerage, isBrokerOrStaff } = await requireMember();
  const { count: toSort } = await supabase.from("intake_items").select("id", { count: "exact", head: true }).eq("status", "needs_sorting");
  const missing = missingProfile(member, brokerage, isBrokerOrStaff);

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url}>
      <h1 className="mb-4 mt-2 text-[26px] font-semibold leading-tight tracking-[-0.01em]">More</h1>
      <ul className="overflow-hidden rounded-card bg-card shadow-card">
        <Row href="/queue" title={isBrokerOrStaff ? "Mentions and the TC queue" : "Mentions"}
          line={isBrokerOrStaff ? "Comments that mention you, and every late or due task across the brokerage" : "Comments that mention you, across your deals"} />
        {!!toSort && <Row href="/sort" title="Emailed documents to sort" line="We couldn't tell which deal these belong to" />}
        <Row href="/profile" title="Your profile" line={missing.agent.length ? `Add your ${missing.agent.join(", ")}` : "Name, license number, phone"} />
        {isBrokerOrStaff && <Row href="/settings" title="Settings" line={missing.firm.length ? `Add the brokerage ${missing.firm.join(", ")}` : "Brokerage profile, team, deadline day counts"} />}
      </ul>

      <h2 className="mb-2 mt-7 text-[15px] font-semibold">Forward contracts by email</h2>
      <Card>
        <CopyText text={memberIntakeAddress(member.intake_token)} />
        <p className="mt-1 text-sm text-muted">Your personal address. Forward the executed contract here and the deal starts itself on your list.</p>
      </Card>
    </AppShell>
  );
}
