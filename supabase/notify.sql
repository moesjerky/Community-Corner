-- Team alerts: remember which subscribers and messages were already emailed, and run the alert robot every 5 minutes.
alter table subscribers add column if not exists notified_at timestamptz;
alter table submissions add column if not exists notified_at timestamptz;
-- don't email about everyone who signed up before today
update subscribers set notified_at = now() where notified_at is null and created_at < now() - interval '1 hour';
update submissions set notified_at = now() where notified_at is null and created_at < now() - interval '1 hour';

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('cc-notify') where exists (select 1 from cron.job where jobname = 'cc-notify');
select cron.schedule('cc-notify', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://yamagpbcprjeltjbukad.supabase.co/functions/v1/notify',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_gQ3GGYaJV8Q3nxx2uI7O_g_v2TAr1G3","Authorization":"Bearer sb_publishable_gQ3GGYaJV8Q3nxx2uI7O_g_v2TAr1G3"}'::jsonb,
    body := '{}'::jsonb)
$$);
