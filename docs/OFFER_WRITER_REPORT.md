# Offer Writer v1 + Form Library: build report (Nov 3, 2026)

## 1. Forms and revisions pinned

Bundled in `forms/trec/`, the fillable originals from Contract_Desk_Forms.zip. Each file is checked against its SHA-256 every time it is read; a swapped or edited file refuses to render. The flat 20-19 reference copy is not used anywhere.

| Form | Revision | Fillable fields | SHA-256 | In the packet when |
|---|---|---|---|---|
| TREC 20-19 One to Four Family Residential Contract (Resale) | 05-04-2026 | 279 per the brief; 280 widgets found on the pages | `3620b6e6…7320da` | always |
| TREC 40-11 Third Party Financing Addendum | 11-04-2024 | 64 | `98976d5b…cebe5` | any loan type |
| TREC 36-11 Mandatory Membership in a POA | 05-04-2026 | 17 | `91c14247…02be7eb` | HOA checked |
| TREC 56-0 Lead-Based Paint | 05-04-2026 | 25 | `515bda0a…07dbf868` | checked (suggested when built before 1978) |
| TREC 49-1 Right to Terminate Due to Lender's Appraisal | 11-15-18 | 11 | `9cc7f950…5e4b23` | checked (conventional or other only) |

Packet order: 20-19 first, then addenda in Paragraph 22 order, then unassigned library forms in pick order. No TXR form is bundled.

## 2. Field map (Term key to form field)

Field names on the 20-19 are often misleading (for example `Seller and` is the Buyer blank), so each was mapped by the printed label beside it and checked by rendering. "(choice, agent picks)" rows are box groups set from a Terms choice; if no choice is made they appear in Blanks left.

### TREC 20-19 (05-04-2026): One to Four Family Residential Contract (Resale)

