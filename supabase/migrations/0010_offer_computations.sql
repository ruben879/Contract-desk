-- Offer Writer: brokerage computations (earnest money %, option fee tiers, option period).
-- One settings object per brokerage. Every existing brokerage (Clear Rock) is seeded with the
-- standard values; the app falls back to the same values if this column is missing or partial.
alter table brokerages
  add column offer_defaults jsonb not null default '{
    "earnest_pct": 1, "earnest_round": 100,
    "option_tier1_max": 300000, "option_tier1_fee": 100,
    "option_tier2_max": 400000, "option_tier2_fee": 150,
    "option_tier3_fee": 250,
    "option_period_days": 10
  }'::jsonb;
