-- Schedules the crawlers with pg_cron. Both edge functions claim their own work from the database,
-- so overlapping runs are safe (claims use FOR UPDATE SKIP LOCKED).
--   crawl-city     every minute: OSM places for the next queued cities (priority order)
--   enrich-places  every 2 minutes: facts from the venues' own websites (90-day refresh)
--   daily          re-queues cities older than 30 days and prunes finished jobs

create extension if not exists pg_cron;

select cron.unschedule(jobname)
  from cron.job
 where jobname in ('cosurfing-crawl-city', 'cosurfing-enrich-places', 'cosurfing-enqueue-due');

select cron.schedule('cosurfing-crawl-city', '* * * * *', $$select public.invoke_crawler('crawl-city')$$);
select cron.schedule('cosurfing-enrich-places', '*/2 * * * *', $$select public.invoke_crawler('enrich-places')$$);
select cron.schedule(
  'cosurfing-enqueue-due',
  '17 3 * * *',
  $$select public.enqueue_due_crawls();
    delete from public.crawl_jobs where status in ('done', 'failed') and finished_at < now() - interval '90 days';$$
);
