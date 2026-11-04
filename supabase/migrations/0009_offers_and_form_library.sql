-- Offer Writer v1 + Form Library.
-- Offer file: written Terms before execution. Not a transaction; it links to one once the
-- executed contract comes back through intake and the agent confirms.

create type offer_status as enum ('draft_offer', 'out_for_signature', 'executed');

create table offers (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  agent_member_id uuid references brokerage_members(id),
  status offer_status not null default 'draft_offer',
  terms jsonb not null default '{}'::jsonb,
  last_exported_at timestamptz,
  edited_since_export boolean not null default false,
  executed_transaction_id uuid references transactions(id) on delete set null,
  executed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on offers (brokerage_id, status);

-- Every export is a new version. Rows and files are never changed or overwritten.
create table offer_packets (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  offer_id uuid not null references offers(id) on delete cascade,
  version integer not null,
  storage_path text not null unique,
  file_name text not null,
  sha256 text not null,
  forms jsonb not null,          -- [{kind, id|formId, versionId, title, revision}] exactly as rendered
  terms_snapshot jsonb not null,
  exported_by uuid references auth.users(id),
  exported_at timestamptz not null default now(),
  unique (offer_id, version)
);

-- Brokerage defaults the Terms screen starts from.
alter table brokerages
  add column default_title_company text,
  add column default_buyer_comp_type text check (default_buyer_comp_type in ('percent', 'amount')),
  add column default_buyer_comp_value numeric(12,2);

-- ---------- Form Library (brokerage-uploaded forms) ----------
create type form_class as enum ('TREC', 'TXR', 'Brokerage');

create table library_forms (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  display_name text not null,
  form_class form_class not null,
  p22_slot text,                         -- lib/forms/registry.ts P22_SLOTS key, or null = standalone
  current_version_id uuid,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on library_forms (brokerage_id);

create table library_form_versions (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  form_id uuid not null references library_forms(id) on delete cascade,
  version integer not null,
  storage_path text not null unique,     -- the uploaded PDF, byte-identical, never overwritten
  sha256 text not null,
  file_name text not null,
  page_count integer not null,
  fields jsonb not null,                 -- inventory: [{name, type, page, rect, maxLength}]
  field_map jsonb not null default '{}'::jsonb, -- {fieldName: {term} | {blank: true}}
  mapping_complete boolean not null default false,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (form_id, version)
);
alter table library_forms add constraint library_forms_current_fk
  foreign key (current_version_id) references library_form_versions(id) on delete set null;

-- TXR acknowledgment acceptances. Append-only record.
create table form_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  form_id uuid not null references library_forms(id) on delete cascade,
  version_id uuid references library_form_versions(id) on delete set null,
  user_id uuid not null references auth.users(id),
  text_version text not null,
  reason text not null check (reason in ('upload', 'class_change', 'new_version')),
  accepted_at timestamptz not null default now()
);

-- ---------- Access ----------
-- Offers: like deals. Agents see their own; broker and staff see the brokerage's.
create or replace function can_access_offer(b uuid, agent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_access_deal(b, agent)
$$;

alter table offers enable row level security;
create policy "see offers" on offers for select using (can_access_offer(brokerage_id, agent_member_id));
create policy "create offers" on offers for insert with check (can_access_offer(brokerage_id, agent_member_id));
create policy "edit offers" on offers for update using (can_access_offer(brokerage_id, agent_member_id))
  with check (can_access_offer(brokerage_id, agent_member_id));
create policy "delete draft offers" on offers for delete using (can_access_offer(brokerage_id, agent_member_id) and status = 'draft_offer');

alter table offer_packets enable row level security;
create policy "see packets" on offer_packets for select
  using (exists (select 1 from offers o where o.id = offer_id and can_access_offer(o.brokerage_id, o.agent_member_id)));
-- Packets are written by the server (export action) only; never updated or deleted by users.

-- Form Library: every member of the brokerage can see and use mapping-complete forms;
-- only broker/staff can add, map, rename, reclassify, or archive. Nothing crosses brokerages.
alter table library_forms enable row level security;
create policy "members see own library" on library_forms for select using (is_member(brokerage_id));
create policy "broker manages library" on library_forms for all
  using (is_broker_or_staff(brokerage_id)) with check (is_broker_or_staff(brokerage_id));

alter table library_form_versions enable row level security;
create policy "members see own versions" on library_form_versions for select using (is_member(brokerage_id));
create policy "broker manages versions" on library_form_versions for all
  using (is_broker_or_staff(brokerage_id)) with check (is_broker_or_staff(brokerage_id));
-- A version's file is fixed once uploaded.
create or replace function freeze_version_file() returns trigger language plpgsql as $$
begin
  if new.storage_path is distinct from old.storage_path or new.sha256 is distinct from old.sha256
     or new.fields is distinct from old.fields or new.form_id is distinct from old.form_id or new.version is distinct from old.version then
    raise exception 'An uploaded form version cannot be changed; upload a new version instead';
  end if;
  return new;
end $$;
create trigger library_version_frozen before update on library_form_versions for each row execute function freeze_version_file();

alter table form_acknowledgments enable row level security;
create policy "broker reads acknowledgments" on form_acknowledgments for select using (is_broker_or_staff(brokerage_id));
create policy "broker records acknowledgment" on form_acknowledgments for insert
  with check (is_broker_or_staff(brokerage_id) and user_id = auth.uid());

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('offer-packets', 'offer-packets', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('library-forms', 'library-forms', false) on conflict (id) do nothing;

create policy "members read own packets" on storage.objects for select
  using (bucket_id = 'offer-packets' and is_member(((storage.foldername(name))[1])::uuid));
create policy "members read own library files" on storage.objects for select
  using (bucket_id = 'library-forms' and is_member(((storage.foldername(name))[1])::uuid));
create policy "broker uploads library files" on storage.objects for insert
  with check (bucket_id = 'library-forms' and is_broker_or_staff(((storage.foldername(name))[1])::uuid));
