# Ren import format, version 1

The published contract between Ren's terms sheet and Contract Desk's Offer Writer. A file written to this document imports exactly as described. It is also the target shape for the future FlexMLS (Spark) and LCAD pull.

Worked example: `tests/fixtures/Offer_Import_2131_S_Loop_289.json` (the Gurrola offer, 2131 S Loop 289).

## The file

- One JSON object, UTF-8, file extension `.json`.
- `ren_import_version` must be `1`. Any other version is refused with a message; nothing is changed.
- Every other key is optional. A missing key changes nothing on the offer.
- Keys not listed here are ignored and listed back to the agent after the import ("Not part of the format, ignored").
- Keys listed here as "Not used yet" are read and listed back ("In the file but not used"), so nothing Ren stages disappears silently.
- Numbers are plain JSON numbers (`135000`, `7.75`). Strings with `$`, commas or `%` are accepted for numbers. Dates are `YYYY-MM-DD`.
- A value that doesn't fit its key (a word where a number belongs, a date that isn't a date, a choice that isn't one of the listed values) is not placed; it's listed under the import's problems.

## How an import is placed

- **Blanks only.** An imported value fills a Term that is empty, or that still holds only a computed or standard value the agent hasn't touched (the 1% earnest money, the option fee tier, the brokerage's usual title company, the survey default). It never replaces a value the agent typed or a value an earlier import placed. Kept values are listed back ("Kept what was already on the offer for: ...").
- **Imported values count as hand-entered.** The brokerage computations never move them afterwards (an imported earnest money stays put when the price changes).
- **Addenda only get added.** `true` includes the addendum and checks its Para 22 box. `false` or a missing key leaves the box as it is. Including `appraisal_addendum` includes the appraisal addendum (Conventional or Other financing only; otherwise it's listed as a problem). Any loan type includes the Third Party Financing Addendum, the same as choosing it on screen.
- **Only draft offers.** An import starts a new offer (Deals > Import terms file) or fills a draft's Terms screen. An offer already exported can't be imported into.
- **Review comes next.** After an import the agent lands on the Terms screen with the line "Terms imported · prepared <date> · MLS <number>". Nothing exports without the normal Preview step.

## Keys

### `ren_import_version`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `ren_import_version` | number | Format version. Must be 1. | Not used yet (read and listed) |

### `source`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `source.prepared` | date YYYY-MM-DD | Date Ren prepared the sheet (YYYY-MM-DD). | Shown in the "Terms imported" line |
| `source.mls_number` | text | MLS number of the listing. | Shown in the "Terms imported" line |
| `source.notes` | text | Ren's notes about the sheet. | Not used yet (read and listed) |

### `parties`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `parties.buyers[].name` | text (one per array item) | Each buyer's full name, as it should read in Para 1. | buyers |
| `parties.buyers[].email` | text | Buyer email. The first buyer's is used for Para 21 notices. | buyer_notice_email (first buyer) |
| `parties.buyers[].phone` | text | Buyer phone. The first buyer's is used for Para 21 notices. | buyer_notice_phone (first buyer) |
| `parties.sellers[].name` | text (one per array item) | Each seller's name as of record (an estate or trust as styled). | sellers |

### `property`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `property.address` | text | Street address. | property_street |
| `property.city` | text | City. | property_city |
| `property.state` | text | State. Must be TX; not stored (the forms are Texas forms). | Not used yet (read and listed) |
| `property.zip` | text | ZIP code. | property_zip |
| `property.county` | text | County. | property_county |
| `property.legal_description` | text | Legal description in the form "Lot 377, Block 4, Beverly Heights Addition" (Block optional). Split into Lot, Block and Addition for Para 2A; anything that doesn't split cleanly is reported and left for typing. | lot, block, subdivision |
| `property.lot` | text | Lot, when given separately (wins over legal_description). | lot |
| `property.block` | text | Block, when given separately. | block |
| `property.subdivision` | text | Addition or subdivision name, without the word "Addition" (the form prints it). | subdivision |
| `property.year_built` | number | Year built (suggests the lead-based paint addendum before 1978). | year_built |
| `property.hoa` | true / false | Whether the property is in a mandatory owners association. Informational: the HOA addendum box follows addenda.hoa. | Not used yet (read and listed) |

### `terms`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `terms.sales_price` | number | Sales price in dollars. | sales_price |
| `terms.financing` | one of `cash`, `conventional`, `fha`, `va`, `other` | Financing selector. | financing_type |
| `terms.cash_down` | number | Cash portion (Para 3A). Checked against price minus loan; used to work out the loan amount only when the loan amount is missing. | financed_amount (only when financing_addendum.loan_amount is missing) |
| `terms.earnest_money` | number | Earnest money. | earnest_money |
| `terms.option_fee` | number | Option fee. | option_fee |
| `terms.option_period_days` | number | Option period in days. | option_period_days |
| `terms.closing_date` | date YYYY-MM-DD | Closing on or before (YYYY-MM-DD). | closing_date |
| `terms.possession` | one of `closing_and_funding` | Possession. Only closing_and_funding is supported. | possession (fixed) |
| `terms.title_company` | text | Title company (Para 6A) and escrow agent (Para 5A). | title_company |
| `terms.escrow_agent` | text | Escrow agent. Same field as title_company; if both are given they must match. | title_company |
| `terms.title_company_address` | text | Title company address. | Not used yet (read and listed) |
| `terms.title_company_phone` | text | Title company phone. | Not used yet (read and listed) |
| `terms.title_policy_payer` | one of `seller`, `buyer` | Owner's title policy paid by (Para 6A). | title_policy_payer |
| `terms.survey.option` | one of `6C(1)`, `6C(2)`, `6C(3)` | Survey paragraph: 6C(1) Seller's existing survey, 6C(2) Buyer's new survey, 6C(3) Seller's new survey. | survey_option |
| `terms.survey.furnish_days` | number | Days to furnish the survey. | survey_days |
| `terms.survey.new_survey_payer` | one of `seller`, `buyer` | 6C(1) only: who pays a new survey if the existing one isn't accepted. | survey_new_payer |
| `terms.residential_service_contract` | number | Residential service contract amount. | Not used yet (read and listed) |

### `financing_addendum`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `financing_addendum.loan_type` | one of `conventional`, `fha`, `va`, `other` | Loan type. Used when terms.financing is missing; must agree with it when both are given. | financing_type |
| `financing_addendum.loan_amount` | number | Loan amount. | financed_amount |
| `financing_addendum.term_years` | number | Loan term in years. | loan_term_years |
| `financing_addendum.rate_cap_pct` | number | Interest rate cap, percent (7.75 = 7.75%). | loan_rate_cap |
| `financing_addendum.origination_cap_pct` | number | Origination charges cap, percent. | Not used yet (read and listed) |
| `financing_addendum.buyer_approval.applies` | true / false | Whether the offer is subject to Buyer Approval (40-11 Para 2A). false leaves it off. | fin_approval_days (with days) |
| `financing_addendum.buyer_approval.days` | number | Days for Buyer Approval. | fin_approval_days |

### `appraisal_addendum`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `appraisal_addendum.option` | one of `1`, `2`, `3` | 49-1 paragraph: 1 waiver, 2 partial waiver, 3 additional right to terminate. Including this object includes the addendum (Conventional or Other financing only). | addenda: appraisal_termination; appraisal_option |
| `appraisal_addendum.days` | number | Option 3: days to terminate. | appraisal_days |
| `appraisal_addendum.floor_price` | number | Options 2 and 3: the opinion-of-value amount. | appraisal_value |

### `addenda`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `addenda.hoa` | true / false | true includes the HOA addendum (TREC 36-11). false or missing leaves the box as it is. | addenda: hoa |
| `addenda.lead_based_paint` | true / false | true includes the lead-based paint addendum (TREC 56-0). false or missing leaves it as it is. | addenda: lead_based_paint |
| `addenda.residential_lease` | true / false | Residential lease addendum. Not a form the Offer Writer includes yet. | Not used yet (read and listed) |

### `hoa_addendum`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `hoa_addendum.association` | text | Association name and phone (36-11). | hoa_association |
| `hoa_addendum.info_days` | number | Days to deliver the subdivision information (36-11). | hoa_info_days |
| `hoa_addendum.fee_cap` | number | Buyer pays association fees up to this amount (36-11). | hoa_fee_cap |

### `broker_compensation`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `broker_compensation.buyer_agent_comp_pct` | number | Buyer's broker compensation as a percent of the price (Para 12B). | buyer_broker_comp_type = percent, buyer_broker_comp_value |
| `broker_compensation.buyer_agent_comp_amount` | number | Buyer's broker compensation as a dollar amount (use one or the other). | buyer_broker_comp_type = amount, buyer_broker_comp_value |

### `listing_side`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `listing_side.brokerage_name` | text | Listing brokerage. | listing_broker_firm |
| `listing_side.brokerage_license` | text | Listing brokerage license number. | listing_broker_license |
| `listing_side.brokerage_address` | text | Listing brokerage address (broker information page). | listing_broker_address |
| `listing_side.brokerage_phone` | text | Listing brokerage phone. | Not used yet (read and listed) |
| `listing_side.agent_name` | text | Listing agent. | listing_agent_name |
| `listing_side.agent_license` | text | Listing agent license number. | listing_agent_license |
| `listing_side.agent_email` | text | Listing agent email. | listing_agent_email |
| `listing_side.agent_phone` | text | Listing agent phone. | listing_agent_phone |

### `notices`

| Key | Type | Meaning | Fills on the offer |
|---|---|---|---|
| `notices.buyer_notice_address` | text | Buyer's mailing address for Para 21 notices. | buyer_notice_address |
| `notices.buyer_notice_name` | text | Name notices go to. | Not used yet (read and listed) |
| `notices.buyer_copy_to_email` | text | Email copied on buyer notices. | Not used yet (read and listed) |
| `notices.seller_notice_via` | text | How the seller receives notices. | Not used yet (read and listed) |

### Arrays

`parties.buyers` and `parties.sellers` are arrays of objects; `[]` in the key names above means "each item". Names land in the order given. Only the first buyer's email and phone are used (Para 21).

## Terms with no import key

| Terms field | Why |
|---|---|
| buyer_contact_ids | Links to contacts; the typed buyer names become contacts at Preview. |
| uploaded_forms, extra | Library forms and their extra Terms are picked per offer. |
| buyer_broker_firm, buyer_broker_license, buyer_broker_address, buyer_agent_name, buyer_agent_license, buyer_agent_email, buyer_agent_phone, buyer_supervisor_name, buyer_supervisor_license | Our own side comes from the brokerage and agent profiles. |
| intentional_blanks, touched, imported | Bookkeeping the app keeps itself. |

Everything else on the offer has a key above. Possession is fixed at closing and funding (the only choice the Offer Writer supports), so `terms.possession` is checked, not placed.

## Changing the format

Additions that only add optional keys stay version 1. Renaming or changing the meaning of a key is a new version. The importer and this document change together: `tests/ren-import.test.ts` fails if a key the importer reads is missing here, or if a Terms field has neither a key nor a line in the table above.
