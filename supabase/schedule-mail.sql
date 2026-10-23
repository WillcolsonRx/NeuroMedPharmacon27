-- First create these two secrets in Supabase Project Settings > Vault:
-- nmp_worker_url = https://YOUR-SITE.vercel.app/api/internal/mail-worker
-- nmp_worker_secret = same private value as Vercel MAIL_WORKER_SECRET.
-- No credential values belong in this SQL file or Git.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if (select count(*) from vault.decrypted_secrets where name in ('nmp_worker_url','nmp_worker_secret'))<>2 then
  raise exception 'Create both worker secrets in Vault first';
 end if;
end $$;
select cron.schedule('nmp-decision-mail','*/15 * * * *', $job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='nmp_worker_url'),
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='nmp_worker_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
 );
$job$);
-- Delivery remains paused in conference_mail_settings until staff resumes it.
-- Inspect cron.job_run_details and net._http_response if the queue does not move.
