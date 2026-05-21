SELECT cron.schedule(
  'reseller-webhooks-dispatcher-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tmvucidickemtrmftlyb.supabase.co/functions/v1/reseller-webhooks-dispatcher',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtdnVjaWRpY2tlbXRybWZ0bHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MTQ5NjMsImV4cCI6MjA5MzI5MDk2M30.xL-WzhI66uXgeCGV0C7Mb-Yy7veIoEpeUZiR-HXPUio"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);