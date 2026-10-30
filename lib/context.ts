import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export type Role = "broker" | "agent" | "staff";
export type Member = {
  id: string; brokerage_id: string; role: Role; full_name: string | null; email: string;
  license_number: string | null; phone: string | null; intake_token: string;
};
export type Brokerage = {
  id: string; name: string; slug: string; intake_token: string; timezone: string;
  license_number: string | null; address_street: string | null; address_city: string | null;
  address_state: string | null; address_zip: string | null; phone: string | null;
  logo_path: string | null; broker_name: string | null; broker_license_number: string | null;
  logo_url: string | null;
};

const MEMBER_COLS = "id, brokerage_id, role, full_name, email, license_number, phone, intake_token";
const BROKERAGE_COLS = "id, name, slug, intake_token, timezone, license_number, address_street, address_city, address_state, address_zip, phone, logo_path, broker_name, broker_license_number";

export function logoUrl(path: string | null) {
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${path}` : null;
}

/** Signed-in user plus their brokerage membership and both fill-once profiles. */
export async function requireMember() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase.from("brokerage_members").select(MEMBER_COLS)
    .eq("user_id", user.id).eq("active", true).limit(1).maybeSingle<Member>();
  if (!member) redirect("/onboarding");

  const { data: b } = await supabase.from("brokerages").select(BROKERAGE_COLS)
    .eq("id", member.brokerage_id).single<Omit<Brokerage, "logo_url">>();
  const brokerage: Brokerage = { ...b!, logo_url: logoUrl(b!.logo_path) };

  return { supabase, user, member, brokerage, isBrokerOrStaff: member.role !== "agent" };
}

// INBOUND_ADDRESS_TEMPLATE: "contracts+{token}@inbound.yourdomain.com" once DNS is set up, or
// Postmark's own inbound address with "+{token}", e.g. "abc123+{token}@inbound.postmarkapp.com".
const template = () => process.env.INBOUND_ADDRESS_TEMPLATE ||
  `contracts+{token}@${process.env.INBOUND_EMAIL_DOMAIN || "inbound.example.com"}`;
/** Brokerage-wide address: files are matched to an agent by the sender's email. */
export const intakeAddress = (token: string) => template().replace("{token}", token);
/** Personal address: always lands on that agent's list, even when mail is auto-forwarded. */
export const memberIntakeAddress = (token: string) => template().replace("{token}", token);

/** Which profile fields are still blank (drives the one-time "finish your profile" nudge). */
export function missingProfile(member: Member, brokerage: Brokerage, isBrokerOrStaff: boolean) {
  const agent = [!member.full_name && "name", !member.license_number && "license number", !member.phone && "phone"].filter(Boolean) as string[];
  const firm = isBrokerOrStaff
    ? [!brokerage.license_number && "license number", !brokerage.broker_name && "broker of record", !brokerage.phone && "phone", !brokerage.address_street && "address"].filter(Boolean) as string[]
    : [];
  return { agent, firm };
}
