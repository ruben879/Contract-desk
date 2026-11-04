import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember, intakeAddress } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { CopyText } from "@/components/CopyText";
import { LogoUpload } from "@/components/LogoUpload";
import { Badge, Button, Card, SectionTitle, inputCls } from "@/components/ui";
import { CONTRACT_ANCHORS, CONTRACT_DAY_KEYS, findCycle } from "@/lib/deadlines/compute";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;

async function saveBrokerage(fd: FormData) {
  "use server";
  const { supabase, isBrokerOrStaff, brokerage } = await requireMember();
  if (!isBrokerOrStaff) return;
  await supabase.from("brokerages").update({
    name: s(fd, "name") ?? brokerage.name, license_number: s(fd, "license_number"),
    address_street: s(fd, "address_street"), address_city: s(fd, "address_city"), address_state: s(fd, "address_state") ?? "TX",
    address_zip: s(fd, "address_zip"), phone: s(fd, "phone"),
    broker_name: s(fd, "broker_name"), broker_license_number: s(fd, "broker_license_number"),
  }).eq("id", brokerage.id);
  revalidatePath("/", "layout");
  redirect("/settings?saved=brokerage");
}

async function saveLogo(path: string) {
  "use server";
  const { supabase, isBrokerOrStaff, brokerage } = await requireMember();
  if (!isBrokerOrStaff || !path.startsWith(`${brokerage.id}/`)) return;
  await supabase.from("brokerages").update({ logo_path: path }).eq("id", brokerage.id);
  revalidatePath("/", "layout");
}

async function saveRules(fd: FormData) {
  "use server";
  const { supabase, isBrokerOrStaff, member } = await requireMember();
  if (!isBrokerOrStaff) return;
  const { data: rules } = await supabase.from("deadline_rules").select("id, key, anchor").eq("brokerage_id", member.brokerage_id);
  const keys = new Set((rules ?? []).map((r) => r.key));
  const proposed = (rules ?? []).map((r) => {
    const a = String(fd.get(`anchor_${r.id}`) ?? r.anchor);
    return { ...r, anchor: a in CONTRACT_ANCHORS || (keys.has(a) && a !== r.key) ? a : r.anchor };
  });
  if (findCycle(proposed)) redirect("/settings?error=loop");

  for (const r of proposed) {
    const days = String(fd.get(`days_${r.id}`) ?? "").trim();
    const time = String(fd.get(`time_${r.id}`) ?? "").trim();
    await supabase.from("deadline_rules").update({
      anchor: r.anchor,
      default_days: days === "" ? null : Math.max(-365, Math.min(365, parseInt(days, 10) || 0)),
      due_time: time || null,
      roll_weekends_holidays: fd.get(`roll_${r.id}`) === "on",
      needs_verification: fd.get(`verified_${r.id}`) !== "on",
      updated_at: new Date().toISOString(),
    }).eq("id", r.id).eq("brokerage_id", member.brokerage_id);
  }
  revalidatePath("/settings");
  redirect("/settings?saved=rules");
}

