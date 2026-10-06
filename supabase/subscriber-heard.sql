-- "How did you hear about us?" answer. Run in Supabase SQL Editor.
alter table subscribers add column if not exists heard text default '';
