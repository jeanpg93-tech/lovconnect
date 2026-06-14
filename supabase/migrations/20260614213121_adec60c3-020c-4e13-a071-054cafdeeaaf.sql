SELECT cron.unschedule('reseller-webhooks-dispatcher-every-minute')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reseller-webhooks-dispatcher-every-minute'
);

SELECT cron.schedule(
  'reseller-webhooks-dispatcher-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://qoemkofkeleuhjifvauh.supabase.co/functions/v1/reseller-webhooks-dispatcher',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWIiLCJyZWYiOiJxb2Vta29ma2VsZXVoamlmdmF1aCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc5MzE5MDAzLCJleHAiOjIwOTQ4OTUwMDN9.aQFQh9lizvdslW9eqJM_e8ikv2MPPnCWp8jjVnTUp2w"}'::jsonb,
    body := jsonb_build_object('trigger','cron','at',now())
  );
  $$
);