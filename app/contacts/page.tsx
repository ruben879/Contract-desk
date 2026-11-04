import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Button, Card, SectionTitle, inputCls } from "@/components/ui";
import { createOffer } from "@/app/o/actions";

const TYPES: [string, string][] = [
  ["buyer", "Buyers"], ["seller", "Sellers"], ["listing_agent", "Listing agents"], ["buyer_agent", "Buyer's agents"],
  ["title_company", "Title companies"], ["escrow_officer", "Escrow officers"], ["lender", "Lenders"], ["other", "Other"],
];

async function addContact(fd: FormData) {
  "use server";
  const { supabase, user, member } = await requireMember();
  const s = (k: string) => String(fd.get(k) ?? "").trim() || null;
  if (!s("full_name")) return;
  await supabase.from("contacts").insert({
    brokerage_id: member.brokerage_id, type: s("type") ?? "other", full_name: s("full_name"),
    company: s("company"), email: s("email"), phone: s("phone"), created_by: user.id,
  });
  revalidatePath("/contacts");
}

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  let query = supabase.from("contacts").select("id, type, full_name, company, email, phone").order("full_name").limit(500);
  if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,company.ilike.%${q.replace(/[%,()]/g, "")}%,email.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query;
  const rows = data ?? [];

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings={isBrokerOrStaff}>
      <form>
        <input name="q" defaultValue={q} placeholder="Search people and companies" className={inputCls} />
      </form>

      {TYPES.map(([t, label]) => {
        const list = rows.filter((r) => r.type === t);
        if (!list.length) return null;
        return (
          <div key={t}>
            <SectionTitle>{label}</SectionTitle>
            <Card className="divide-y divide-line p-0 sm:p-0">
              {list.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="font-medium">{c.full_name}{c.company && c.company !== c.full_name && <span className="font-normal text-muted"> · {c.company}</span>}</div>
                    <div className="text-sm text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
                  </div>
                  {c.type === "buyer" && (
                    <form action={createOffer}>
                      <input type="hidden" name="buyer_contact_id" value={c.id} />
                      <button className="min-h-11 shrink-0 rounded-xl px-3 text-[14px] font-medium text-brand hover:bg-brand-soft">New offer</button>
                    </form>
                  )}
                </div>
              ))}
            </Card>
          </div>
        );
      })}
      {rows.length === 0 && <p className="mt-6 text-sm text-muted">{q ? "No matches." : "People from confirmed contracts land here automatically."}</p>}

      <SectionTitle>Add someone</SectionTitle>
      <Card>
        <form action={addContact} className="space-y-2">
          <div className="flex gap-2">
            <select name="type" className={`${inputCls} w-44`}>{TYPES.map(([t, l]) => <option key={t} value={t}>{l.replace(/s$/, "").replace(/ie$/, "y")}</option>)}</select>
            <input name="full_name" required placeholder="Name" className={inputCls} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input name="company" placeholder="Company" className={inputCls} />
            <input name="email" type="email" placeholder="Email" className={inputCls} />
            <input name="phone" type="tel" placeholder="Phone" className={inputCls} />
          </div>
          <Button>Save contact</Button>
        </form>
      </Card>
    </AppShell>
  );
}
