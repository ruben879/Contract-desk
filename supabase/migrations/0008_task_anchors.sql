-- Design pass (Nov 1): every generated task traces to a date in the contract, or to a named
-- "no date in the contract" flag. "Whenever" now means only that the contract leaves it blank.
--
-- 1. Third Party Financing Addendum, Para 2A: buyer approval within N days of the effective date.
alter table transactions add column fin_approval_days integer;

insert into deadline_rules (brokerage_id, key, label, contract_ref, anchor, default_days, use_contract_days, due_time, roll_weekends_holidays, needs_verification, notes, sort)
select id, 'fin_approval', 'Buyer approval (financing) due', 'Third Party Financing Addendum, Para 2A', 'effective_date', null, true, null, true, true,
  'Uses the day count written in the financing addendum. Only applies when that addendum is in the file. Blank there = needs attention. Verify.', 7
from brokerages
on conflict (brokerage_id, key) do nothing;

create or replace function seed_deadline_rules(b uuid)
returns void language sql security definer set search_path = public as $$
  insert into deadline_rules (brokerage_id, key, label, contract_ref, anchor, default_days, use_contract_days, due_time, roll_weekends_holidays, needs_verification, notes, sort) values
  (b, 'earnest_money',    'Earnest money and option fee due', 'One to Four Contract, Para 5A', 'effective_date', 3,  false, null,    true, true, 'Placeholder 3 days after effective date. Verify.', 1),
  (b, 'option_end',       'Option period ends',               'One to Four Contract, Para 5B', 'effective_date', null, true, '17:00', false, true, 'Uses the day count written in the contract. Ends 5:00 p.m. local. Verify weekend rule.', 2),
  (b, 'title_commitment', 'Title commitment due',             'One to Four Contract, Para 6B', 'effective_date', 20, false, null,    true, true, 'Contract counts from title company receipt; placeholder counts from effective date. Verify.', 3),
  (b, 'survey',           'Survey due',                       'One to Four Contract, Para 6C', 'effective_date', null, true, null,   true, true, 'Uses the day count written in the contract. If Para 6C is blank, the deal shows it as needs attention instead of a date. Verify.', 4),
  (b, 'closing',          'Closing',                          'One to Four Contract, Para 9A', 'closing_date',   0,  false, null,    false, false, 'Date written in the contract.', 5),
  (b, 'hoa_info',         'HOA subdivision information due',  'HOA Addendum, Para A',          'effective_date', null, true, null,   true, true, 'Uses the day count written in the HOA addendum. Only applies when the HOA addendum is in the file. Blank in the addendum = needs attention. Verify.', 6),
  (b, 'fin_approval',     'Buyer approval (financing) due',   'Third Party Financing Addendum, Para 2A', 'effective_date', null, true, null, true, true, 'Uses the day count written in the financing addendum. Only applies when that addendum is in the file. Blank there = needs attention. Verify.', 7)
  on conflict (brokerage_id, key) do nothing;
$$;

-- 2. Link existing open tasks to their deadline (the app does the same on every save).
update checklist_items set deadline_key = 'earnest_money' where rule_key in ('contract_to_title', 'fin_contract_to_lender') and status = 'open' and deadline_key is null;
update checklist_items set deadline_key = 'fin_approval'  where rule_key in ('fin_appraisal_ordered', 'fin_buyer_approval') and status = 'open' and deadline_key is null;
update checklist_items set deadline_key = 'closing'       where rule_key in ('seller_fin_terms', 'assumption_approval', 'temp_lease_terms') and status = 'open' and deadline_key is null;

-- 3. "Track buyer's HOA document review window" is no longer generated: the window only starts
--    when the HOA information is delivered, so it has no date of its own, and dating it to the
--    delivery deadline made it look late when it wasn't. Delivery is the HOA task. Open copies go;
--    finished ones stay in Done.
delete from checklist_items where rule_key = 'hoa_review_window' and status = 'open';
