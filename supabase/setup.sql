-- Community Corner database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

-- Who is allowed to use /admin (add emails here)
create table if not exists admins (
  email text primary key
);

-- One row per printed issue
create table if not exists issues (
  num        int primary key,
  title      text default '',
  date       date not null default current_date,
  hebrew     text default '',
  yomtov     text default '',
  tzais      text default '',
  pages      int  not null default 0,
  published  boolean not null default false,
  fun        jsonb,          -- word search, parsha question, word of the week, fact
  sponsors   jsonb,          -- { print: {name, info}, ads: [{img, name, info}] }
  created_at timestamptz default now()
);

-- Site-wide settings (like the z'chus bar)
create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

alter table admins   enable row level security;
alter table issues   enable row level security;
alter table settings enable row level security;

drop policy if exists "admins read self" on admins;
create policy "admins read self" on admins for select using (is_admin());

drop policy if exists "public reads published" on issues;
create policy "public reads published" on issues for select using (published or is_admin());
drop policy if exists "admins write issues" on issues;
create policy "admins write issues" on issues for all using (is_admin()) with check (is_admin());

drop policy if exists "public reads settings" on settings;
create policy "public reads settings" on settings for select using (true);
drop policy if exists "admins write settings" on settings;
create policy "admins write settings" on settings for all using (is_admin()) with check (is_admin());

-- File storage for pages, covers, PDFs and ads (anyone can view, only admins upload)
insert into storage.buckets (id, name, public) values ('issues', 'issues', true)
  on conflict (id) do update set public = true;

drop policy if exists "admins upload" on storage.objects;
create policy "admins upload" on storage.objects for insert with check (bucket_id = 'issues' and is_admin());
drop policy if exists "admins update" on storage.objects;
create policy "admins update" on storage.objects for update using (bucket_id = 'issues' and is_admin());
drop policy if exists "admins delete" on storage.objects;
create policy "admins delete" on storage.objects for delete using (bucket_id = 'issues' and is_admin());

insert into settings (key, value) values
  ('zchus', '{"text": "These issues are in the z''chus of a fast recovery for", "names": ["דניאל בן מרים", "דוד משה בן יהודית רחל"]}')
  on conflict (key) do nothing;

-- ⬇️ Put your email (and your friend's) here, then run
insert into admins (email) values ('submissions@ourcommunitycorner.com'), ('moshbeils@gmail.com') on conflict do nothing;
