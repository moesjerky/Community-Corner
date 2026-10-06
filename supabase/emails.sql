-- Auto-email setup. Run in Supabase SQL Editor.
alter table issues add column if not exists emailed_at timestamptz;

-- Lets someone unsubscribe with the private link in their email (no login needed)
create or replace function unsubscribe(t uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update subscribers set unsubscribed = true where token = t;
  return found;
end $$;
grant execute on function unsubscribe(uuid) to anon, authenticated;