async function addMember(fd: FormData) {
  "use server";
  const { supabase, isBrokerOrStaff, member } = await requireMember();
  if (!isBrokerOrStaff) return;
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email) return;
  await supabase.from("brokerage_members").upsert({
    brokerage_id: member.brokerage_id, email, full_name: s(fd, "full_name"),
    role: String(fd.get("role") ?? "agent"), active: true,
  }, { onConflict: "brokerage_id,email" });
  revalidatePath("/settings");
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  if (!isBrokerOrStaff) redirect("/");

  const [{ data: rules }, { data: team }, { data: emails }] = await Promise.all([
    supabase.from("deadline_rules").select("*").eq("brokerage_id", brokerage.id).order("sort"),
    supabase.from("brokerage_members").select("id, email, full_name, role, user_id, active, license_number").eq("brokerage_id", brokerage.id).order("full_name"),
    supabase.from("intake_emails").select("id, from_email, subject, attachment_count, outcome, received_at, transaction_id, intake_items(status, reason, transaction_id)")
      .eq("brokerage_id", brokerage.id).order("received_at", { ascending: false }).limit(10),
  ]);
  const fate = (e: any): { text: string; tone: "good" | "warn" | "bad" | "neutral"; href?: string } => {
    const it = e.intake_items, tx = it?.transaction_id ?? e.transaction_id;
    if (e.outcome === "no_pdf") return { text: "No PDF or photo attached", tone: "bad" };
    if (e.outcome === "unsupported_photo") return { text: "Photo format not supported (send JPG or PDF)", tone: "bad" };
    if (!it) return { text: e.outcome, tone: "neutral" };
    switch (it.status) {
      case "reading": return { text: "Reading now", tone: "neutral" };
      case "created": return { text: "Started a new deal", tone: "good", href: `/t/${tx}` };
      case "matched": return { text: "Matched to a deal by address", tone: "good", href: `/t/${tx}` };
      case "sorted": return { text: "Sorted by hand", tone: "good", href: tx ? `/t/${tx}` : undefined };
      case "needs_sorting": return { text: "Needs sorting", tone: "warn", href: "/sort" };
      case "discarded": return { text: "Marked not a deal document", tone: "neutral" };
      default: return { text: it.status, tone: "neutral" };
    }
  };
  const unverified = (rules ?? []).filter((r) => r.needs_verification).length;
  const b = brokerage;

  return (
    <AppShell brokerage={b.name} logoUrl={b.logo_url} showSettings>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Settings</h1>
        <a href="/profile" className="text-sm font-medium text-brand">Your profile</a>
      </div>

      <Link href="/settings/forms" className="mb-2 flex min-h-11 items-center justify-between rounded-card bg-card px-4 py-3 shadow-card">
        <span><span className="block font-medium">Offers and forms</span><span className="block text-[14px] text-muted">Offer defaults, built-in TREC forms, your form library</span></span>
        <span className="text-muted" aria-hidden>›</span>
      </Link>

      <SectionTitle>Brokerage profile</SectionTitle>
      <Card className="space-y-4">
        <p className="text-sm text-muted">Set once. Used to recognize your side on contracts and, later, to fill your brokerage info into forms.</p>
        <LogoUpload brokerageId={b.id} current={b.logo_url} save={saveLogo} />
        <form action={saveBrokerage} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">Brokerage name<input name="name" defaultValue={b.name} className={`${inputCls} mt-1`} /></label>
            <label className="block text-sm font-medium">Brokerage license number<input name="license_number" defaultValue={b.license_number ?? ""} inputMode="numeric" className={`${inputCls} mt-1`} /></label>
            <label className="block text-sm font-medium">Broker of record<input name="broker_name" defaultValue={b.broker_name ?? ""} className={`${inputCls} mt-1`} /></label>
            <label className="block text-sm font-medium">Broker license number<input name="broker_license_number" defaultValue={b.broker_license_number ?? ""} inputMode="numeric" className={`${inputCls} mt-1`} /></label>
            <label className="block text-sm font-medium sm:col-span-2">Street address<input name="address_street" defaultValue={b.address_street ?? ""} className={`${inputCls} mt-1`} /></label>
          </div>
          <div className="grid grid-cols-6 gap-3">
            <label className="col-span-3 block text-sm font-medium">City<input name="address_city" defaultValue={b.address_city ?? ""} className={`${inputCls} mt-1`} /></label>
            <label className="col-span-1 block text-sm font-medium">State<input name="address_state" defaultValue={b.address_state ?? "TX"} className={`${inputCls} mt-1`} /></label>
            <label className="col-span-2 block text-sm font-medium">ZIP<input name="address_zip" defaultValue={b.address_zip ?? ""} inputMode="numeric" className={`${inputCls} mt-1`} /></label>
          </div>
          <label className="block text-sm font-medium">Office phone<input name="phone" type="tel" defaultValue={b.phone ?? ""} className={`${inputCls} mt-1`} /></label>
          <Button>Save brokerage profile</Button>
          {saved === "brokerage" && <span className="ml-3 text-sm text-good">Saved.</span>}
        </form>
      </Card>

      <SectionTitle>Deadline day counts</SectionTitle>
      {unverified > 0 && (
        <Card className="mb-3 border-warn bg-warn-soft text-sm">
          {unverified} rule{unverified === 1 ? " uses a" : "s use"} placeholder counts. Check each against the current TREC forms, then tick Verified.
          Changes apply the next time a deal is confirmed, edited, or amended.
        </Card>
      )}
      {error === "loop" && <Card className="mb-3 border-bad bg-bad-soft text-sm text-bad">Those anchors would loop back on each other. Nothing was saved.</Card>}
      <form action={saveRules} className="space-y-3">
        {(rules ?? []).map((r) => (
          <Card key={r.id} className="space-y-3">
            <input type="hidden" name="id" value={r.id} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{r.label}</div>
                <div className="text-xs text-muted">{r.contract_ref}</div>
              </div>
              {r.needs_verification ? <Badge tone="warn">Placeholder</Badge> : <Badge tone="good">Verified</Badge>}
            </div>
            {r.notes && <p className="text-xs text-muted">{r.notes}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                Counts from
                <select name={`anchor_${r.id}`} defaultValue={r.anchor} className={`${inputCls} mt-1`}>
                  {Object.entries(CONTRACT_ANCHORS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  {(rules ?? []).filter((o) => o.key !== r.key).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </label>
              {r.use_contract_days && CONTRACT_DAY_KEYS.includes(r.key) ? (
                <div className="text-sm">
                  Days
                  <input type="hidden" name={`days_${r.id}`} value={r.default_days ?? ""} />
                  <p className="mt-1 rounded-xl border border-line bg-paper px-3 py-2.5 text-muted">From the contract. Blank there = needs attention, never a default.</p>
                </div>
              ) : (
                <label className="block text-sm">
                  Days (negative = before)
                  <input name={`days_${r.id}`} defaultValue={r.default_days ?? ""} inputMode="numeric" className={`${inputCls} mt-1`} />
                </label>
              )}
              <label className="block text-sm">
                Time of day (optional)
                <input name={`time_${r.id}`} type="time" defaultValue={r.due_time?.slice(0, 5) ?? ""} className={`${inputCls} mt-1`} />
              </label>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name={`roll_${r.id}`} defaultChecked={r.roll_weekends_holidays} className="h-4 w-4" /> Move past weekends and holidays</label>
              <label className="flex items-center gap-2"><input type="checkbox" name={`verified_${r.id}`} defaultChecked={!r.needs_verification} className="h-4 w-4" /> Verified against TREC</label>
            </div>
          </Card>
        ))}
        <Button size="lg">Save day counts</Button>
        {saved === "rules" && <p className="text-sm text-good">Saved.</p>}
      </form>

      <SectionTitle>Brokerage forward-to address</SectionTitle>
      <Card><CopyText text={intakeAddress(b.intake_token)} />
        <p className="mt-1 text-xs text-muted">Emails from team members land on their list. Emails from anyone else land unassigned for you to review. Each agent also has a personal address on their Profile page.</p>
      </Card>

      <SectionTitle>Recent forwarded emails</SectionTitle>
      <Card className="divide-y divide-line p-0 text-sm sm:p-0">
        {(emails ?? []).length === 0 && <p className="p-4 text-muted">Nothing received yet. Emails that never show up here were rejected before reaching the app (check Postmark's activity log; attachments over about 3 MB total are the usual cause).</p>}
        {(emails ?? []).map((e) => {
          const f = fate(e);
          return (
            <div key={e.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-medium">{e.subject || "(no subject)"}</div>
                <div className="truncate text-xs text-muted">
                  {e.from_email} · {e.attachment_count} attachment{e.attachment_count === 1 ? "" : "s"} · {new Date(e.received_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: b.timezone })}
                </div>
              </div>
              {f.href ? <a href={f.href} className="shrink-0"><Badge tone={f.tone}>{f.text}</Badge></a> : <span className="shrink-0"><Badge tone={f.tone}>{f.text}</Badge></span>}
            </div>
          );
        })}
      </Card>

      <SectionTitle>Team</SectionTitle>
      <Card className="divide-y divide-line p-0 sm:p-0">
        {(team ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{m.full_name || m.email}</div>
              <div className="truncate text-xs text-muted">{m.email}{m.license_number ? ` · License ${m.license_number}` : " · No license on file"}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Badge tone="neutral">{m.role}</Badge>
              {!m.user_id && <Badge tone="warn">Hasn't signed in</Badge>}
            </div>
          </div>
        ))}
      </Card>
      <Card className="mt-3">
        <form action={addMember} className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input name="full_name" placeholder="Name" className={inputCls} />
            <input name="email" type="email" required placeholder="Email" className={inputCls} />
            <select name="role" className={inputCls}><option value="agent">Agent</option><option value="staff">Staff</option><option value="broker">Broker</option></select>
          </div>
          <Button>Add to team</Button>
          <p className="text-xs text-muted">They sign in at this app with that email. No invite is emailed automatically.</p>
        </form>
      </Card>
    </AppShell>
  );
}
