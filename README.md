# Contract Desk (working name), Phase 1 (Brief v3)

An agent drops or forwards an executed contract. The app reads it, the agent confirms what it read, and the app builds the deadlines and checklist for that deal.

Next.js 15 (App Router) on Vercel, Supabase (Postgres, Auth, Storage), Claude for contract reading.

## Hard rules, and where they live in the code

| Rule | How it is enforced |
|---|---|
| Never message a client on its own | There is no outbound email or SMS code anywhere. The inbound webhook only receives. |
| Extraction is never final until the agent confirms | AI output is saved only to `extractions` (read-only to users). `transactions`, `deadlines`, and `checklist_items` are written only by `applyConfirmedTerms` in `lib/apply.ts`, which runs only after the agent presses Confirm (first read, edit, or amendment). |
| Every extracted value shows where it came from | Each field carries doc, page, verbatim quote, and an approximate box. "Doc 1, p. 2" links open the PDF beside the form with the words highlighted (`components/SourceViewer.tsx`). Scans show a dashed "approximate" box. |
| No auto-committed dates | Date changes are previewed live (old date struck through, new date beside it) and saved only on Confirm. Every save writes an audit event (`transaction_events`). |
| One obvious next action per screen | Home: drop a contract (or review waiting ones). Review: Confirm. Deal: Mark the next task done. |

## What changed in v3

- **Amendment re-reads.** Any document added to a confirmed deal is read for changes. If something changed (or the document is an amendment at all), the deal's one next action becomes **Review changes**: old value, new value (editable), source highlight, the dates that will shift, and the tasks that will be added or dropped. Confirm applies it; "None of these are real changes" dismisses it. An amendment that extends the option period to a date is converted to a day count.
- **Chain-shifting dates.** Deadlines can anchor to the effective date, the closing date, or another deadline (Settings, "Counts from"). Moving any anchor recalculates everything downstream. Loops are rejected.
- **Fill-once profiles.** Brokerage profile (Settings) and agent profile (Profile page). License numbers are used now to tell which side you're on and which agent the deal belongs to; the same fields will feed form prefill in Phase 2.
- **Personal forward-to addresses.** Every agent has their own intake address, so auto-forwarded mail (which keeps zipForm or the e-sign provider as the sender) still lands on the right list. The brokerage address still works too.
- **Not needed** on any checklist task, and a deadline disclaimer wherever computed dates appear.

## Email routing, sorting, slots, and the TC queue

- **Emailed documents are routed, never assumed.** They first wait in an intake item, attached to no deal. A short triage read finds what they are and the property address. Then:
  - exactly one **active** deal at that address: attached, and the agent gets **Review changes** (always, even when nothing changed, with a "Not for this deal" button);
  - an executed contract with no active deal at that address: a new deal starts;
  - anything else (no match, more than one match, unreadable address, or a contract for an address that already has an active deal): **Needs sorting** (`/sort`) for a person to attach, start a deal, or discard.
  Address matching (`lib/address.ts`) requires the house number and street name to agree and rejects any conflicting suffix, direction, unit, ZIP, or city.
- **Document slots** (`lib/slots.ts`): labeled slots on every deal, shown by the same conditions as tasks. Upload into a slot by drag-and-drop or Add (phone camera or files); emailed documents are filed by the reader with a visible "Filed by reader" badge and a Move control. Photos become PDF pages and are read like scans.
- **TC queue** (`/queue`, broker and staff): open tasks due today and past due across all active files, filterable by agent.
- **Contract types later:** tasks and slots share one filter (`lib/rules.ts`). Rules can already name `contractTypes`; Phase 1 never sets a deal's type, so those rules stay off until Phase 2.

## Missing documents, unresolved terms, comments (Oct 31)

- **Referenced but not in the file** (`lib/missing-docs.ts`): an addendum checked in Para 22 but not attached, or a Seller's Disclosure marked received with no copy, is pre-ticked on the review screen. Each one the agent keeps becomes a "Get the ... in the file" task naming its slot. When the document is attached (amendment read or edit), the task is marked done.
- **Addendum deadlines:** the HOA addendum's day count (`hoa_info_days`) produces "HOA subdivision information due", which dates the HOA request and delivery tasks. It exists only when the HOA addendum is in the file.
- **Blank stays blank:** a deadline whose day count comes from the contract (option period, survey, HOA) never falls back to a default. If the contract leaves it blank, the deal shows it under **Needs attention** (Key dates and Tasks) instead of a date.
- **Comments** on every deal: plain text, newest first, author and time. Type @ to mention someone who can open the deal. Mentions show in the **Queue** (now open to every member) and flag the deal on the home screen until you open it. Comments are conversation only: they never go into History, and nothing posts one automatically.

## Where to change things

- **Deadline day counts:** Settings > Deadline day counts (table `deadline_rules`). Every placeholder shows a "Day count not verified yet" badge on deals until you tick Verified.
- **Holidays used for weekend/holiday roll:** `lib/deadlines/holidays.ts` (US federal for now).
- **Checklist tasks and triggers:** `lib/checklist/rules.ts`, one list. **Document slots:** `lib/slots.ts`.
- **What gets extracted:** `lib/extract/schema.ts`. Instructions to the reader: `lib/extract/read-contract.ts`.
- **App name:** `lib/brand.ts`. **Colors:** top of `app/globals.css`.

## Planned next

Email intake moves from Postmark to Cloudflare after the first live test: see `docs/intake-cloudflare-spec.md`.

## Setup

Step-by-step deploy and the first live test: see **DEPLOY.md**.


1. **Supabase:** create a project. In SQL Editor, run `supabase/migrations/0001_phase1_schema.sql`, then `0002_v3_phase1.sql`, then `0003_routing_slots.sql`, `0004_fix_deal_insert_rls.sql`, `0005_checklist_gaps.sql`, `0006_comments_mentions.sql`. Under Auth > URL Configuration, add `https://YOUR-APP.vercel.app/auth/callback` as a redirect URL.
2. **Env vars:** copy `.env.example` to `.env.local` locally and add the same values in Vercel.
3. **Inbound email (Postmark):** create an Inbound stream. Point an MX record for a subdomain (e.g. `inbound.yourdomain.com`) at Postmark, or use Postmark's own inbound address with `+` hashes. Set the webhook URL to `https://postmark:SECRET@YOUR-APP.vercel.app/api/inbound/email`, where SECRET matches `INBOUND_WEBHOOK_SECRET`. Attachments are included in the webhook by default.
4. `npm install && npm run dev`, sign in, create the brokerage. Your forward-to address shows on the home screen.

## Commands

- `npm test` runs the deadline math and checklist trigger tests.
- `npm run typecheck`, `npm run build`.

## How a contract flows

1. Upload (signed URL straight to Storage, so big PDFs skip Vercel's body limit) or forwarded email.
2. `runExtraction` (`lib/extract/run.ts`) checks each PDF for a text layer, flags scans, then sends the packet to Claude, which reads scanned pages visually (that is the OCR step). Every field comes back with confidence, page, and the paragraph it came from.
3. Review screen highlights anything low-confidence or missing, plus warnings (blank effective date, conflicting dates).
4. Confirm writes the deal, computes deadlines from `deadline_rules` (each shows its contract paragraph and math), builds the checklist with a reason on every triggered task, and saves contacts.
5. Editing later re-runs the dates and adds or drops open tasks. Finished and not-needed tasks stay as they are.
6. Adding a document later triggers `runAmendmentRead`, which compares the new pages against the confirmed terms and proposes a diff for the agent.

Emails from addresses not on the team still create a deal, but it lands **unassigned** for the broker to review.
