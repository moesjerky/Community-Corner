-- Reader submissions (mazel tovs, photos, stories). Run in Supabase SQL Editor.
create table if not exists submissions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind       text not null default 'Other' check (length(kind) <= 40),
  name       text not null check (length(name) between 1 and 120),
  contact    text not null default '' check (length(contact) <= 160),
  message    text not null default '' check (length(message) <= 4000),
  photo      text check (photo is null or photo ~ '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'),
  done       boolean not null default false
);
alter table submissions enable row level security;

-- Anyone can send one in; only admins can read, update or delete them
drop policy if exists "anyone submits" on submissions;
create policy "anyone submits" on submissions for insert with check (done = false and created_at > now() - interval '1 minute');
drop policy if exists "admins manage submissions" on submissions;
create policy "admins manage submissions" on submissions for all using (public.is_admin()) with check (public.is_admin());

-- Private photo storage: images only, 5 MB max
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "anyone uploads a submission photo" on storage.objects;
create policy "anyone uploads a submission photo" on storage.objects for insert
  with check (bucket_id = 'submissions' and name ~ '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$');
drop policy if exists "admins see submission photos" on storage.objects;
create policy "admins see submission photos" on storage.objects for select using (bucket_id = 'submissions' and public.is_admin());
drop policy if exists "admins delete submission photos" on storage.objects;
create policy "admins delete submission photos" on storage.objects for delete using (bucket_id = 'submissions' and public.is_admin());
