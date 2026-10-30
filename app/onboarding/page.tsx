import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Button, Card, inputCls } from "@/components/ui";
import { APP_NAME } from "@/lib/brand";

async function createBrokerage(form: FormData) {
  "use server";
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");
  const name = String(form.get("name") ?? "").trim();
  const fullName = String(form.get("full_name") ?? "").trim();
  if (!name) return;

  const db = supabaseAdmin();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: b, error } = await db.from("brokerages").insert({ name, slug }).select("id").single();
  if (error || !b) throw new Error("Could not create the brokerage.");
  await db.from("brokerage_members").insert({ brokerage_id: b.id, user_id: user.id, email: user.email, full_name: fullName || null, role: "broker" });
  redirect("/");
}

export default async function Onboarding() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/login");

  // If a broker already added this email to their team, link it and go straight in.
  const db = supabaseAdmin();
  const { data: invited } = await db.from("brokerage_members").select("id, user_id")
    .ilike("email", user.email).eq("active", true).limit(1).maybeSingle();
  if (invited) {
    if (!invited.user_id) await db.from("brokerage_members").update({ user_id: user.id }).eq("id", invited.id);
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-2xl font-bold text-brand">Welcome to {APP_NAME}</h1>
      <p className="mb-6 text-muted">Set up your brokerage. You'll be its broker.</p>
      <Card>
        <form action={createBrokerage} className="space-y-3">
          <label className="block text-sm font-medium">Brokerage name</label>
          <input name="name" className={inputCls} required placeholder="Your brokerage" />
          <label className="block text-sm font-medium">Your name</label>
          <input name="full_name" className={inputCls} />
          <Button size="lg">Create brokerage</Button>
        </form>
        <p className="mt-3 text-xs text-muted">Joining an existing brokerage? Ask your broker to add {user.email} to the team, then sign in again.</p>
      </Card>
    </main>
  );
}
