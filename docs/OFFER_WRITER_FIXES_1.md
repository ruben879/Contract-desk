# Offer Writer fixes from the first live use (Nov 3, 2026): report

## Removals (before additions)
None. The renderer used to write entered values in plain black Helvetica; it now uses the fill style below. Nothing else that existed was removed.

## 1. Brokerage-code computations
Prefill automatically, stay editable, and stop moving once the agent types into that field. Each offer keeps a list of the Terms the agent has edited by hand (`touched`); computations never write over those.

| Term | Computed / starting value | Where |
|---|---|---|
| Earnest money | 1% of price, rounded down to $100 ($135,000 gives $1,300); follows the price until edited | Para 5A `as earnest money to` |
| Option fee | $100 up to and including $300,000; $150 up to and including $400,000; $250 above; follows the price until edited | Para 5A `as earnest money to 2` |
| Option period | 10 days | Para 5B |
| Escrow agent / title company | the brokerage's Usual title company (v1 setting) | Para 5A `undefined_6`, 6A |
| Owner's title policy | Seller's expense (new Term `title_policy_payer`) | 6A: `Sellers_2` = Seller, `Buyers expense no later` = Buyer |
| Survey | 6C(1), Seller furnishes existing survey within 5 days; Buyer pays a new survey if not accepted (new Term `survey_new_payer`) | 6C(1): `Buyer` box, `than 3 days prior to Closing Date` = days; `Within one` = Seller's expense, `Within two` = Buyer's expense |

The 6A and 6C(1) box field names are misleading, so each was identified by its position next to the printed "Seller's" / "Buyer's" and confirmed by rendering. Before this round, neither the 6A payer nor the 6C(1) new-survey payer was filled at all, and the survey had no default.

Settings > Offers and forms > Offer defaults now holds the earnest percent and rounding step, the three option fee tiers, and option period days, per brokerage (`brokerages.offer_defaults`, migration 0010, seeded with the values above).

Offers that already existed: values computed on every read until execution, so the Gurrola offer gets earnest and option fee the moment it's opened or previewed. Offers saved before this change treat any value already present as hand-entered, so nothing an agent typed is recomputed.

## 2. Fill style
Every value the renderer writes, bundled and library forms, Preview and Export alike, is Helvetica-BoldOblique (a PDF standard font) in #0033CC. Only the field's color and font change; its font size is kept. Checkbox marks, printed text, layout and pagination are untouched; blanks stay blank. Verified by the text-and-position comparison against the blank 20-19, and by checking every drawn value in the rendered file.

## Files
Changed: `lib/offer/terms.ts`, `lib/offer/server.ts`, `lib/forms/acroform.ts`, `lib/forms/registry.ts`, `app/o/actions.ts`, `app/o/[id]/page.tsx`, `components/OfferTermsEditor.tsx`, `app/settings/forms/page.tsx`, `components/FormLibrary.tsx`, `DEPLOY.md`.
New: `supabase/migrations/0010_offer_computations.sql`, `tests/offer-defaults.test.ts`, this report.

## Tests run
`npm test`: 21 files, 169 tests, all pass (10 new: the $135,000 worked example, tier boundaries at exactly $300,000 and $400,000, hand edits stop recomputation, a cleared value stays cleared, legacy offers keep their values, settings fallback, the Gurrola-style Para 5A/5B/6A/6C(1) values, fill style on bundled and library forms with checkbox marks excluded, 20-19 integrity). `tsc` clean, `next build` clean. The database tests run migration 0010.

For Ren's Gurrola check: re-open the offer (the computed values fill in), confirm the title company, Preview, Export. Earnest, option fee and escrow agent should print in the Para 5A blanks in blue.

## Built but not asked for (unapproved)
1. **Library mapper page numbers fixed**: it showed every field one page later than it really is. Bug fix, but outside this note.
2. **Small hints under Earnest and Option fee** ("1% of price", "From the price") while they're still computed; they disappear once the agent edits the field.
3. **6A payer and 6C(1) new-survey payer as Seller/Buyer choices on the Terms screen.** Needed to make those defaults editable.
4. **Legacy rule**: offers saved before this change treat any value already there as hand-entered.
5. **A cleared computed field stays blank** rather than refilling (it shows in Blanks left).

## Call to confirm
The note says "all of these values live in Settings" and then lists earnest, option tiers and option days. I put exactly that list in Settings. The title policy payer (Seller) and survey choice (6C(1), 5 days, Buyer pays a new one) are fixed starting values in code, explained on the Settings page. Say the word and they become settings too.
