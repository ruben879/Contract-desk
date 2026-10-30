-- Contract & Compliance App: Phase 1 schema
-- Multi-tenant: every row belongs to a brokerage. RLS enforces it.
-- Rule baked into the shape: AI extraction lives in `extractions` as a draft.
-- Nothing lands on `transactions` (or creates deadlines/checklist) until an agent confirms.

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type member_role as enum ('broker', 'agent', 'staff');
create type transaction_status as enum ('reading', 'needs_review', 'active', 'closed', 'cancelled', 'failed');
create type transaction_side as enum ('buyer', 'seller', 'both');
create type intake_source as enum ('upload', 'email');
create type extraction_status as enum ('pending', 'running', 'ready', 'confirmed', 'failed');
create type contact_type as enum ('buyer', 'seller', 'listing_agent', 'buyer_agent', 'title_company', 'escrow_officer', 'lender', 'other');
create type checklist_status as enum ('open', 'done', 'not_needed');

-- ---------- Tenancy ----------
create table brokerages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  -- Secret part of the forward-to address: contracts+<intake_token>@<INBOUND_EMAIL_DOMAIN>
  intake_token text not null unique default encode(gen_random_bytes(6), 'hex'),
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);

create table brokerage_members (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text,
  role member_role not null default 'agent',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brokerage_id, email)
);
create index on brokerage_members (user_id);

-- ---------- Deadline settings (the one place day counts live) ----------
create table deadline_rules (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  key text not null,                       -- earnest_money | option_end | title_commitment | survey | closing
  label text not null,
  contract_ref text not null,              -- shown next to the date, e.g. "TREC 20-18, Para 5A"
  anchor text not null default 'effective_date', -- effective_date | closing_date
  default_days integer,                    -- used when the contract does not state its own count
  use_contract_days boolean not null default false, -- option period, survey: prefer the number written in the contract
  due_time time,                           -- e.g. 17:00 for option period
  roll_weekends_holidays boolean not null default true,
  needs_verification boolean not null default true,
  notes text,
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (brokerage_id, key)
);

-- ---------- Contacts ----------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  type contact_type not null,
  full_name text not null,
  company text,
  email text,
  phone text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on contacts (brokerage_id, type);

-- ---------- Transactions ----------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  agent_member_id uuid references brokerage_members(id),   -- null = unassigned (e.g. email from unknown sender)
  status transaction_status not null default 'reading',
  source intake_source not null,
  side transaction_side,

  -- Confirmed values only. Filled by the confirm step, never by extraction directly.
  contract_form text,
  property_street text,
  property_city text,
  property_state text default 'TX',
  property_zip text,
  property_county text,
  legal_description text,
  sales_price numeric(12,2),
  financing_type text,
  financed_amount numeric(12,2),
  effective_date date,
  closing_date date,
  earnest_money numeric(12,2),
  option_fee numeric(12,2),
  option_period_days integer,
  survey_days integer,
  addenda text[] not null default '{}',     -- confirmed form codes, e.g. {TREC 40-11, TREC 36-10}
  seller_disclosure text,                    -- received | not_received | not_required | unknown

  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on transactions (brokerage_id, status);
create index on transactions (agent_member_id);

