-- Subscribers list. Run in Supabase SQL Editor.
create table if not exists subscribers (
  email        text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name         text default '',
  token        uuid not null default gen_random_uuid(),   -- for unsubscribe links
  unsubscribed boolean not null default false,
  created_at   timestamptz default now()
);
alter table subscribers enable row level security;

-- Anyone can sign up (insert only; they can't see the list)
drop policy if exists "anyone subscribes" on subscribers;
create policy "anyone subscribes" on subscribers for insert with check (unsubscribed = false);

-- Only admins can see, edit or remove subscribers
drop policy if exists "admins manage subscribers" on subscribers;
create policy "admins manage subscribers" on subscribers for all using (public.is_admin()) with check (public.is_admin());
