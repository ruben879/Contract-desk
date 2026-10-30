import { after, NextResponse } from "next/server";
import { authorized, parseInbound } from "@/lib/inbound";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createIntakeItem, isPdf, MAX_FILE_BYTES, processIntakeItem } from "@/lib/intake";
import { isPhoto, PHOTO_TYPES, photosToPdf } from "@/lib/photos";

export const runtime = "nodejs";
export const maxDuration = 300;

// Inbound email webhook. Written for Postmark's inbound JSON; the parse step is the
// only provider-specific part, so swapping to SendGrid/Mailgun means rewriting parseInbound.
// This route only RECEIVES. It sends no email to anyone, including the sender.

export async function POST(req: Request) {
  if (!authorized(req)) { console.warn("[inbound] rejected: bad or missing webhook password"); return new NextResponse("Unauthorized", { status: 401 }); }

  const mail = parseInbound(await req.json());
  const db = supabaseAdmin();
  console.info("[inbound] received", { from: mail.from, subject: mail.subject, token: mail.token, attachments: mail.attachments.map((a) => `${a.name} (${a.type}, ~${Math.round(a.base64.length * 0.75 / 1024)} KB)`) });
  if (!mail.token) { console.info("[inbound] no token in the To address"); return NextResponse.json({ ok: true, outcome: "no_token" }); }

  // Personal address -> that agent, whoever sent it (auto-forwarded mail keeps zipForm/e-sign as the sender).
  // Brokerage address -> match the agent by sender email, else unassigned.
  const { data: personal } = await db.from("brokerage_members").select("id, user_id, brokerage_id")
    .eq("intake_token", mail.token).eq("active", true).maybeSingle();
  const { data: firm } = personal ? { data: { id: personal.brokerage_id } }
    : await db.from("brokerages").select("id").eq("intake_token", mail.token).maybeSingle();
  const brokerage = firm;
  if (!brokerage) { console.info("[inbound] token matches no brokerage or agent", mail.token); return NextResponse.json({ ok: true, outcome: "unknown_address" }); } // 200 so the provider does not retry

  const { data: member } = personal ? { data: personal }
    : mail.from
      ? await db.from("brokerage_members").select("id, user_id").eq("brokerage_id", brokerage.id).ilike("email", mail.from).eq("active", true).maybeSingle()
      : { data: null };

  const ok = (a: { base64: string }) => a.base64.length > 0 && a.base64.length * 0.75 <= MAX_FILE_BYTES;
  const pdfs = mail.attachments.filter((a) => isPdf(a.name, a.type) && ok(a))
    .map((a) => ({ name: a.name, bytes: new Uint8Array(Buffer.from(a.base64, "base64")) }));
  // Photos (JPG/PNG) become one PDF, read like a scan. Other image formats are logged, not dropped silently.
  const photos = mail.attachments.filter((a) => !isPdf(a.name, a.type) && isPhoto(a.name, a.type) && ok(a));
  const usable = photos.filter((a) => PHOTO_TYPES.includes(a.type));
  if (usable.length) {
    try {
      const bytes = await photosToPdf(usable.map((a) => ({ bytes: new Uint8Array(Buffer.from(a.base64, "base64")), type: a.type })));
      pdfs.push({ name: `Emailed photos (${usable.length} page${usable.length === 1 ? "" : "s"}).pdf`, bytes: new Uint8Array(bytes) });
    } catch { /* unreadable photo: falls through to the log below */ }
  }

  const log = {
    brokerage_id: brokerage.id, from_email: mail.from, subject: mail.subject, attachment_count: mail.attachments.length,
    matched_member_id: member?.id ?? null,
  };
  if (!pdfs.length) {
    await db.from("intake_emails").insert({ ...log, outcome: photos.length ? "unsupported_photo" : "no_pdf" });
    console.info("[inbound] no usable attachment");
    return NextResponse.json({ ok: true, outcome: "no_pdf" });
  }

  // Nothing is attached to a deal yet. Routing decides: one exact match, a brand-new contract, or a person sorts it.
  const itemId = await createIntakeItem({ brokerageId: brokerage.id, memberId: member?.id ?? null, from: mail.from, subject: mail.subject, files: pdfs });
  await db.from("intake_emails").insert({ ...log, outcome: "received", intake_item_id: itemId });

  console.info("[inbound] stored as intake item", itemId, "routing in background");
  after(() => processIntakeItem(itemId));
  return NextResponse.json({ ok: true, outcome: "received" });
}
