-- Columns archive: lets each issue remember its columns (name, writer, picture).
-- Paste into Supabase → SQL Editor → New query → Run.
alter table issues add column if not exists columns jsonb;
