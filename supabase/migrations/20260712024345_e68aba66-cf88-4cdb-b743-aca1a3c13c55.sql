revoke all on function public.expire_stale_misticpay_pending_payments(timestamptz) from public;
revoke all on function public.expire_stale_misticpay_pending_payments(timestamptz) from anon;
revoke all on function public.expire_stale_misticpay_pending_payments(timestamptz) from authenticated;
grant execute on function public.expire_stale_misticpay_pending_payments(timestamptz) to service_role;