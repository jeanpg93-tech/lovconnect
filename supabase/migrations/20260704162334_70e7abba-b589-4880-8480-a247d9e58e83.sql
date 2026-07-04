
-- ============================================================
-- 1. Restrict cost columns on pricing_plans
-- ============================================================
REVOKE SELECT ON public.pricing_plans FROM authenticated;
REVOKE SELECT ON public.pricing_plans FROM anon;

GRANT SELECT (id, license_type, label, price_cents, pricing_mode, markup_percent, is_active, created_at, updated_at, min_price_cents, customer_price_cents)
  ON public.pricing_plans TO authenticated;
GRANT SELECT (id, license_type, label, price_cents, is_active, min_price_cents, customer_price_cents)
  ON public.pricing_plans TO anon;

-- ============================================================
-- 2. Restrict cost columns on claude_plan_prices
-- ============================================================
REVOKE SELECT ON public.claude_plan_prices FROM authenticated;
REVOKE SELECT ON public.claude_plan_prices FROM anon;

GRANT SELECT (id, plan_code, sale_price_cents, is_active, created_at, updated_at, sort_order, markup_mode, markup_value_cents)
  ON public.claude_plan_prices TO authenticated;

-- ============================================================
-- 3. Restrict cost columns on reseller_recharge_plan_prices
-- ============================================================
REVOKE SELECT ON public.reseller_recharge_plan_prices FROM authenticated;
REVOKE SELECT ON public.reseller_recharge_plan_prices FROM anon;

GRANT SELECT (id, reseller_id, plan_id, sale_price_cents, is_active, show_on_storefront, created_at, updated_at)
  ON public.reseller_recharge_plan_prices TO anon;
GRANT SELECT (id, reseller_id, plan_id, sale_price_cents, cost_cents, is_active, show_on_storefront, created_at, updated_at)
  ON public.reseller_recharge_plan_prices TO authenticated;
-- Note: cost_cents visibility for authenticated is still row-filtered by the
-- existing rrpp_select_own_or_gerente policy (owner or gerente only).

-- ============================================================
-- 4. Restrict anonymous view of resellers to public columns only
-- ============================================================
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active) ON public.resellers TO anon;

-- ============================================================
-- 5. Webhook URL SSRF validation
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_webhook_url(url text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  host text;
BEGIN
  IF url IS NULL OR length(trim(url)) = 0 THEN
    RETURN;
  END IF;

  IF url !~* '^https?://[^/\s]+' THEN
    RAISE EXCEPTION 'webhook_url must start with http:// or https://';
  END IF;

  -- extract host portion
  host := lower(regexp_replace(url, '^https?://([^/?#:]+).*$', '\1'));

  -- Block loopback / metadata / private ranges (literal host match)
  IF host IN ('localhost', '0.0.0.0', '::1', '[::1]', 'metadata.google.internal') THEN
    RAISE EXCEPTION 'webhook_url host % is not allowed', host;
  END IF;

  -- Block IPv4 private/loopback/link-local literal ranges
  IF host ~ '^127\.' OR
     host ~ '^10\.' OR
     host ~ '^192\.168\.' OR
     host ~ '^169\.254\.' OR
     host ~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.' OR
     host ~ '^0\.' OR
     host ~ '^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.' THEN
    RAISE EXCEPTION 'webhook_url points to a private/reserved address (%)', host;
  END IF;

  -- Block IPv6 unique-local / link-local literal (fc00::/7, fe80::/10) and ::1
  IF host ~* '^\[?f[cd]' OR host ~* '^\[?fe8' OR host ~* '^\[?fe9' OR host ~* '^\[?fea' OR host ~* '^\[?feb' THEN
    RAISE EXCEPTION 'webhook_url points to a reserved IPv6 range (%)', host;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_webhook_url_safety()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.webhook_url IS DISTINCT FROM COALESCE(OLD.webhook_url, '') THEN
    PERFORM public.validate_webhook_url(NEW.webhook_url);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reseller_api_keys_webhook_safe ON public.reseller_api_keys;
CREATE TRIGGER trg_reseller_api_keys_webhook_safe
  BEFORE INSERT OR UPDATE OF webhook_url ON public.reseller_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.enforce_webhook_url_safety();

DROP TRIGGER IF EXISTS trg_reseller_claude_api_keys_webhook_safe ON public.reseller_claude_api_keys;
CREATE TRIGGER trg_reseller_claude_api_keys_webhook_safe
  BEFORE INSERT OR UPDATE OF webhook_url ON public.reseller_claude_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.enforce_webhook_url_safety();