| Term key | Form field (exact AcroForm name) | Where on the form |
|---|---|---|
| `sellers` | `1 PARTIES The parties to this contract are` | Para 1: Seller |
| `buyers` | `Seller and` | Para 1: Buyer |
| `lot` | `A LAND Lot` | Para 2A: Lot |
| `block` | `Block` | Para 2A: Block |
| `subdivision` | `undefined` | Para 2A: Addition (subdivision) |
| `property_city` | `Addition City of` | Para 2A: City |
| `property_county` | `County of` | Para 2A: County |
| `property_street + city + ZIP` | `Texas known as` | Para 2A: Known as (address/ZIP) |
| `computed: cash portion` | `undefined_3` | Para 3A: Cash portion |
| `financing_type (loan)` | `B Sum of all financing described in the attached` | Para 3B: Third Party Financing Addendum box |
| `financed_amount` | `undefined_4` | Para 3B: Sum of financing |
| `sales_price` | `undefined_5` | Para 3C: Sales price |
| `property_street + city + ZIP` | `Page 2 of 10` | Page 2 header: address |
| `property_street + city + ZIP` | `Page 3 of 10` | Page 3 header: address |
| `property_street + city + ZIP` | `Contract Concerning` | Page 4 header: address |
| `property_street + city + ZIP` | `Contract Concerning_2` | Page 5 header: address |
| `property_street + city + ZIP` | `Contract Concerning_3` | Page 6 header: address |
| `property_street + city + ZIP` | `Page 7 of 10` | Page 7 header: address |
| `property_street + city + ZIP` | `Contract Concerning_4` | Page 8 header: address |
| `property_street + city + ZIP` | `Address of Property` | Page 9 header: address |
| `property_street + city + ZIP` | `Addr of Prop` | Page 10 header: address |
| `property_street + city + ZIP` | `Address of Property_2` | Page 11 header: address |
| `property_street + city + ZIP` | `Address of Property_26` | Page 12 header: address |
| `title_company` | `undefined_6` | Para 5A: Escrow Agent |
| `(leave blank)` | `other party in writing before entering into a contract of sale  Disclose if applicable` | Para 5A: Escrow Agent address |
| `earnest_money` | `as earnest money to` | Para 5A: Earnest money |
| `option_fee` | `as earnest money to 2` | Para 5A: Option fee |
| `option_period_days` | `the Title Company and Buyers lenders Check one box only` | Para 5B: Option period days |
| `title_company` | `insurance Title Policy issued by` | Para 6A: Title Company |
| `survey_option = seller_existing` | `Buyer` | Para 6C(1): Seller furnishes existing survey |
| `survey_days` | `than 3 days prior to Closing Date` | Para 6C(1): days |
| `survey_option = buyer_new` | `Within three` | Para 6C(2): Buyer obtains new survey |
| `survey_days` | `3 days prior` | Para 6C(2): days |
| `survey_option = seller_new` | `Within four` | Para 6C(3): Seller furnishes new survey |
| `survey_days` | `receipt or the date specified in this paragraph whichever is earlier` | Para 6C(3): days |
| `(leave blank)` | `the Commitment Exception Documents and the survey Buyers failure to object within the` | Para 6D: Days to object |
| `addenda includes hoa` | `1Within` | Para 6E(2): Property is subject to a POA |
| `addenda excludes hoa` | `2 Within` | Para 6E(2): Property is not subject to a POA |
| `closing_date` | `A The closing of the sale will be on or before` | Para 9A: Closing date (month, day) |
| `closing_date` | `20` | Para 9A: Closing year |
| `possession` | `will` | Para 10A: Possession upon closing and funding |
| `buyer_broker_comp_type` | `Seller as List Brok Sub agent` | Para 12B(1): Seller will pay |
| `buyer_broker_comp_type = amount` | `Seller as List Brok Sub agent27` | Para 12B(1): $ box |
| `buyer_broker_comp_value` | `acknowledged by Seller and Buyers agreement to pay Seller 130` | Para 12B(1): Amount |
| `buyer_broker_comp_type = percent` | `Seller only as Sellers agent` | Para 12B(1): % box |
| `buyer_broker_comp_value` | `acknowledged by Seller and Buyers agreement to pay Seller 31` | Para 12B(1): Percent |
| `buyer_notice_address` | `when mailed to handdelivered at or transmitted by fax or electronic transmission as follow15` | Para 21: Buyer address |
| `buyer_notice_phone` | `Phone 5217` | Para 21: Buyer phone |
| `buyer_notice_email` | `undefined_2013` | Para 21: Buyer email |
| `buyer_broker_address` | `when mailed to handdelivered at or transmitted by fax or electronic transmission as follows` | Para 21: Buyer's agent address |
| `buyer_agent_phone` | `Phone 52` | Para 21: Buyer's agent phone |
| `buyer_agent_email` | `undefined_20` | Para 21: Buyer's agent email |
| `listing_agent_phone` | `undefined numb 21` | Para 21: Seller's agent phone |
| `listing_agent_email` | `undefined numb 22` | Para 21: Seller's agent email |
| `addenda: third_party_financing` | `Addendum for Reservation of Oil Gas` | Para 22: Third Party Financing Addendum |
| `addenda: appraisal_termination` | `Addendum for BackUp Contract` | Para 22: Appraisal termination addendum |
| `addenda: lead_based_paint` | `Loan Assumption Addendum_2` | Para 22: Lead-based paint addendum |
| `addenda: hoa` | `Check Box9` | Para 22: HOA addendum |
| `listing_broker_firm` | `Other Broker Firm` | Broker info: Listing broker firm |
| `listing_broker_license` | `Listing Broker Firm` | Broker info: Listing firm license |
| `listing_agent_name` | `License No_4` | Broker info: Listing associate |
| `listing_agent_email` | `License No_2` | Broker info: Listing associate email |
| `listing_agent_phone` | `List Assoc Name` | Broker info: Listing associate phone |
| `listing_agent_license` | `License No_5` | Broker info: Listing associate license |
| `buyer_broker_firm` | `Associates Email Address` | Broker info: Buyer's broker firm |
| `buyer_broker_address` | `Listing Associates Email Address` | Broker info: Buyer's broker address |
| `buyer_broker_license` | `Phone` | Broker info: Buyer's broker firm license |
| `buyer_agent_name` | `Licensed Supervisor of Associate` | Broker info: Buyer's associate |
| `buyer_agent_email` | `License No_6` | Broker info: Buyer's associate email |
| `buyer_agent_phone` | `Other Brokers Address` | Broker info: Buyer's associate phone |
| `buyer_agent_license` | `Phone_2` | Broker info: Buyer's associate license |
| `buyer_supervisor_name` | `Licensed Supervisor of Listing Associate` | Broker info: Licensed supervisor |
| `buyer_supervisor_license` | `State` | Broker info: Supervisor license |
| (choice, agent picks) | `Sellers_2`, `Buyers expense no later` | Para 6A: Who pays the owner's title policy |
| (choice, agent picks) | `2Within`, `3Within` | Para 6A(8): Survey shortages exception |
| (choice, agent picks) | `Buyer`, `Within three`, `Within four` | Para 6C: Survey choice |
| (choice, agent picks) | `Within one`, `Within two` | Para 6C(1): Who pays a new survey if the existing one isn't accepted |
| (choice, agent picks) | `1 Buyer accepts the Property As Is`, `2 Buyer accepts the Property As Is provided Seller at Sellers expense shall complete the`, `upon` | Para 7B: Seller's Disclosure Notice |
| (choice, agent picks) | `As Is`, `As Is except` | Para 7D: Acceptance of property condition (as is) |
| (choice, agent picks) | `Seller as List Brok Sub agent2`, `Dollar Amt2`, `Dollar Amt` | Para 7: Seller's Water Disclosure |
| (choice, agent picks) | `Seller as List Brok Sub agent` | Para 12B(1): Seller's contribution to Buyer's broker |

