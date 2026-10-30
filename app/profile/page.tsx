import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember, memberIntakeAddress } from "@/lib/context";
import { AppShell } from "@/components/AppShell";
import { CopyText } from "@/components/CopyText";
import { Button, Card, SectionTitle, inputCls } from "@/components/ui";

async function saveProfile(fd: FormData) {
  "use server";
  const { supabase, member } = await requireMember();
  const s = (k: string) => String(fd.get(k) ?? "").trim() || null;
  await supabase.from("brokerage_members").update({
    full_name: s("full_name"), license_number: s("license_number"), phone: s("phone"),
  }).eq("id", member.id);
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

// Agent profile: set once, reused everywhere (matching deals by license, and later, prefilling forms).
export default async function Profile({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const { member, brokerage, isBrokerOrStaff } = await requireMember();
  return (
    <AppShell brokerage={brokerage.name} logoUrl={brokerage.logo_url} showSettings={isBrokerOrStaff}>
      <h1 className="text-xl font-bold">Your profile</h1>
      <p className="mt-1 text-sm text-muted">Fill this in once. It's used to match contracts to you and, later, to fill your info into forms.</p>

      <Card className="mt-4">
        <form action={saveProfile} className="space-y-3">
          <label className="block text-sm font-medium">Name (as licensed)
            <input name="full_name" defaultValue={member.full_name ?? ""} className={`${inputCls} mt-1`} />
          </label>
          <label className="block text-sm font-medium">TREC license number
            <input name="license_number" defaultValue={member.license_number ?? ""} inputMode="numeric" className={`${inputCls} mt-1`} />
          </label>
          <label className="block text-sm font-medium">Phone
            <input name="phone" type="tel" defaultValue={member.phone ?? ""} className={`${inputCls} mt-1`} />
          </label>
          <div className="text-sm">
            <div className="font-medium">Email</div>
            <div className="text-muted">{member.email}</div>
          </div>
          <div className="text-sm">
            <div className="font-medium">Brokerage</div>
            <div className="text-muted">{brokerage.name}{brokerage.license_number ? ` · License ${brokerage.license_number}` : ""}</div>
          </div>
          <Button size="lg">Save profile</Button>
          {saved && <p className="text-sm text-good">Saved.</p>}
        </form>
      </Card>

      <SectionTitle>Your forward-to address</SectionTitle>
      <Card>
        <CopyText text={memberIntakeAddress(member.intake_token)} />
        <p className="mt-1 text-xs text-muted">Anything sent here becomes a deal on your list, from any sender. Use this one for mail rules that auto-forward.</p>
      </Card>
    </AppShell>
  );
}