create table transaction_contacts (
  transaction_id uuid not null references transactions(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  role contact_type not null,
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  primary key (transaction_id, contact_id, role)
);

-- ---------- Documents ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  storage_path text not null,               -- {brokerage_id}/{transaction_id}/{document_id}.pdf in bucket "documents"
  file_name text not null,
  mime_type text not null default 'application/pdf',
  size_bytes integer,
  sha256 text,
  page_count integer,
  is_scanned boolean,                       -- true when the PDF has little or no text layer
  source intake_source not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on documents (transaction_id);

-- ---------- Extraction drafts ----------
create table extractions (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  status extraction_status not null default 'pending',
  model text,
  result jsonb,          -- every field as { value, confidence, page, source }
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on extractions (transaction_id, created_at desc);

-- ---------- Deadlines (computed at confirm, from deadline_rules) ----------
create table deadlines (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  key text not null,
  label text not null,
  due_date date not null,
  due_time time,
  contract_ref text not null,     -- which contract term it came from
  calculation text not null,      -- plain-English math, e.g. "Effective date Nov 2 + 7 days"
  needs_verification boolean not null default false,
  manually_overridden boolean not null default false,
  unique (transaction_id, key)
);

-- ---------- Checklist ----------
create table checklist_items (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  rule_key text not null,          -- stable key from lib/checklist/rules.ts
  title text not null,
  section text not null,
  reason text,                     -- why this task exists, e.g. "Third Party Financing Addendum is in the file"
  deadline_key text,               -- ties the task to a deadline for its due date
  status checklist_status not null default 'open',
  sort integer not null default 0,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  unique (transaction_id, rule_key)
);
create index on checklist_items (transaction_id, sort);

-- ---------- Inbound email log ----------
create table intake_emails (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  from_email text,
  subject text,
  attachment_count integer not null default 0,
  matched_member_id uuid references brokerage_members(id),
  transaction_id uuid references transactions(id) on delete set null,
  outcome text not null,           -- created | no_pdf | rejected
  received_at timestamptz not null default now()
);

-- ---------- Access helpers ----------
create or replace function my_member(b uuid)
returns brokerage_members language sql stable security definer set search_path = public as $$
  select * from brokerage_members
  where brokerage_id = b and user_id = auth.uid() and active
  limit 1
$$;

create or replace function is_member(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from brokerage_members where brokerage_id = b and user_id = auth.uid() and active)
$$;

create or replace function is_broker_or_staff(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from brokerage_members
    where brokerage_id = b and user_id = auth.uid() and active and role in ('broker','staff'))
$$;

-- Agents see their own transactions; broker and staff see the whole brokerage.
create or replace function can_see_transaction(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from transactions tx
    join brokerage_members m on m.brokerage_id = tx.brokerage_id and m.user_id = auth.uid() and m.active
    where tx.id = t and (m.role in ('broker','staff') or tx.agent_member_id = m.id)
  )
$$;

-- ---------- RLS ----------
alter table brokerages enable row level security;
alter table brokerage_members enable row level security;
alter table deadline_rules enable row level security;
alter table contacts enable row level security;
alter table transactions enable row level security;
alter table transaction_contacts enable row level security;
alter table documents enable row level security;
alter table extractions enable row level security;
alter table deadlines enable row level security;
alter table checklist_items enable row level security;
alter table intake_emails enable row level security;

create policy "members read brokerage" on brokerages for select using (is_member(id));
create policy "broker updates brokerage" on brokerages for update using (is_broker_or_staff(id));

create policy "members read team" on brokerage_members for select using (is_member(brokerage_id));
create policy "broker manages team" on brokerage_members for all
  using (is_broker_or_staff(brokerage_id)) with check (is_broker_or_staff(brokerage_id));

create policy "members read rules" on deadline_rules for select using (is_member(brokerage_id));
create policy "broker edits rules" on deadline_rules for update using (is_broker_or_staff(brokerage_id));

create policy "members use contacts" on contacts for all
  using (is_member(brokerage_id)) with check (is_member(brokerage_id));

create policy "see transactions" on transactions for select using (can_see_transaction(id));
create policy "create transactions" on transactions for insert with check (is_member(brokerage_id));
create policy "edit transactions" on transactions for update using (can_see_transaction(id));

create policy "tx contacts" on transaction_contacts for all
  using (can_see_transaction(transaction_id)) with check (can_see_transaction(transaction_id));
create policy "tx documents" on documents for all
  using (can_see_transaction(transaction_id)) with check (can_see_transaction(transaction_id));
create policy "tx extractions" on extractions for select using (can_see_transaction(transaction_id));
create policy "tx deadlines" on deadlines for all
  using (can_see_transaction(transaction_id)) with check (can_see_transaction(transaction_id));
create policy "tx checklist" on checklist_items for all
  using (can_see_transaction(transaction_id)) with check (can_see_transaction(transaction_id));

create policy "broker reads intake log" on intake_emails for select using (is_broker_or_staff(brokerage_id));

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "members read their brokerage files" on storage.objects for select
  using (bucket_id = 'documents' and is_member(((storage.foldername(name))[1])::uuid));
create policy "members upload to their brokerage" on storage.objects for insert
  with check (bucket_id = 'documents' and is_member(((storage.foldername(name))[1])::uuid));

-- ---------- Default deadline rules for a new brokerage ----------
-- PLACEHOLDER day counts. Verify every row against the current TREC forms, then
-- flip needs_verification to false in Settings > Deadlines.
create or replace function seed_deadline_rules(b uuid)
returns void language sql security definer set search_path = public as $$
  insert into deadline_rules (brokerage_id, key, label, contract_ref, anchor, default_days, use_contract_days, due_time, roll_weekends_holidays, needs_verification, notes, sort) values
  (b, 'earnest_money',    'Earnest money and option fee due', 'One to Four Contract, Para 5A', 'effective_date', 3,  false, null,    true, true, 'Placeholder 3 days after effective date. Verify.', 1),
  (b, 'option_end',       'Option period ends',               'One to Four Contract, Para 5B', 'effective_date', null, true, '17:00', false, true, 'Uses the day count written in the contract. Ends 5:00 p.m. local. Verify weekend rule.', 2),
  (b, 'title_commitment', 'Title commitment due',             'One to Four Contract, Para 6B', 'effective_date', 20, false, null,    true, true, 'Contract counts from title company receipt; placeholder counts from effective date. Verify.', 3),
  (b, 'survey',           'Survey due',                       'One to Four Contract, Para 6C', 'effective_date', 10, true,  null,    true, true, 'Uses the contract day count when present, else this placeholder. Verify.', 4),
  (b, 'closing',          'Closing',                          'One to Four Contract, Para 9A', 'closing_date',   0,  false, null,    false, false, 'Date written in the contract.', 5)
  on conflict (brokerage_id, key) do nothing;
$$;

create or replace function on_brokerage_created() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform seed_deadline_rules(new.id);
  return new;
end $$;
create trigger brokerage_seed_rules after insert on brokerages for each row execute function on_brokerage_created();

-- Link an invited member row to the auth user when they first sign in with that email.
create or replace function link_member_on_signup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update brokerage_members set user_id = new.id where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;
create trigger auth_user_link_member after insert on auth.users for each row execute function link_member_on_signup();