### TREC 40-11 (11-04-2024): Third Party Financing Addendum

| Term key | Form field (exact AcroForm name) | Where on the form |
|---|---|---|
| `property_street + city + ZIP` | `Street Address and City` | Page 1: Property |
| `property_street + city + ZIP` | `Address of Property` | Page 2 header: Property |
| `financing_type = conventional` | `1 Conventional Financing` | 1A: Conventional financing |
| `financing_type = conventional` | `a A first mortgage loan in the principal amount of` | 1A(1): First mortgage |
| `financed_amount` | `years with interest not to exceed` | 1A(1): Principal amount |
| `loan_term_years` | `any financed PMI premium due in full in 1` | 1A(1): Due in full in (years) |
| `loan_rate_cap` | `any financed PMI premium due in full in 2` | 1A(1): Interest not to exceed (%) |
| `(leave blank)` | `per annum for the first` | 1A(1): Rate cap applies for the first (years) |
| `(leave blank)` | `shown on Buyers Loan Estimate for the loan not to exceed` | 1A(1): Origination charges not to exceed (%) |
| `financing_type = fha` | `3 FHA Insured Financing A Section` | 1C: FHA insured financing |
| `(leave blank)` | `undefined` | 1C: FHA Section |
| `financed_amount` | `excluding any financed MIP amortizable monthly for not less` | 1C: Loan amount |
| `loan_term_years` | `than` | 1C: Term (years) |
| `loan_rate_cap` | `years with interest not to exceed_2` | 1C: Interest not to exceed (%) |
| `(leave blank)` | `Text1` | 1C: Rate cap applies for the first (years) |
| `(leave blank)` | `not to exceed` | 1C: Origination charges not to exceed (%) |
| `financing_type = va` | `6 Reverse Mortgage Financing A reverse mortgage loan also known as a Home Equity` | 1D: VA guaranteed financing |
| `financed_amount` | `excluding_2` | 1D: Loan amount |
| `loan_term_years` | `any financed Funding Fee amortizable monthly for not less than` | 1D: Term (years) |
| `loan_rate_cap` | `not to exceed_2` | 1D: Interest not to exceed (%) |
| `(leave blank)` | `per annum for the first_3` | 1D: Rate cap applies for the first (years) |
| `(leave blank: shared by 1D and 1G)` | `Text2` | 1D/1G: Origination charges not to exceed (%) |
| `financing_type = other` | `6 Reverse Mortgage Financing A reverse mortgage loan also known as a Home Equity-1` | 1G: Other financing |
| `(leave blank)` | `excluding_2-1` | 1G: Name of lender |
| `financed_amount` | `not to exceed-1` | 1G: Principal amount |
| `loan_term_years` | `any financed Funding Fee amortizable monthly for not less than-1` | 1G: Due in (years) |
| `loan_rate_cap` | `not to exceed_2-1` | 1G: Interest not to exceed (%) |
| `(leave blank)` | `per annum for the first_3-1` | 1G: Rate cap applies for the first (years) |
| `fin_approval_days` | `Check Box2` | 2A: Subject to Buyer Approval |
| `fin_approval_days` | `Conversion Mortgage loan in the original principal amount of` | 2A: Buyer may terminate within (days) |
| `(leave blank)` | `value of the Property established by the Department of Veterans Affairs` | 4: FHA/VA appraised value amount |
| (choice, agent picks) | `Check Box2`, `This contract is subject to Buyer obtaining Buyer Approval If Buyer cannot obtain Buyer` | 2A: Buyer Approval (subject to, or not) |
| (choice, agent picks) | `will-1`, `will-2` | 1G: Buyer does / does not waive termination rights |

