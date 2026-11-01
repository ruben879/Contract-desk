-- Simplicity pass (Nov 1): one errand = one task. Data only, no schema change; safe to run
-- before or after the code deploys (the app also folds these on the next save of each deal).
--   details_confirmed      -> executed_contract
--   earnest_receipt        -> earnest_delivered
--   fin_appraisal_received -> fin_appraisal_ordered
--   hoa_deliver_docs       -> hoa_request_docs
-- If the retired half was done, the merged errand is done. Also links HOA tasks born before the
-- HOA deadline existed (Brookhollow) to it.

begin;

create temporary table merge_map (retired text primary key, into_key text not null, title text not null);
insert into merge_map values
  ('details_confirmed',      'executed_contract',     'Executed contract in the file and details confirmed'),
  ('earnest_receipt',        'earnest_delivered',     'Earnest money and option fee delivered, receipt from title in the file'),
  ('fin_appraisal_received', 'fin_appraisal_ordered', 'Appraisal ordered and received'),
  ('hoa_deliver_docs',       'hoa_request_docs',      'HOA subdivision information and resale certificate requested and delivered to buyer');

-- 1. Retired half done, surviving half still open: the errand is done.
update checklist_items s
   set status = 'done', completed_at = coalesce(r.completed_at, now()), completed_by = r.completed_by
  from checklist_items r join merge_map m on m.retired = r.rule_key
 where s.transaction_id = r.transaction_id and s.rule_key = m.into_key
   and s.status = 'open' and r.status = 'done';

-- 2. Retired half exists but the survivor doesn't (shouldn't happen): rename it instead of losing it.
update checklist_items r
   set rule_key = m.into_key
  from merge_map m
 where r.rule_key = m.retired
   and not exists (select 1 from checklist_items s where s.transaction_id = r.transaction_id and s.rule_key = m.into_key);

-- 3. Remove the retired halves.
delete from checklist_items r using merge_map m where r.rule_key = m.retired;

-- 4. New titles on the surviving tasks (done ones too, so the Done list reads the same).
update checklist_items s set title = m.title from merge_map m where s.rule_key = m.into_key;

-- 5. HOA task dated by the HOA deadline.
update checklist_items set deadline_key = 'hoa_info'
 where rule_key = 'hoa_request_docs' and deadline_key is distinct from 'hoa_info';

drop table merge_map;

commit;
