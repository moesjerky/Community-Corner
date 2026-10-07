-- Ad blockers and web filters often block addresses with words like "visits".
-- These two helpers do the same work under plain names. Run in Supabase SQL Editor.

-- The website calls this to record one page view (no login needed)
create or replace function page_note(e text, p text, r text, v text, m boolean) returns void
language sql security definer set search_path = public as $$
  insert into visits (event, path, ref, vid, mobile)
  values (e, left(coalesce(p,''),100), left(coalesce(r,''),100), left(coalesce(v,''),40), coalesce(m,false));
$$;
grant execute on function page_note(text, text, text, text, boolean) to anon, authenticated;

-- The admin page calls this to read the numbers (only admins get anything back)
create or replace function site_numbers(since timestamptz)
returns table (at timestamptz, event text, path text, ref text, vid text, mobile boolean)
language sql stable security definer set search_path = public as $$
  select v.at, v.event, v.path, v.ref, v.vid, v.mobile
  from visits v
  where public.is_admin() and v.at >= since
  order by v.at desc
  limit 50000;
$$;
grant execute on function site_numbers(timestamptz) to authenticated;
