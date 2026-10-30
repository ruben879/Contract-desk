# Spec: move email intake to Cloudflare

**Status:** approved to build after a clean A/B live test (Ruben, Oct 29, 2026). Postmark stays for the first live test.

## Why

Postmark posts each email to the app with the attachments inside the request. Vercel rejects requests over 4.5 MB before the app runs, so any email with more than about 3 MB of attachments disappears without a trace. Scanned packets routinely exceed that.

## What changes

The email body never passes through a Vercel request again. Attachments go to storage first, and the app reads from storage.

```
Agent forwards email
  -> Cloudflare Email Routing (app's own domain, catch-all)
  -> Email Worker: asks the app for a one-time upload URL,
     streams the raw message (.eml) to Supabase Storage, notifies the app (tiny JSON)
  -> App: downloads the .eml from storage, parses it, saves attachments as documents,
     then the existing routing runs unchanged (triage, address match, Review changes, sorting)
```

### 1. Addresses on the app's domain
- Intake lives on a subdomain of a domain the app owns, e.g. `in.<app-domain>`. Cloudflare Email Routing catch-all sends every address there to the Worker.
- **Every brokerage gets a brokerage address, and every agent keeps a personal address**, all on that one domain. The personal address is what makes Rung 2 work: auto-forwarded mail keeps zipForm or the e-sign provider as the sender, so the sender alone can't identify the agent.
- Addresses become readable but unguessable: `ruben.k7m2@in.<app-domain>`, `crr.p4x9@in.<app-domain>` (name plus a short random suffix), instead of today's hex tokens. Existing tokens keep working.
- Decision needed before build: **which domain.** A neutral product domain fits selling to other brokerages better than a subdomain of clearrockrealty.com. It's on hold until the app name is chosen; a subdomain works in the meantime and can be swapped later.

### 2. The Worker (about 60 lines, in `workers/email-intake/`)
- Holds no Supabase keys. It holds one shared secret for talking to the app.
- For each message: `POST /api/inbound/upload-url` (secret, recipient, size) returns a one-time signed upload URL. The Worker streams `message.raw` to it unparsed, which keeps CPU time tiny, then calls `POST /api/inbound/stored` with `{ path, to, from, subject, messageId, size }`.
- If the app is unreachable, the Worker rejects the message with a temporary failure so the sending server retries. Nothing is dropped silently.
- Inbound limit becomes 25 MiB per message (Cloudflare's cap, about 18 MB of PDFs after email encoding). Anything larger bounces back to the sender with an error, instead of vanishing.

### 3. App changes
- `lib/mime.ts`: parse the .eml with a MIME library, in Vercel's Node runtime (up to 300 s; no body limit, since the download goes outward).
- Feed attachments into the existing `createIntakeItem` (PDFs as-is, photos to PDF). **Everything after that is unchanged.**
- Retries are deduped by Message-ID plus content hash, so a Worker retry never creates a second deal.
- Every message is logged in Recent forwarded emails, including ones with no attachment (see Gmail codes below).
- Raw .eml files are kept 30 days for troubleshooting, then purged.
- Postmark's parser stays for one release as a fallback, then is removed.

### 4. Tests before switching over
Fixture emails: Gmail forward, Outlook forward, a zipForm completion notice, a DocuSign completion notice, a 15 MB scanned packet, iPhone photos, a duplicate delivery, and an address that matches nothing.

## DNS check: does any brokerage ever touch its own DNS?

**No, for both rungs.** The only DNS involved is one MX setup on the app's own domain, done once by whoever operates the app.

| Rung | What the brokerage or agent does | DNS on their side? |
|---|---|---|
| Rung 1: forward-to address | Forwards or emails the executed contract to their address | None |
| Rung 2: assisted auto-forward | Creates a mail rule in their own mailbox that forwards completion notices to their personal address | None |

Two things that aren't DNS but will come up in Rung 2, so the Phase 2 setup guide has to handle them:

1. **Gmail asks to verify the forwarding address.** When an agent adds an auto-forward, Gmail emails a confirmation code to the destination, which is the agent's intake address. The intake must catch that email (it has no PDF) and show the code to the agent on the setup screen. This spec keeps every message, so Rung 2 can do that.
2. **Microsoft 365 blocks automatic forwarding to outside addresses by default.** A brokerage on Microsoft 365 needs its IT admin to allow it: a policy toggle in the Microsoft security portal, not DNS. Manual forwarding (Rung 1) isn't affected. The Rung 2 guide should detect Microsoft 365 and say exactly what to ask the admin for.

## Cost
- Cloudflare Email Routing: free.
- Workers: the Free plan may be enough because the Worker never parses mail. Cloudflare warns that complex email handlers can exceed Free-plan CPU limits. If live runs show CPU errors, Workers Paid is $5/month.
- Postmark: can be cancelled after the switch.

## Out of scope here
The guided Rung 2 setup screens (Phase 2), the Gmail code display itself (Phase 2), and the app name and domain choice (open decision).
