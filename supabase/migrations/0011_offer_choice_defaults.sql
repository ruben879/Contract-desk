-- Offer defaults: the title policy payer (Para 6A) and survey choice (Para 6C) move from code into
-- each brokerage's offer_defaults, next to the earnest and option settings from 0010.
-- Seeded with the values the app already used, so nothing changes on screen. Keys a brokerage
-- already has are kept (existing values win the merge).
update brokerages set offer_defaults =
  '{"title_policy_payer": "seller", "survey_option": "seller_existing", "survey_days": 5, "survey_new_payer": "buyer"}'::jsonb || offer_defaults;

alter table brokerages alter column offer_defaults set default '{
  "earnest_pct": 1, "earnest_round": 100,
  "option_tier1_max": 300000, "option_tier1_fee": 100,
  "option_tier2_max": 400000, "option_tier2_fee": 150,
  "option_tier3_fee": 250,
  "option_period_days": 10,
  "title_policy_payer": "seller",
  "survey_option": "seller_existing", "survey_days": 5, "survey_new_payer": "buyer"
}'::jsonb;
