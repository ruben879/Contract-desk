import { timingSafeEqual } from "node:crypto";

// Postmark inbound JSON parsing and webhook auth. The only provider-specific code.

export type Inbound = { token: string | null; from: string | null; subject: string | null; attachments: { name: string; type: string; base64: string }[] };

export function parseInbound(body: any): Inbound {
  const recipients: string[] = [
    body.OriginalRecipient, body.To,
    ...(body.ToFull ?? []).map((t: any) => t.Email),
    ...(body.CcFull ?? []).map((t: any) => t.Email),
  ].filter(Boolean);
  const hash = (body.ToFull ?? []).map((t: any) => t.MailboxHash).find(Boolean) ?? null;
  // Postmark puts the part after "+" in MailboxHash; fall back to reading it from the address.
  const fromAddr = recipients.join(" ").match(/\+([a-z0-9]+)@/i)?.[1] ?? null;
  return {
    token: (hash || fromAddr || null)?.toLowerCase() ?? null,
    from: (body.FromFull?.Email ?? body.From ?? null)?.toLowerCase() ?? null,
    subject: body.Subject ?? null,
    attachments: (body.Attachments ?? []).map((a: any) => ({ name: a.Name ?? "attachment.pdf", type: a.ContentType, base64: a.Content ?? "" })),
  };
}

// Postmark sends basic auth from the webhook URL (https://postmark:SECRET@host/...). Only the password is checked.
export function authorized(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const decoded = header.startsWith("Basic ") ? Buffer.from(header.slice(6), "base64").toString() : "";
  const given = decoded.includes(":") ? decoded.slice(decoded.indexOf(":") + 1) : decoded;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

