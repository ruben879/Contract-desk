"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireMember } from "@/lib/context";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyConfirmedTerms } from "@/lib/apply";
import { ADDENDUM_KEYS, DISCLOSURE_STATUSES, FINANCING_TYPES, type AddendumKey } from "@/lib/addenda";

const blank = (v: unknown) => (v === "" || v == null ? null : v);
const optStr = z.preprocess(blank, z.string().trim().nullable());
const optNum = z.preprocess((v) => (blank(typeof v === "string" ? v.replace(/[$,\s]/g, "") : v)), z.coerce.number().nonnegative().nullable());
const optInt = z.preprocess(blank, z.coerce.number().int().min(0).max(365).nullable());
const optDate = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date").nullable());

const ContactRow = z.object({
  role: z.enum(["buyer", "seller", "listing_agent", "buyer_agent", "title_company", "escrow_officer", "lender", "other"]),
  full_name: z.string().trim().min(1),
  company: optStr, email: optStr, phone: optStr,
});

const Form = z.object({
  side: z.enum(["buyer", "seller", "both"], { message: "Pick which side your brokerage is on" }),
  agent_member_id: optStr,
  contract_form: optStr,
  property_street: z.string().trim().min(1, "Property address is required"),
  property_city: optStr, property_state: optStr, property_zip: optStr, property_county: optStr,
  legal_description: optStr,
  sales_price: optNum, financed_amount: optNum,
  financing_type: z.preprocess(blank, z.enum(FINANCING_TYPES).nullable()),
  effective_date: optDate, closing_date: optDate,
  earnest_money: optNum, option_fee: optNum,
  option_period_days: optInt, survey_days: optInt,
  seller_disclosure: z.preprocess(blank, z.enum(DISCLOSURE_STATUSES).nullable()),
  addenda: z.array(z.enum(ADDENDUM_KEYS as [AddendumKey, ...AddendumKey[]])),
  contacts: z.array(ContactRow),
});

export type ConfirmState = { error?: string } | undefined;

export async function confirmTransaction(id: string, _prev: ConfirmState, fd: FormData): Promise<ConfirmState> {
  const { supabase, user, member, isBrokerOrStaff } = await requireMember();

  let contacts: unknown = [];
  try { contacts = JSON.parse(String(fd.get("contacts") ?? "[]")); } catch { /* validation below */ }
  const parsed = Form.safeParse({
    ...Object.fromEntries([...fd.entries()].filter(([k]) => k !== "addenda" && k !== "contacts")),
    addenda: fd.getAll("addenda"),
    contacts: (contacts as any[]).filter((c) => c?.full_name?.trim()),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { agent_member_id, contacts: people, ...terms } = parsed.data;

  const { data: tx } = await supabase.from("transactions").select("id, agent_member_id, confirmed_at").eq("id", id).maybeSingle();
  if (!tx) return { error: "Deal not found." };
  const firstConfirm = !tx.confirmed_at;

  try {
    await applyConfirmedTerms({
      supabase, transactionId: id, userId: user.id,
      terms: { ...terms, property_state: terms.property_state ?? "TX" },
      agentMemberId: isBrokerOrStaff ? agent_member_id : tx.agent_member_id ?? member.id,
      contacts: people,
      event: { kind: firstConfirm ? "confirmed" : "edited" },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save." };
  }

  // Stamp the draft confirmed (extractions are read-only to users).
  if (firstConfirm) {
    const admin = supabaseAdmin();
    const { data: ex } = await admin.from("extractions").select("id").eq("transaction_id", id).eq("kind", "initial")
      .eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (ex) await admin.from("extractions").update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: user.id, applied: terms }).eq("id", ex.id);
  }

  redirect(`/t/${id}`);
}
