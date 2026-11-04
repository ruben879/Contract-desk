import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, SectionTitle, inputCls } from "@/components/ui";
import { AddForm } from "@/components/FormLibrary";
import { loadLibrary } from "@/lib/offer/server";
import { BUNDLED_FORMS, P22_SLOTS } from "@/lib/forms/registry";
import { TXR_ACK_TEXT, mappable, unmappedCount } from "@/lib/forms/library";

async function saveDefaults(fd: FormData) {
  "use server";
  const { supabase, isBrokerOrStaff, brokerage } = await requireMember();
  if (!isBrokerOrStaff) return;
  const s = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const type = s("default_buyer_comp_type");
  const value = s("default_buyer_comp_value");
  await supabase.from("brokerages").update({
    default_title_company: s("default_title_company"),
    default_buyer_comp_type: type === "percent" || type === "amount" ? type : null,
    default_buyer_comp_value: type && value ? Number(value.replace(/[$,%\s]/g, "")) || null : null,
  }).eq("id", brokerage.id);
  revalidatePath("/settings/forms");
}

// Offer defaults and the brokerage's own forms. Broker and staff only.
export default async function FormsSettings() {
  const { supabase, brokerage, isBrokerOrStaff } = await requireMember();
  if (!isBrokerOrStaff) redirect("/");
  const [library, { data: d }] = await Promise.all([
    loadLibrary(supabase),
    supabase.from("brokerages").select("default_title_company, default_buyer_comp_type, default_buyer_comp_value").eq("id", brokerage.id).maybeSingle(),
  ]);
  const slots = P22_SLOTS.map((s) => ({ key: s.key, label: s.label }));

  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings>
      <Link href="/settings" className="text-[15px] text-brand">Settings</Link>
      <h1 className="mb-2 mt-1 text-[26px] font-semibold leading-tight tracking-[-0.01em]">Offers and forms</h1>

      <SectionTitle>Offer defaults</SectionTitle>
      <Card>
        <form action={saveDefaults} className="space-y-3">
          <label className="block"><span className="mb-1 block text-[14px] font-medium">Usual title company</span>
            <input name="default_title_company" defaultValue={d?.default_title_company ?? ""} className={inputCls} /></label>
          <div className="block"><span className="mb-1 block text-[14px] font-medium">Usual buyer's broker compensation (Para 12B)</span>
            <div className="flex gap-2">
              <select name="default_buyer_comp_type" defaultValue={d?.default_buyer_comp_type ?? ""} className={`${inputCls} w-auto`}>
                <option value="">Not set</option><option value="percent">% of price</option><option value="amount">$ amount</option>
              </select>
              <input name="default_buyer_comp_value" defaultValue={d?.default_buyer_comp_value ?? ""} inputMode="decimal" className={inputCls} />
            </div></div>
          <p className="text-[13.5px] text-muted">New offers start with these. Agents can change them on each offer.</p>
          <button className="inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-[15px] font-medium text-white">Save defaults</button>
        </form>
      </Card>

      <SectionTitle>Built-in TREC forms</SectionTitle>
      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {Object.values(BUNDLED_FORMS).map((f) => (
            <li key={f.id} className="px-4 py-3"><div className="font-medium">TREC {f.number}: {f.title}</div><div className="text-[14px] text-muted">Revision {f.revision}</div></li>
          ))}
        </ul>
      </Card>

      <SectionTitle>Your form library</SectionTitle>
      {library.length > 0 && (
        <Card className="mb-3 p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {library.map((f) => {
              const left = f.current ? unmappedCount(f.current.fields as never, f.current.field_map) : 0;
              const total = f.current ? mappable(f.current.fields as never).length : 0;
              return (
                <li key={f.id}>
                  <Link href={`/settings/forms/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                    <span>
                      <span className="block font-medium">{f.display_name}</span>
                      <span className="block text-[14px] text-muted">{f.form_class} · version {f.current?.version ?? "?"}{f.p22_slot ? ` · Para 22: ${P22_SLOTS.find((s) => s.key === f.p22_slot)?.label}` : ""}</span>
                    </span>
                    {f.archived ? <Badge>Archived</Badge> : f.current?.mapping_complete ? <Badge tone="good">Ready</Badge> : <Badge tone="warn">{left} of {total} to map</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Card>
        <h3 className="mb-1 font-semibold">Add a form</h3>
        <p className="mb-3 text-[14px] text-muted">Upload the blank, fillable PDF. Agents can pick it once every field is mapped.</p>
        <AddForm slots={slots} ackText={TXR_ACK_TEXT} />
      </Card>
    </AppShell>
  );
}
