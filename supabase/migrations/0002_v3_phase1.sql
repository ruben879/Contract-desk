-- Brief v3 additions to Phase 1:
-- fill-once profiles, amendment re-reads, chain-shifting anchors, audit events,
-- and per-agent forward-to addresses (zipForm bridge Rung 1, ready for Rung 2 auto-forward).

-- ---------- Fill-once brokerage profile ----------
alter table brokerages
  add column license_number text,
  add column address_street text,
  add column address_city text,
  add column address_state text default 'TX',
  add column address_zip text,
  add column phone text,
  add column logo_path text,              -- path in the public "branding" bucket
  add column broker_name text,            -- designated broker of record
  add column broker_license_number text;

-- ---------- Fill-once agent profile (lives on the membership = brokerage association) ----------
alter table brokerage_members
  add column license_number text,
  add column phone text,
  -- Personal forward-to address: contracts+<intake_token>@domain. Auto-forwarded mail keeps the
  -- original sender (zipForm, e-sign provider), so sender matching alone can't find the agent.
  add column intake_token text unique default encode(gen_random_bytes(6), 'hex');

update brokerage_members set intake_token = encode(gen_random_bytes(6), 'hex') where intake_token is null;
alter table brokerage_members alter column intake_token set not null;

-- Members may edit their own profile fields (broker/staff policy already covers everyone else).
create policy "members edit own profile" on brokerage_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Stop an agent from promoting themselves or moving brokerages through that policy.
create or replace function guard_member_self_edit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.user_id = auth.uid() and not is_broker_or_staff(old.brokerage_id) then
    if new.role is distinct from old.role or new.brokerage_id is distinct from old.brokerage_id
       or new.active is distinct from old.active or new.email is distinct from old.email
       or new.intake_token is distinct from old.intake_token or new.user_id is distinct from old.user_id then
      raise exception 'Only a broker can change role, email, or status';
    end if;
  end if;
  return new;
end $$;
create trigger member_self_edit_guard before update on brokerage_members for each row execute function guard_member_self_edit();

-- ---------- Logos ----------
insert into storage.buckets (id, name, public) values ('branding', 'branding', true)
on conflict (id) do nothing;
create policy "broker uploads logo" on storage.objects for insert
  with check (bucket_id = 'branding' and is_broker_or_staff(((storage.foldername(name))[1])::uuid));
create policy "broker replaces logo" on storage.objects for update
  using (bucket_id = 'branding' and is_broker_or_staff(((storage.foldername(name))[1])::uuid));

-- ---------- Extractions: initial read vs. amendment re-read ----------
alter type extraction_status add value if not exists 'dismissed';
create type extraction_kind as enum ('initial', 'amendment');

alter table extractions
  add column kind extraction_kind not null default 'initial',
  add column document_ids uuid[] not null default '{}',  -- order sent to the reader; "doc 1" = document_ids[1]
  add column base jsonb,                                  -- confirmed terms at the time of an amendment read (diff "before")
  add column applied jsonb;                               -- what the agent actually confirmed

-- Only one amendment review open per deal at a time keeps the deal page to one next action.
create unique index one_open_amendment on extractions (transaction_id)
  where kind = 'amendment' and status in ('pending', 'running', 'ready');

-- What a document turned out to be, once read (amendment, addendum, disclosure, other).
alter table documents add column kind text;

-- ---------- Deadlines: chain anchors ----------
-- anchor may now be 'effective_date', 'closing_date', or another rule's key (e.g. 'option_end').
-- default_days may be negative (e.g. closing - 3). Cycles are rejected by the app.
alter table deadlines add column anchor text, add column anchor_date date;

-- ---------- Audit trail (feeds the Phase 2 broker review queue and audit export) ----------
create table transaction_events (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  kind text not null,          -- confirmed | edited | amendment_confirmed | amendment_dismissed
  actor uuid references auth.users(id),
  summary text not null,
  changes jsonb,               -- { fields: [{key, before, after}], deadlines: [{key, before, after}], tasks: {added, removed} }
  document_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on transaction_events (transaction_id, created_at desc);
alter table transaction_events enable row level security;
create policy "tx events read" on transaction_events for select using (can_see_transaction(transaction_id));
-- Inserts come from the server only (admin client), so users can't write or rewrite history.
