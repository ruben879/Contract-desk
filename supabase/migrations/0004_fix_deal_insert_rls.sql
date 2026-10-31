-- Fix (Oct 31 live test): creating a deal failed with
--   "new row violates row-level security policy for table transactions".
-- Cause: insert ... returning checks the new row against the SELECT policy, and that policy
-- called can_see_transaction(id), which looks the row up again by id. Inside the same statement
-- the new row isn't visible to that lookup yet, so the check always failed.
-- Fix: judge a transaction row by its own columns (brokerage and assigned agent), never by
-- looking it up again. Same access as before: broker and staff see the whole brokerage,
-- an agent sees deals assigned to them. Agents can also only create or keep deals assigned to themselves.

create or replace function can_access_deal(b uuid, agent uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from brokerage_members m
    where m.brokerage_id = b and m.user_id = auth.uid() and m.active
      and (m.role in ('broker','staff') or m.id = agent)
  )
$$;
grant execute on function can_access_deal(uuid, uuid) to authenticated;

drop policy if exists "see transactions" on transactions;
drop policy if exists "create transactions" on transactions;
drop policy if exists "edit transactions" on transactions;

create policy "see transactions" on transactions for select
  using (can_access_deal(brokerage_id, agent_member_id));
create policy "create transactions" on transactions for insert
  with check (can_access_deal(brokerage_id, agent_member_id));
create policy "edit transactions" on transactions for update
  using (can_access_deal(brokerage_id, agent_member_id))
  with check (can_access_deal(brokerage_id, agent_member_id));

-- can_see_transaction(id) stays for child tables (documents, deadlines, checklist, ...):
-- their rows point at an already-saved deal, so the lookup works there.
