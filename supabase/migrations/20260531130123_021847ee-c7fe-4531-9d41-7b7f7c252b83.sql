CREATE OR REPLACE FUNCTION public.trg_orders_notify_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_storefront BOOLEAN := false;
  _is_subscription BOOLEAN := false;
  _is_demo BOOLEAN := false;
BEGIN
  BEGIN
    SELECT COALESCE(is_demo, false) INTO _is_demo
      FROM public.resellers WHERE id = NEW.reseller_id;
    IF _is_demo THEN RETURN NEW; END IF;

    IF NEW.notes IS NOT NULL THEN
      IF position('Venda da Loja' in NEW.notes) > 0 THEN
        _is_storefront := true;
      END IF;
      IF position('"billing_mode":"subscription"' in NEW.notes) > 0 THEN
        _is_subscription := true;
      END IF;
    END IF;

    IF NEW.status = 'completed'
       AND NEW.license_key IS NOT NULL
       AND NEW.telegram_sale_notified_at IS NULL
       AND COALESCE(NEW.is_test, false) = false
       AND NOT _is_storefront
       AND NOT _is_subscription
       AND (TG_OP = 'INSERT'
            OR OLD.license_key IS DISTINCT FROM NEW.license_key
            OR OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM public.notify_license_order_sale(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_orders_notify_sale failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_telegram_order_blocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _settings RECORD;
  _reseller_name TEXT;
  _balance_cents BIGINT;
  _cost_brl TEXT;
  _saldo_brl TEXT;
  _produto TEXT;
  _short_id TEXT;
  _is_demo BOOLEAN := false;
BEGIN
  BEGIN
    SELECT COALESCE(is_demo, false) INTO _is_demo
      FROM public.resellers WHERE id = NEW.reseller_id;
    IF _is_demo THEN RETURN NEW; END IF;

    IF NEW.status <> 'awaiting_balance' OR COALESCE(OLD.status,'') = 'awaiting_balance' THEN
      RETURN NEW;
    END IF;

    SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
    IF _settings.chat_id IS NULL THEN RETURN NEW; END IF;

    SELECT display_name, balance_cents INTO _reseller_name, _balance_cents
      FROM public.resellers WHERE id = NEW.reseller_id;

    _cost_brl  := 'R$ ' || to_char(COALESCE(NEW.cost_cents,0)::numeric/100.0,'FM999G990D00');
    _saldo_brl := 'R$ ' || to_char(COALESCE(_balance_cents,0)::numeric/100.0,'FM999G990D00');
    _short_id  := COALESCE(NEW.short_code, substr(NEW.id::text,1,8));

    IF NEW.product_type = 'credits' OR NEW.credit_amount IS NOT NULL THEN
      _produto := COALESCE(NEW.credit_amount::text,'?') || ' créditos Lovable';
    ELSE
      _produto := 'Licença ' || COALESCE(NEW.license_type,'—');
    END IF;

    PERFORM public.telegram_enqueue(
      '⛔ <b>Venda bloqueada por saldo insuficiente</b>' || E'\n' ||
      '👨‍💼 Revendedor: ' || COALESCE(_reseller_name,'—') || E'\n' ||
      '🧾 Pedido (loja): <code>#' || _short_id || '</code>' || E'\n' ||
      '🆔 ID completo: <code>' || NEW.id::text || '</code>' || E'\n' ||
      '📦 Produto: ' || _produto || E'\n' ||
      '💸 Custo do revendedor: ' || _cost_brl || E'\n' ||
      '💼 Saldo atual: ' || _saldo_brl || E'\n' ||
      '👤 Cliente: ' || COALESCE(NEW.buyer_name,'—') ||
        ' (' || COALESCE(NEW.buyer_whatsapp,'—') || ')' || E'\n' ||
      '⏳ Aguardará liberação automática assim que houver saldo.'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_telegram_order_blocked failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_telegram_balance_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_demo BOOLEAN := false;
BEGIN
  SELECT COALESCE(is_demo, false) INTO _is_demo
    FROM public.resellers WHERE id = NEW.reseller_id;
  IF _is_demo THEN RETURN NEW; END IF;

  -- delega para a versão original (renomeada)
  PERFORM public._trg_telegram_balance_tx_real(NEW);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trg_telegram_balance_tx wrapper failed: % / %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;