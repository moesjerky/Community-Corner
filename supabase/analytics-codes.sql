-- Analytics: send page names as short codes, so web filters that react to words
-- (like "advertise") don't block the admin page. Run in Supabase SQL Editor.
create or replace function site_numbers(since timestamptz)
returns table (at timestamptz, event text, path text, ref text, vid text, mobile boolean)
language sql stable security definer set search_path = public as $$
  select v.at, v.event,
    case
      when v.path ~ '^[0-9]{1,5}$' then v.path          -- issue numbers stay as they are
      when v.path = 'home'      then 'a'
      when v.path = 'past'      then 'b'
      when v.path = 'fun'       then 'c'
      when v.path = 'sponsors'  then 'd'
      when v.path = 'contact'   then 'e'
      when v.path = 'subscribe' then 'f'
      when v.path = 'about'     then 'g'
      when v.path = 'advertise' then 'h'
      when v.path = 'submit'    then 'i'
      when v.path = ''          then ''
      else 'z'
    end,
    case
      when v.ref = '' then ''
      when lower(v.ref) = 'qr' then 'qr'
      when lower(v.ref) = 'email' then 'email'
      when v.ref ~* '(whatsapp|wa\.me)' then 'w'
      when v.ref ~* 'google\.' then 'g'
      when v.ref ~* '(bing|duckduckgo|yahoo)\.' then 's'
      when v.ref ~* '(mail|outlook)' then 'm'
      else 'o'
    end,
    md5(v.vid),
    v.mobile
  from visits v
  where public.is_admin() and v.at >= since
  order by v.at desc
  limit 50000;
$$;
grant execute on function site_numbers(timestamptz) to authenticated;
