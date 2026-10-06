-- Extra signup questions. Run in Supabase SQL Editor.
alter table subscribers add column if not exists phone   text default '';
alter table subscribers add column if not exists address text default '';
alter table subscribers add column if not exists shul    text default '';
