-- Listing stage (Nov 19, 2026).
-- A deal can now start from a signed listing agreement, before any purchase contract exists.
-- stage is a property of the deal: 'listing' until an executed purchase contract is confirmed,
-- then 'contract'. Every existing deal is a contract-started deal, so the default keeps them
-- exactly as they are. Additive and safe to run on the live database before the deploy.

alter table transactions
  add column stage text not null default 'contract' check (stage in ('listing', 'contract')),
  add column list_price numeric(12, 2),            -- listing agreement list price; never a sales price
  add column listing_start_date date,              -- listing agreement start of the listing period
  add column listing_expiration_date date,         -- listing agreement end of the listing period
  add column listing_mortgage_info boolean;        -- listing agreement asks for the Request for Mortgage Information
