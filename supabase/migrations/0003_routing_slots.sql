-- Emailed documents are routed, not assumed: they wait in an intake item until they're
-- matched to exactly one active deal, start a new deal (executed contract, no existing deal),
-- or a person sorts them. Plus labeled document slots on every deal.

-- ---------- Intake items ----------
create type intake_status as enum ('reading', 'created', 'matched', 'needs_sorting', 'sorted', 'discarded', 'failed');

create table intake_items (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  member_id uuid references brokerage_members(id),   -- personal address owner, or the matched sender
  from_email text,
  subject text,
  status intake_status not null default 'reading',
  triage jsonb,                                       -- what the reader saw: document kinds, property address
  reason text,                                        -- why it needs sorting, in plain words
  candidate_transaction_ids uuid[] not null default '{}',
  transaction_id uuid references transactions(id) on delete set null,  -- where it ended up
  sorted_by uuid references auth.users(id),
  sorted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on intake_items (brokerage_id, status);

alter table intake_emails add column intake_item_id uuid references intake_items(id) on delete set null;

-- ---------- Documents: may wait in an intake item before belonging to a deal ----------
alter table documents
  alter column transaction_id drop not null,
  add column intake_item_id uuid references intake_items(id) on delete set null,
  add column slot text,                 -- lib/slots.ts key, e.g. 'sellers_disclosure'
  add column slot_source text,          -- 'agent' (placed by a person) | 'reader' (filed by the reader, shown with a badge)
  add constraint documents_home check (transaction_id is not null or intake_item_id is not null);
create index on documents (intake_item_id);

-- ---------- Extractions: where the documents came from ----------
alter table extractions
  add column source intake_source not null default 'upload',
  add column intake_item_id uuid references intake_items(id) on delete set null;

-- ---------- Access ----------
-- Broker and staff sort everything; an agent sorts what came in on their own address.
create or replace function can_see_intake(i uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from intake_items it
    join brokerage_members m on m.brokerage_id = it.brokerage_id and m.user_id = auth.uid() and m.active
    where it.id = i and (m.role in ('broker','staff') or it.member_id = m.id)
  )
$$;

alter table intake_items enable row level security;
create policy "see intake" on intake_items for select using (can_see_intake(id));
-- Status changes go through server actions (admin client) after an explicit person's choice.

create policy "intake documents" on documents for select
  using (transaction_id is null and intake_item_id is not null and can_see_intake(intake_item_id));
