-- Run once in the deployed Supabase project after the schema migration.
-- The named job is updated, rather than duplicated, when re-applied.
-- Kept outside the portable migration chain because embedded test Postgres
-- has no background worker extension; production verification checks actual runs.
create extension if not exists pg_cron;
select cron.schedule('roegusta-pool-defaults','* * * * *','select public.process_due_bet_pools();');
-- Operational checks (read-only):
-- select jobid,jobname,schedule,command,active from cron.job where jobname='roegusta-pool-defaults';
-- select * from cron.job_run_details where jobid=(select jobid from cron.job where jobname='roegusta-pool-defaults') order by start_time desc limit 5;
-- select * from public.bet_pool_scheduler_runs order by started_at desc limit 5;