### TREC 36-11 (05-04-2026): Addendum for Property Subject to Mandatory Membership in a Property Owners Association

| Term key | Form field (exact AcroForm name) | Where on the form |
|---|---|---|
| `property_street + city + ZIP` | `Street Address and City` | Property |
| `hoa_association` | `Name of Property Owners Association Association and Phone Number` | Association name and phone |
| `hoa_info_days` | `1 Within` | A(1): Seller delivers Subdivision Information |
| `hoa_info_days` | `the Subdivision Information to the Buyer If Seller delivers the Subdivision Information Buyer may terminate` | A(1): Within (days) |
| `hoa_fee_cap` | `D DEPOSITS FOR RESERVES Buyer shall pay any deposits for reserves required at closing by the Association` | C: Buyer's fees not to exceed ($) |
| (choice, agent picks) | `1 Within`, `undefined`, `3Buyer has received and approved the Subdivision Information before signing the contract Buyer`, `4Buyer does not require delivery of the Subdivision Information` | A: Subdivision Information choice |
| (choice, agent picks) | `Buyer`, `Seller shall pay the Title Company the cost of obtaining the` | D: Who pays the Title Company's cost for the information |

### TREC 56-0 (05-04-2026): Addendum for Seller's Disclosure of Information on Lead-Based Paint and Lead-Based Paint Hazards

| Term key | Form field (exact AcroForm name) | Where on the form |
|---|---|---|
| `property_street + city + ZIP` | `Street Address and City` | Property |
| (choice, agent picks) | `Check Box11`, `Check Box12` | C: Buyer's rights (waive, or risk assessment within 10 days) |

### TREC 49-1 (11-15-18): Addendum Concerning Right to Terminate Due to Lender's Appraisal

| Term key | Form field (exact AcroForm name) | Where on the form |
|---|---|---|
| `property_street + city + ZIP` | `Street Address and City` | Property |
| `appraisal_option = waiver` | `1 WAIVER Buyer w aives Buyers right to terminate the contract under Paragraph 2B of the` | (1) Waiver |
| `appraisal_option = partial_waiver` | `2 PARTIAL WAIVER Buyer w aives Buyers right to terminate the contract under Paragraph 2B` | (2) Partial waiver |
| `appraisal_value` | `ii the opinion of value is` | (2) Opinion of value is $__ or more |
| `appraisal_option = additional_right` | `3 ADDITIONAL` | (3) Additional right to terminate |
| `appraisal_days` | `days after the Effective Date if` | (3) Within (days) |
| `appraisal_value` | `than` | (3) Appraised value less than $ |
| (choice, agent picks) | `1 WAIVER Buyer w aives Buyers right to terminate the contract under Paragraph 2B of the`, `2 PARTIAL WAIVER Buyer w aives Buyers right to terminate the contract under Paragraph 2B`, `3 ADDITIONAL` | Waiver, partial waiver, or additional right (check one) |

Never filled before execution (export throws if anything tries): 20-19 `EXECUTED the`, `day of`, `20_2` (the effective date).

## 3. Removals (before additions)

None. No existing behavior was removed. Changed in place: the contacts list row gains a "New offer" button for buyers; the confirm screen gains the Written vs Signed card above the form when a match exists; confirming a matched contract marks that offer executed.

## 4. Files

Changed: `app/contacts/page.tsx`, `app/deals/page.tsx`, `app/settings/page.tsx`, `app/t/[id]/review/actions.ts`, `app/t/[id]/review/page.tsx`, `lib/addenda.ts` (appraisal addendum label), `next.config.ts` (ship the five PDFs with the server functions), `DEPLOY.md`.

New:
- Forms: `forms/trec/*` (5 PDFs, field name lists, SOURCE-README.md)
- Libraries: `lib/forms/acroform.ts`, `lib/forms/registry.ts`, `lib/forms/integrity.ts`, `lib/forms/library.ts`, `lib/offer/terms.ts`, `lib/offer/render.ts`, `lib/offer/match.ts`, `lib/offer/server.ts`
- Screens: `app/o/actions.ts`, `app/o/[id]/page.tsx` (Terms), `app/o/[id]/preview/page.tsx` (Preview), `app/api/offers/[id]/preview/route.ts`, `app/settings/forms/page.tsx`, `app/settings/forms/[id]/page.tsx`, `app/settings/forms/actions.ts`
- Components: `OfferTermsEditor.tsx`, `PacketPreview.tsx`, `OfferPackets.tsx`, `WrittenVsSigned.tsx`, `FormLibrary.tsx`
- Database: `supabase/migrations/0009_offers_and_form_library.sql`
- Tests: `tests/offer-render.test.ts`, `tests/form-library.test.ts`, `tests/offer-match.test.ts`, `tests/db/offers-library.test.ts`, `tests/fixtures/brookhollow-offer.ts`

