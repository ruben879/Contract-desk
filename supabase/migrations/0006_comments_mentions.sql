-- Comments and @mentions on deals.
-- Comments are conversation between members. They are NOT the system history log
-- (transaction_events), and nothing in the app ever posts one on its own.
-- Mentions are stored as tokens in the body: @[m:<member id>], rendered with the member's current name.

-- The signed-in user's membership id in a brokerage.
create or replace function my_member_id(b uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from brokerage_members where brokerage_id = b and user_id = auth.uid() and active limit 1
$$;

-- Can this member (not the signed-in user) open this deal? Same rule as can_see_transaction.
create or replace function member_can_see_transaction(m uuid, t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from transactions tx
    join brokerage_members bm on bm.brokerage_id = tx.brokerage_id and bm.id = m and bm.active
    where tx.id = t and (bm.role in ('broker','staff') or tx.agent_member_id = bm.id)
  )
$$;

-- ---------- Comments ----------
create table deal_comments (
  id uuid primary key default gen_random_uuid(),
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  author_member_id uuid not null references brokerage_members(id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on deal_comments (transaction_id, created_at desc);

-- The brokerage always comes from the deal, never from the client.
create or replace function deal_comment_brokerage() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.brokerage_id := (select brokerage_id from transactions where id = new.transaction_id);
  return new;
end $$;
create trigger deal_comments_brokerage before insert on deal_comments for each row execute function deal_comment_brokerage();

alter table deal_comments enable row level security;
create policy "read deal comments" on deal_comments for select using (can_see_transaction(transaction_id));
create policy "post as yourself" on deal_comments for insert
  with check (can_see_transaction(transaction_id) and author_member_id = my_member_id(brokerage_id));
create policy "delete own comments" on deal_comments for delete
  using (author_member_id = my_member_id(brokerage_id));

-- ---------- Mentions ----------
create table comment_mentions (
  comment_id uuid not null references deal_comments(id) on delete cascade,
  member_id uuid not null references brokerage_members(id) on delete cascade,
  brokerage_id uuid not null references brokerages(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id)
);
create index on comment_mentions (member_id, read_at);
create index on comment_mentions (transaction_id);

alter table comment_mentions enable row level security;
create policy "read mentions" on comment_mentions for select
  using (member_id = my_member_id(brokerage_id) or can_see_transaction(transaction_id));
-- Only the comment's author adds its mentions, and only for members who can open the deal.
create policy "author adds mentions" on comment_mentions for insert
  with check (
    exists (select 1 from deal_comments c
            where c.id = comment_id and c.transaction_id = comment_mentions.transaction_id
              and c.brokerage_id = comment_mentions.brokerage_id
              and c.author_member_id = my_member_id(c.brokerage_id))
    and member_can_see_transaction(member_id, transaction_id)
  );
-- No update policy: read state changes only through this function, and only your own.
create or replace function mark_mentions_read(t uuid default null)
returns integer language sql security definer set search_path = public as $$
  with done as (
    update comment_mentions cm set read_at = now()
    where cm.read_at is null
      and cm.member_id in (select id from brokerage_members where user_id = auth.uid() and active)
      and (t is null or cm.transaction_id = t)
    returning 1
  )
  select count(*)::integer from done
$$;
grant execute on function my_member_id(uuid) to authenticated;
grant execute on function member_can_see_transaction(uuid, uuid) to authenticated;
grant execute on function mark_mentions_read(uuid) to authenticated;
