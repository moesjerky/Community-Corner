-- Analytics: only send plain, safe labels to the admin page.
-- Raw referrer website names (which bots can fill with anything) stay in the database
-- but are sorted into categories before they are sent. Run in Supabase SQL Editor.

create or replace function site_numbers(since timestamptz)
returns table (at timestamptz, event text, path text, ref text, vid text, mobile boolean)
language sql stable security definer set search_path = public as $$
  select v.at, v.event,
    case when v.path ~ '^[a-z0-9-]{0,24}$' then v.path else 'other' end,
    case
      when v.ref = '' then ''
      when lower(v.ref) = 'qr' then 'qr'
      when lower(v.ref) = 'email' then 'email'
      when v.ref ~* '(whatsapp|wa\.me)' then 'WhatsApp'
      when v.ref ~* 'google\.' then 'Google'
      when v.ref ~* '(bing|duckduckgo|yahoo)\.' then 'Other search'
      when v.ref ~* '(mail|outlook)' then 'Email app'
      else 'Another website'
    end,
    md5(v.vid),
    v.mobile
  from visits v
  where public.is_admin() and v.at >= since
  order by v.at desc
  limit 50000;
$$;
grant execute on function site_numbers(timestamptz) to authenticated;

-- Recording a visit: keep only simple, expected text
create or replace function page_note(e text, p text, r text, v text, m boolean) returns void
language sql security definer set search_path = public as $$
  insert into visits (event, path, ref, vid, mobile)
  values (e,
    case when coalesce(p,'') ~ '^[a-z0-9-]{0,24}$' then coalesce(p,'') else 'other' end,
    left(regexp_replace(coalesce(r,''), '[^A-Za-z0-9.-]', '', 'g'), 60),
    left(regexp_replace(coalesce(v,''), '[^a-z0-9]', '', 'g'), 40),
    coalesce(m,false));
$$;
grant execute on function page_note(text, text, text, text, boolean) to anon, authenticated;