## 5. Tests run

`npm test`: 20 files, 159 tests, all pass. `tsc --noEmit` clean. `next build` clean; build traces confirm all five PDFs ship with the offer routes.

Acceptance checks covered:
- Brookhollow cash offer (Kidd / Rose, 17 W Brookhollow Dr, $425,000, $4,000 earnest, $200 / 10 days, close by Nov 11, 2026, Service Title, HOA 20 days, $1,500 cap): packet is 20-19 + 36-11 in that order; Para 3 cash pattern; HOA checked in Para 22; effective date blank.
- Text and geometry comparison against the blank 20-19, 36-11 and 40-11: every printed word stays at its position, added text only inside field boxes, page sizes equal.
- Conventional auto-includes 40-11 (locked); export blocked until loan amount, term and rate cap are set.
- Para 22 consistency over 80 addenda/financing combinations: a box is checked exactly when its form is in the packet.
- Export blocked only by buyer, address, price (plus the financing fields for a loan); everything else lands in Blanks left.
- No effective-date Term; no sending code in any offer file (static scan).
- Return match: address plus one buyer last name; two plausible offers gives no match; a changed signed price flags exactly that row.
- Form Library: flat PDF refused with the fillable-original message; non-PDF refused; TXR needs the acknowledgment on upload and on a class change to TXR; nothing auto-confirmed; incomplete mapping is never offered; a Term entered once fills every form that maps it; a new revision keeps only identical field names; slot and unassigned ordering.
- Database (PGlite with the real migrations and RLS): brokerage B can't see A's forms, versions or acknowledgments; agents can see the library but can't upload, map, rename or reclassify; an uploaded version's file can't be swapped; offers visible only to their agent and broker/staff; packets can't be written or changed by users.

Not run: the return match against the real executed Brookhollow PDF (this session has no API key to read it). The fixture is the brief's cash version; the existing `tests/brookhollow.test.ts` models Brookhollow as conventional, so expect the live read to differ there.

## 6. Built but not asked for (unapproved, each easy to remove)

1. **Buyer approval (days)** field inside the Financing Addendum box (40-11 Para 2A). Optional; left empty, it's a blank.
2. **"Changed since the last export"** banner and Deals line when an out-for-signature offer is edited.
3. **Offers list on Deals** (drafts and out for signature) and the **"Write an offer"** button there.
4. **Settings > Offers and forms > Offer defaults** (usual title company, usual 12B compensation): the place the brief's "brokerage default" is set.
5. **Built-in TREC forms list** in that settings page (names and revisions, read-only).
6. **Archive** switch for library forms (hidden from agents; past packets unchanged).
7. Library form detail shows **version history** and the **TXR acknowledgment records** (who, when, text version, why).
8. **TXR acknowledgment also required when uploading a new revision** of a TXR form (the brief requires it on upload and on class change; I treated a new file as a new upload).
9. Mapper extras: "Still to map / All fields" filter and an **Open the form** button. Field location is shown as a page number, not highlighted on the page.
10. **Typed buyer names become buyer contacts** when the agent goes to Preview (so the next offer can start from the contact).
11. **Pinned SHA-256 check** on the five bundled PDFs.

## 7. Calls I made where the brief was silent or conflicted

- Possession: only "upon closing and funding" is offered. The 20-19's other possession choice has no fillable blank to put a date in.
- Packet file name: the brief's placeholders didn't survive; I used `Offer - 17 W Brookhollow Dr - Kidd.pdf`, then ` v2`, ` v3`.
- The Offer file is its own record (`offers`), linked to the deal when the executed contract is confirmed. The written Terms stay on the offer as history; the deal carries the signed ones.
- 49-1 is offered only for Conventional and Other, per its own printed rule (not for FHA or VA).
- 6E(2) "is / is not subject to a POA" follows whether the HOA addendum is included.
- 40-11 `Text2` is shared by two printed blanks, so it is always left blank (and shows in Blanks left).
- Signature fields on uploaded forms don't need mapping and are never filled.
- Preview is rendered by the exact code that exports, and is never stored; only Export writes a file.
