# Deploy and first live test

About 30 minutes. Everything here is a one-time setup. Scheduled for Tuesday, Nov 3 (Ruben with Ren).

**Keys and secrets are entered directly in Supabase and Vercel during that session. They never go in chat, email, or this repo.** `.env.example` lists the names only.

## 1. Code on GitHub
Done: `ruben879/contract-desk`, branch `main`. Import this repo in Vercel.

## 2. Supabase (a new project, separate from Rock Solid)
1. Done Oct 30: project ref `mnzdlonnpggedektqbud`, region us-east-2 (Ohio). `vercel.json` pins the app's functions to Vercel's Cleveland region (`cle1`), next door to the database, so every page and read stays fast.
2. **Still to do, before the first sign-in:** SQL Editor: run `supabase/migrations/0001_phase1_schema.sql`, then `0002_v3_phase1.sql`, then `0003_routing_slots.sql`, then `0004_fix_deal_insert_rls.sql`, in that order. (Production ran 0001 to 0003 on Oct 30; **0004 still needs to be run there.**)
   **Oct 31 update (checklist fixes, comments and mentions):** in SQL Editor run `0005_checklist_gaps.sql`, then `0006_comments_mentions.sql`, **before** the new code deploys (the deal page reads the new tables). Both are additive and safe to run on the live database. Then, on Brookhollow: open **Edit details**, check the "Referenced but not in the file" box (the reader's three are pre-ticked), type **20** in **HOA information (days)**, and **Save changes**. That one save adds the three missing-document tasks, dates the HOA tasks Oct 23, and drops the invented survey date.
   **Nov 3 update (Offer Writer and Form Library):** in SQL Editor run `0009_offers_and_form_library.sql`. It is additive (new tables, two new storage buckets, three new brokerage columns) and safe on the live database. Run it before the deploy if you can. If the code lands first, Deals and the confirm screen keep working; only the new offer and form screens fail until it runs. Then Settings > Offers and forms: set the usual title company and buyer's broker compensation.
3. Authentication > URL Configuration: Site URL = your Vercel URL. Add `https://YOUR-APP.vercel.app/auth/callback` to Redirect URLs.
4. Project Settings > API: copy the URL, the anon key, and the service_role key.

## 3. Postmark (inbound only; the app never sends mail)
1. Create a server, then open its **Inbound** stream > Settings.
2. Copy the inbound address (looks like `abc123def@inbound.postmarkapp.com`).
3. Webhook URL: `https://postmark:YOUR_SECRET@YOUR-APP.vercel.app/api/inbound/email` (make up a long random YOUR_SECRET).
4. Leave **Include raw email content** OFF (it doubles the payload size).

## 4. Vercel
Import the repo. Add these environment variables, then deploy:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **legacy anon key** (starts `eyJ`), not the `sb_publishable_` key |
| `SUPABASE_SERVICE_ROLE_KEY` | the legacy **service_role** key (keep secret) |
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `INBOUND_ADDRESS_TEMPLATE` | the Postmark address with `+{token}` before the @, e.g. `abc123def+{token}@inbound.postmarkapp.com` |
| `INBOUND_WEBHOOK_SECRET` | YOUR_SECRET from step 3 |
| `NEXT_PUBLIC_APP_URL` | your Vercel URL |

Fluid compute should be on (it's the default for new projects): reads run in the background for up to 5 minutes.

## 5. Set up the brokerage
1. Open the app, sign in with your email, create the brokerage.
2. Settings > Brokerage profile: license number and broker of record. Profile: your TREC license number. (License numbers are how the reader knows which side and which agent.)
3. Copy your forward-to address from the home screen.

## 6. Live test
**Before forwarding, check the attachment size.** Postmark sends attachments inside the webhook, and Vercel rejects anything over 4.5 MB, so keep each test email under about 3 MB of attachments.

**A. Executed contract.** Forward it to your address.

| Watch | Expected |
|---|---|
| Settings > Recent forwarded emails | Row appears within seconds, then "Started a new deal" |
| Home | "Reading now", then "ready for you to check" (usually 1 to 2 minutes) |
| Review screen | Every field filled or flagged. Tap a few "Doc 1, p. N" links: the PDF opens beside the form with the words highlighted |
| Side and agent | Suggested from license numbers |
| After Confirm | Key dates with their contract paragraph, checklist with reasons, Documents slots with "Filed by reader" badges |

**B. Amendment for the same property.** Forward it to the same address.

| Watch | Expected |
|---|---|
| Recent forwarded emails | "Matched to a deal by address" |
| Deal page | Next action becomes "Review changes" |
| Review changes | Old value, new value, source highlight, dates that will shift (old date struck through), tasks added or dropped. "Emailed from ... Matched by property address" with a "Not for this deal" button |
| After Confirm | Dates moved, a History entry listing the shifts, the amendment in the Amendments slot |

## If something's off
Send Claude: a screenshot, the row from Recent forwarded emails, and the Vercel log lines that start with `[inbound]` (Vercel > Project > Logs, filter "inbound").

- **Email never appears in Recent forwarded emails:** it was rejected before reaching the app. Postmark > Inbound > Activity shows why (413 = too large, 401 = webhook password mismatch).
- **Stuck on "Reading":** after 10 minutes it flips to "couldn't read" with a Try again button.

## Sign-in emails show a code (one-time, Supabase dashboard)
The app signs people in with a code typed into the app (or an optional password), because on iPhone a link opens in Safari, not in the home-screen app. Supabase's default emails only contain the link, so add the code:

1. Authentication > Emails > Templates > **Magic Link**. Replace the body with:
   ```
   <h2>Your Contract Desk sign-in code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>Type this code in the app. It works for one hour.</p>
   <p>Or <a href="{{ .ConfirmationURL }}">sign in with this link</a> (only on the same browser you asked from).</p>
   ```
   Subject: `Your Contract Desk code: {{ .Token }}`
2. Do the same for **Confirm signup** (a brand-new email gets this one the first time).
3. Authentication > Sessions: leave "Time-box user sessions" and "Inactivity timeout" off, and keep the refresh-token reuse interval at its default (10 seconds). That's what keeps people signed in.

## Send sign-in emails through Postmark (removes the "too many emails" wait)
Supabase's built-in sender allows only a few emails per hour for the whole app, so a couple of retries locks everyone out for up to an hour. Point it at Postmark (already in use for inbound):

1. Postmark: in the server, create or use the default **Outbound** (transactional) stream and verify a sender address or domain (e.g. `noreply@clearrockrealty.com`; DNS is in Cloudflare).
2. Copy the server's API token (it's used as both the SMTP username and password).
3. Supabase: Authentication > Emails > SMTP Settings. Turn on custom SMTP. Host `smtp.postmarkapp.com`, port `587`, username and password = the token, sender = the verified address, sender name `Contract Desk`.
4. Supabase: Authentication > Rate Limits. Set emails per hour to something comfortable, e.g. 100.
