-- Documents stopped at the door (Nov 20, 2026; Ruben's ruling of Nov 18).
-- A document added to a deal that matches it on nothing (property address, parties, and price
-- all differ) is held: not filed into a slot, not read for changes, no checklist effect, until
-- the agent says Wrong deal, Remove it, or Keep it on this deal anyway.
--
-- held:          null = normal. Otherwise what the reader saw on it and why it was stopped (lib/match.ts).
-- held_override: the agent chose "Keep it on this deal anyway"; the door check skips it from then on.
-- Additive and safe to run on the live database before the deploy. No existing document is held.

alter table documents
  add column held jsonb,
  add column held_override boolean not null default false;
