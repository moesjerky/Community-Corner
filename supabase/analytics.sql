-- Simple, private analytics. Run in Supabase SQL Editor.
-- Stores no names, emails or IP addresses: just which page, when, phone/computer,
-- where the visitor came from, and a random browser id to count unique visitors.
create table if not exists visits (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  event   text not null default 'view' check (event in ('view','read','pdf','subscribe','contact')),
  path    text not null default '' check (length(path) <= 100),
  ref     text not null default '' check (length(ref) <= 100),
  vid     text not null default '' check (length(vid) <= 40),
  mobile  boolean not null default false
);
create index if not exists visits_at on visits (at desc);
alter table visits enable row level security;

drop policy if exists "anyone logs a visit" on visits;
create policy "anyone logs a visit" on visits for insert with check (at > now() - interval '1 minute');
drop policy if exists "admins read visits" on visits;
create policy "admins read visits" on visits for select using (public.is_admin());
