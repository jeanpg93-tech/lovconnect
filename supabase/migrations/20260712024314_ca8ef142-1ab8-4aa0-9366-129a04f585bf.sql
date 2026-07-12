create extension if not exists pg_cron with schema cron;

create or replace function public.expire_stale_misticpay_pending_payments(_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  activation_count integer := 0;
  recharge_count integer := 0;
  storefront_count integer := 0;
  claude_count integer := 0;
  pack_count integer := 0;
begin
  update public.activation_payments
     set status = 'expired',
         updated_at = _now,
         raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
           'auto_expired_at', _now,
           'auto_expire_reason', 'pix_ttl_elapsed'
         )
   where status = 'pending'
     and provider = 'misticpay'
     and expires_at is not null
     and expires_at < _now;
  get diagnostics activation_count = row_count;

  update public.recharge_intents
     set status = 'expired',
         updated_at = _now,
         raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
           'auto_expired_at', _now,
           'auto_expire_reason', 'pix_ttl_elapsed'
         )
   where status = 'pending'
     and provider = 'misticpay'
     and created_at < (_now - interval '30 minutes');
  get diagnostics recharge_count = row_count;

  update public.storefront_orders
     set status = 'expirado',
         error_message = 'PIX não pago dentro do prazo',
         updated_at = _now,
         raw_response = coalesce(raw_response, '{}'::jsonb) || jsonb_build_object(
           'auto_expired_at', _now,
           'auto_expire_reason', 'pix_ttl_elapsed'
         )
   where status = 'pending'
     and provider = 'misticpay'
     and expires_at is not null
     and expires_at < _now;
  get diagnostics storefront_count = row_count;

  update public.claude_orders
     set status = 'expired',
         expired_at = coalesce(expired_at, _now),
         updated_at = _now,
         error_message = 'pix_expired'
   where status in ('pending', 'awaiting_payment')
     and pix_expires_at is not null
     and pix_expires_at < _now;
  get diagnostics claude_count = row_count;

  update public.reseller_pack_purchases
     set status = 'expired',
         updated_at = _now,
         notes = case
           when notes is null or btrim(notes) = '' then jsonb_build_object('auto_expired_at', _now, 'auto_expire_reason', 'pix_ttl_elapsed')::text
           else notes
         end
   where status = 'pending'
     and provider = 'misticpay'
     and expires_at is not null
     and expires_at < _now;
  get diagnostics pack_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'activation_payments', activation_count,
    'recharge_intents', recharge_count,
    'storefront_orders', storefront_count,
    'claude_orders', claude_count,
    'reseller_pack_purchases', pack_count
  );
end;
$$;

grant execute on function public.expire_stale_misticpay_pending_payments(timestamptz) to service_role;

do $$
begin
  perform cron.unschedule('expire-stale-misticpay-pending-payments');
exception when others then
  null;
end $$;

select cron.schedule(
  'expire-stale-misticpay-pending-payments',
  '*/5 * * * *',
  $$select public.expire_stale_misticpay_pending_payments();$$
);