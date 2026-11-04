# Nov 4 notes: Ren import, blue check marks, fill from a document

Three notes from Nov 4, built together. No database migration needed (everything new lives in the offer's Terms).

## Removals (before additions)
- Check marks the renderer draws are no longer black: they draw in #0033CC (supersedes "checkbox marks are untouched"). Boxes a form arrives already checked are still drawn exactly as the form has them.
- The two fill helpers briefly drafted inside the browser-callable actions file were moved to a server-only module before commit (nothing shipped).

## 1. Ren import (format version 1)
- **Where:** "Import terms file" on Deals (starts a new offer) and on a draft offer's Terms screen.
- **Published format:** `docs/REN_IMPORT_FORMAT.md`. Every key, its meaning, and the Terms field it fills; Terms with no key are listed; keys with no place yet are marked "Not used yet". The key table comes from the same list the importer reads, and a test fails if the two disagree.
- **Placement:** blanks only. An imported value fills an empty Term, or one still holding only a computed or standard value the agent hasn't touched (so on a new offer everything lands, including over the brokerage's default title company and comp). It never replaces anything typed or imported. Kept values are listed back. Imported values join the touched list, so computations never move them.
- **Addenda:** `true` adds the addendum and its Para 22 box; `false` or missing leaves the box alone. `appraisal_addendum` present adds the 49-1. Any loan adds the 40-11, same as typing.
- **Result line:** "Terms imported · prepared Nov 4, 2026 · MLS 202614455", with short notes underneath: values kept, problems, keys read but not used, unknown keys ignored.
- **Gurrola acceptance (test):** fresh offer gets the estate seller; Lot 377, Beverly Heights; True Title; $135,000, $27,000 down, $108,000 conventional, 7.75% cap, 30 years, 15-day buyer approval; 49-1 option 3, 30 days, $135,000; lead-based paint in; no HOA; close Dec 8, 2026; Stuart Bartley, Taylor Reid Realty. The export fills Para 1, Para 2, Para 5A and the listing broker block; the packet is 20-19, 40-11, 49-1, 56-0.
- **Legal description:** split into Lot / Block / Addition for Para 2A ("Lot 377, Beverly Heights Addition" gives Lot 377, Addition "Beverly Heights"; the form prints the word "Addition"). Anything that doesn't split cleanly is reported and left for typing.

## 2. Blue check marks
Boxes the renderer checks draw in #0033CC, on bundled and library forms, Preview and Export. The form's own mark is used, just colored; a mark that sets its own color gets a blue copy, the original left alone. Boxes a form came checked with are untouched. Tests: every renderer-drawn mark is blue; a library form arriving with a box checked draws that box as the form had it; the 20-19 text-and-position comparison still passes.

## 3. Fill from a document
- **Where:** "Fill from a document" next to Import terms file, on Deals and on a draft's Terms screen. One PDF.
- **Reader:** the intake reader's structured-output call (same model setting, retries, scan handling) with a facts-only field list: seller of record, address, county, legal description (or lot/block/addition), year built, HOA mandatory and name, title company as named, listing brokerage (name, license, address, phone), listing agent (name, license, email, phone), MLS number.
- **Facts only:** the reader's field list has no key for a price, earnest money, option terms or dates, and anything else it returns is dropped. Tested.
- **Blanks only** through the same placement as the Ren import; a second document fills more and overwrites nothing.
- **Honest blanks:** only high and medium confidence values are used. Anything missing or unclear stays blank and is listed: "Could not read: Listing agent phone (unclear, left blank), ...".
- **Suggestions, not decisions:** a mandatory HOA shows "Suggested" on the HOA checkbox; a pre-1978 year shows the existing lead-based paint suggestion. Neither box is checked by the fill.
- **Provenance:** "Filled from <file name>". The uploaded PDF is deleted right after it's read.
- **Acceptance:** tested with a reader answer shaped as a FlexMLS detail print of MLS #202614455 would come back: property facts, Lot 377 Beverly Heights, estate seller, True Title and the Bartley / Taylor Reid listing side fill; price, earnest and closing stay blank; the Ren import fills more. **Not yet run against a real FlexMLS print**: that needs the live app (the API key isn't in this session). It's the first thing to try once deployed.

## Files
Changed: `lib/forms/acroform.ts`, `lib/forms/registry.ts`, `lib/offer/terms.ts`, `lib/extract/read-contract.ts` (two helpers exported, unchanged), `app/o/actions.ts`, `app/o/[id]/page.tsx`, `app/deals/page.tsx`, `components/OfferTermsEditor.tsx`, `tests/offer-defaults.test.ts`, `vitest.config.mts`.
New: `lib/offer/ren-import.ts`, `lib/offer/fill.ts`, `lib/extract/read-facts.ts`, `app/api/offers/fill/route.ts`, `components/OfferFill.tsx`, `components/FillNote.tsx`, `docs/REN_IMPORT_FORMAT.md`, `tests/ren-import.test.ts`, `tests/offer-document-fill.test.ts`, `tests/fixtures/Offer_Import_2131_S_Loop_289.json`, `tests/fixtures/gurrola.ts`, this report.

## Tests run
`npm test`: 193 tests, all pass (22 new). `tsc` clean, `next build` clean. The database tests' time limit went from 5 to 30 seconds: building a fresh database with all eleven migrations now takes just over 5 seconds on this machine, which made three of them time out.

## Built but not asked for (unapproved)
1. **Listing brokerage address** is a new Term, printed on the 20-19 listing block's Address line (field named `License No`), filled from `listing_side.brokerage_address` and from documents, and editable on the Terms screen with the firm license no. (which wasn't on the screen before). Without it, the Gurrola export left that line blank.
2. **Format keys Ren's file doesn't use yet:** `property.lot` / `block` / `subdivision`, `hoa_addendum.association` / `info_days` / `fee_cap`, `listing_side.agent_license`, `broker_compensation.buyer_agent_comp_amount`, `notices.buyer_notice_address`. They give every Terms field an import key.
3. **Checks inside the file:** cash_down vs price minus loan, escrow_agent vs title_company, terms.financing vs loan_type, state must be TX; mismatches are listed as problems.
4. **Import and document fill only on drafts.** An offer already exported can't be filled.
5. **The uploaded PDF is deleted after reading** (only its file name is kept).
6. **Test time limit raised** to 30 seconds.

## Open for you
- `financing_addendum.origination_cap_pct` (1% in the Gurrola file) has a blank on the 40-11 but no Term, so it's read and listed, not placed. Same for the title company's address (Para 5A has a blank for it). Say the word and both become Terms.
- The residential lease addendum in Ren's file has no bundled form; it's listed as not used.
