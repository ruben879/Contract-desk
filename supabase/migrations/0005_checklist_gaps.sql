-- Brookhollow audit fixes (Oct 31):
-- 1. Documents the reader knows are missing (checked in Para 22 but not attached, or a
--    Seller's Disclosure marked received with no copy) become "get this in the file" tasks.
--    missing_docs is NULL until an agent confirms a list, so deals confirmed before this
--    migration still get the reader's suggestions the next time someone opens Edit details.
-- 2. HOA addendum deadline (seller or buyer obtains subdivision information within N days
--    of the effective date) lands on the HOA tasks.
-- 3. A term the contract leaves blank (survey Para 6C unchecked) is flagged as needs
--    attention instead of getting a default date. That rule lives in lib/deadlines/compute.ts;
--    here we only update the wording shown in Settings.

alter table transactions
  add column hoa_info_days integer,        -- HOA addendum, Para A: days after the effective date
  add column missing_docs text[];          -- addendum keys referenced by the contract but not in the file

-- New deadline rule for every brokerage, and for brokerages created from now on.
insert into deadline_rules (brokerage_id, key, label, contract_ref, anchor, default_days, use_contract_days, due_time, roll_weekends_holidays, needs_verification, notes, sort)
select id, 'hoa_info', 'HOA subdivision information due', 'HOA Addendum, Para A', 'effective_date', null, true, null, true, true,
  'Uses the day count written in the HOA addendum. Only applies when the HOA addendum is in the file. Blank in the addendum = needs attention. Verify.', 6
from brokerages
on conflict (brokerage_id, key) do nothing;

update deadline_rules
  set notes = 'Uses the day count written in the contract. If Para 6C is blank, the deal shows it as needs attention instead of a date. Verify.'
  where key = 'survey' and notes = 'Uses the contract day count when present, else this placeholder. Verify.';

create or replace function seed_deadline_rules(b uuid)
returns void language sql security definer set search_path = public as $$
  insert into deadline_rules (brokerage_id, key, label, contract_ref, anchor, default_days, use_contract_days, due_time, roll_weekends_holidays, needs_verification, notes, sort) values
  (b, 'earnest_money',    'Earnest money and option fee due', 'One to Four Contract, Para 5A', 'effective_date', 3,  false, null,    true, true, 'Placeholder 3 days after effective date. Verify.', 1),
  (b, 'option_end',       'Option period ends',               'One to Four Contract, Para 5B', 'effective_date', null, true, '17:00', false, true, 'Uses the day count written in the contract. Ends 5:00 p.m. local. Verify weekend rule.', 2),
  (b, 'title_commitment', 'Title commitment due',             'One to Four Contract, Para 6B', 'effective_date', 20, false, null,    true, true, 'Contract counts from title company receipt; placeholder counts from effective date. Verify.', 3),
  (b, 'survey',           'Survey due',                       'One to Four Contract, Para 6C', 'effective_date', null, true, null,   true, true, 'Uses the day count written in the contract. If Para 6C is blank, the deal shows it as needs attention instead of a date. Verify.', 4),
  (b, 'closing',          'Closing',                          'One to Four Contract, Para 9A', 'closing_date',   0,  false, null,    false, false, 'Date written in the contract.', 5),
  (b, 'hoa_info',         'HOA subdivision information due',  'HOA Addendum, Para A',          'effective_date', null, true, null,   true, true, 'Uses the day count written in the HOA addendum. Only applies when the HOA addendum is in the file. Blank in the addendum = needs attention. Verify.', 6)
  on conflict (brokerage_id, key) do nothing;
$$;
