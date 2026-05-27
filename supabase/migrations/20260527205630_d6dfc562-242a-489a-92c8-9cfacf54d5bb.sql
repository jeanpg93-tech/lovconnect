
-- 1. Add columns to relevant tables
ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_discount_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_discount_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.reseller_credit_purchases
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promotion_discount_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.recharge_intents
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL;

ALTER TABLE public.balance_transactions
  ADD COLUMN IF NOT EXISTS promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL;

-- 2. Helper: compute discount for a base cost given kind
-- _kind in ('extension','credits'); returns final cost, discount amount, and promotion id (NULL if fallback used)
CREATE OR REPLACE FUNCTION public.compute_promotion_discount(_base_cents bigint, _kind text)
RETURNS TABLE(final_cents bigint, discount_cents bigint, promotion_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _promo public.promotions;
  _pct numeric := 0;
  _promo_id uuid := NULL;
  _gs_key text;
  _gs_val jsonb;
BEGIN
  IF _base_cents IS NULL OR _base_cents <= 0 THEN
    final_cents := COALESCE(_base_cents, 0);
    discount_cents := 0;
    promotion_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT * INTO _promo FROM public.get_active_promotion();
  IF FOUND AND _promo.id IS NOT NULL THEN
    IF _kind = 'extension' AND _promo.extension_discount_pct IS NOT NULL THEN
      _pct := _promo.extension_discount_pct;
      _promo_id := _promo.id;
    ELSIF _kind = 'credits' AND _promo.credit_discount_pct IS NOT NULL THEN
      _pct := _promo.credit_discount_pct;
      _promo_id := _promo.id;
    END IF;
  END IF;

  -- Fallback to global_settings if no active promo applies
  IF _pct = 0 THEN
    _gs_key := CASE _kind WHEN 'extension' THEN 'extension_discount_pct' WHEN 'credits' THEN 'credit_discount_pct' ELSE NULL END;
    IF _gs_key IS NOT NULL THEN
      SELECT value INTO _gs_val FROM public.global_settings WHERE key = _gs_key;
      IF _gs_val IS NOT NULL THEN
        BEGIN
          _pct := COALESCE((_gs_val#>>'{}')::numeric, 0);
        EXCEPTION WHEN OTHERS THEN _pct := 0; END;
      END IF;
    END IF;
  END IF;

  IF _pct <= 0 THEN
    final_cents := _base_cents;
    discount_cents := 0;
    promotion_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  discount_cents := floor(_base_cents::numeric * _pct / 100.0)::bigint;
  final_cents := _base_cents - discount_cents;
  promotion_id := _promo_id;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_promotion_discount(bigint, text) TO authenticated, service_role, anon;

-- 3. Helper: compute recharge bonus
CREATE OR REPLACE FUNCTION public.compute_recharge_bonus(_amount_cents bigint)
RETURNS TABLE(bonus_cents bigint, promotion_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _promo public.promotions;
  _pct numeric := 0;
  _promo_id uuid := NULL;
  _gs_val jsonb;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    bonus_cents := 0; promotion_id := NULL; RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO _promo FROM public.get_active_promotion();
  IF FOUND AND _promo.id IS NOT NULL AND _promo.recharge_bonus_pct IS NOT NULL THEN
    _pct := _promo.recharge_bonus_pct;
    _promo_id := _promo.id;
  END IF;

  IF _pct = 0 THEN
    SELECT value INTO _gs_val FROM public.global_settings WHERE key = 'recharge_bonus_pct';
    IF _gs_val IS NOT NULL THEN
      BEGIN _pct := COALESCE((_gs_val#>>'{}')::numeric, 0);
      EXCEPTION WHEN OTHERS THEN _pct := 0; END;
    END IF;
  END IF;

  IF _pct <= 0 THEN
    bonus_cents := 0; promotion_id := NULL; RETURN NEXT; RETURN;
  END IF;

  bonus_cents := floor(_amount_cents::numeric * _pct / 100.0)::bigint;
  promotion_id := _promo_id;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_recharge_bonus(bigint) TO authenticated, service_role, anon;

-- 4. Extended credit/debit helpers that record promotion_id on the transaction
CREATE OR REPLACE FUNCTION public.credit_reseller_balance_promo(
  _reseller_id uuid, _amount_cents bigint, _kind text,
  _description text, _reference_id uuid, _promotion_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.reseller_balances (reseller_id, balance_cents)
    VALUES (_reseller_id, _amount_cents)
    ON CONFLICT (reseller_id) DO UPDATE SET
      balance_cents = public.reseller_balances.balance_cents + EXCLUDED.balance_cents,
      updated_at = now();
  INSERT INTO public.balance_transactions (reseller_id, amount_cents, kind, description, reference_id, promotion_id)
    VALUES (_reseller_id, _amount_cents, _kind, _description, _reference_id, _promotion_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_reseller_balance_promo(uuid, bigint, text, text, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.debit_reseller_balance_promo(
  _reseller_id uuid, _amount_cents bigint, _kind text,
  _description text, _reference_id uuid, _promotion_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _current bigint;
BEGIN
  IF _amount_cents <= 0 THEN RAISE EXCEPTION 'amount must be positive'; END IF;
  INSERT INTO public.reseller_balances (reseller_id, balance_cents)
    VALUES (_reseller_id, 0) ON CONFLICT (reseller_id) DO NOTHING;
  SELECT balance_cents INTO _current FROM public.reseller_balances
    WHERE reseller_id = _reseller_id FOR UPDATE;
  IF _current < _amount_cents THEN RETURN false; END IF;
  UPDATE public.reseller_balances SET balance_cents = balance_cents - _amount_cents, updated_at = now()
    WHERE reseller_id = _reseller_id;
  INSERT INTO public.balance_transactions (reseller_id, amount_cents, kind, description, reference_id, promotion_id)
    VALUES (_reseller_id, -_amount_cents, _kind, _description, _reference_id, _promotion_id);
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_reseller_balance_promo(uuid, bigint, text, text, uuid, uuid) TO authenticated, service_role;

-- 5. Update Telegram trigger to include promotion lines
CREATE OR REPLACE FUNCTION public.trg_telegram_balance_tx()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _settings RECORD;
  _reseller_name TEXT;
  _amount_brl TEXT;
  _emoji TEXT;
  _label TEXT;
  _should_send BOOLEAN := false;
  _extra TEXT := '';
  _so RECORD;
  _ord RECORD;
  _rcp RECORD;
  _ri RECORD;
  _ref_intent RECORD;
  _short_id TEXT;
  _full_id TEXT;
  _produto TEXT;
  _link TEXT;
  _sf_text TEXT;
  _promo_name TEXT;
  _promo_id uuid;
  _promo_amt bigint := 0;
BEGIN
  BEGIN
    SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
    IF _settings.chat_id IS NULL THEN RETURN NEW; END IF;

    SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = NEW.reseller_id;
    _amount_brl := 'R$ ' || to_char(ABS(NEW.amount_cents)::numeric / 100.0, 'FM999G999G990D00');

    -- Resolve linked promotion (transaction-level OR order-level)
    _promo_id := NEW.promotion_id;

    IF NEW.kind = 'referral_commission' THEN
      _should_send := COALESCE(_settings.notify_recharges, true);
      _emoji := '🎁'; _label := 'Comissão de indicação recebida';
      SELECT ri.*, r.display_name AS payer_name
        INTO _ref_intent
        FROM public.recharge_intents ri
        LEFT JOIN public.resellers r ON r.id = ri.reseller_id
        WHERE ri.id = NEW.reference_id;
      IF FOUND THEN
        _extra := E'\n' || '👥 Pagador da recarga: ' || COALESCE(_ref_intent.payer_name, '—');
        _extra := _extra || E'\n' || '💵 Valor recarregado: R$ ' ||
          to_char(_ref_intent.amount_cents::numeric/100.0, 'FM999G990D00');
      END IF;
      IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
        _extra := _extra || E'\n' || '📝 ' || NEW.description;
      END IF;

    ELSIF NEW.kind = 'promotion_bonus' THEN
      _should_send := COALESCE(_settings.notify_recharges, true);
      _emoji := '🎉'; _label := 'Bônus de promoção creditado';
      IF _promo_id IS NOT NULL THEN
        SELECT name INTO _promo_name FROM public.promotions WHERE id = _promo_id;
        _extra := E'\n' || '🏷 Promoção: ' || COALESCE(_promo_name,'—');
      END IF;
      IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
        _extra := _extra || E'\n' || '📝 ' || NEW.description;
      END IF;

    ELSIF NEW.kind = 'order_debit' THEN
      _should_send := _settings.notify_sales;
      SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.reference_id;
      IF FOUND THEN
        IF _so.promotion_id IS NOT NULL THEN
          _promo_id := _so.promotion_id;
          _promo_amt := COALESCE(_so.promotion_discount_cents, 0);
        END IF;
        IF _so.product_type = 'credits' OR _so.credit_amount IS NOT NULL THEN
          _sf_text := public.build_storefront_credit_sale_text(_so.id);
          IF _sf_text IS NOT NULL AND _should_send THEN
            IF _promo_id IS NOT NULL THEN
              SELECT name INTO _promo_name FROM public.promotions WHERE id = _promo_id;
              _sf_text := _sf_text || E'\n' || '🎉 Promoção aplicada: ' || COALESCE(_promo_name,'—')
                || ' (−R$ ' || to_char(_promo_amt::numeric/100.0, 'FM999G990D00') || ')';
            END IF;
            PERFORM public.telegram_enqueue_ref(_sf_text, 'storefront_credit_sale', _so.id);
          ELSIF _should_send THEN
            _short_id := COALESCE(_so.short_code, substr(_so.id::text,1,8));
            PERFORM public.telegram_enqueue(
              '🛒 <b>Venda na Loja Pública — Créditos Lovable</b>' || E'\n' ||
              '👨‍💼 Revendedor: ' || COALESCE(_reseller_name,'—') || E'\n' ||
              '💵 Valor: ' || _amount_brl || E'\n' ||
              '🧾 Pedido (loja): <code>#' || _short_id || '</code>' || E'\n' ||
              '🆔 ID completo: <code>' || _so.id::text || '</code>' || E'\n' ||
              '📦 Produto: ' || COALESCE(_so.credit_amount::text,'?') || ' créditos Lovable' || E'\n' ||
              '👤 Cliente: ' || COALESCE(_so.buyer_name,'—') ||
                ' (' || COALESCE(_so.buyer_whatsapp,'—') || ')' ||
              CASE WHEN _promo_id IS NOT NULL THEN
                E'\n' || '🎉 Promoção aplicada: ' || COALESCE((SELECT name FROM public.promotions WHERE id = _promo_id),'—')
                  || ' (−R$ ' || to_char(_promo_amt::numeric/100.0, 'FM999G990D00') || ')'
              ELSE '' END
            );
          END IF;
          RETURN NEW;
        ELSE
          _short_id := COALESCE(_so.short_code, substr(_so.id::text,1,8));
          _full_id := _so.id::text;
          _emoji := '🛒'; _label := 'Venda na Loja Pública';
          _produto := 'Licença ' || CASE _so.license_type
              WHEN 'pro_1d' THEN 'PRO 1 dia'
              WHEN 'pro_7d' THEN 'PRO 7 dias'
              WHEN 'pro_15d' THEN 'PRO 15 dias'
              WHEN 'pro_30d' THEN 'PRO 30 dias'
              WHEN 'lifetime' THEN 'Vitalícia'
              WHEN 'trial' THEN 'Trial'
              ELSE COALESCE(_so.license_type,'—')
            END;
          _extra := E'\n' || '🧾 Pedido (loja): <code>#' || _short_id || '</code>';
          _extra := _extra || E'\n' || '🆔 ID completo: <code>' || _full_id || '</code>';
          _extra := _extra || E'\n' || '📦 Produto: ' || _produto;
          _extra := _extra || E'\n' || '🔑 Chave: <code>' || COALESCE(_so.license_key,'—') || '</code>';
          _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_so.buyer_name,'—') ||
                              ' (' || COALESCE(_so.buyer_whatsapp,'—') || ')';
          _extra := _extra || E'\n' || '💳 Pagamento: PIX (' || COALESCE(_so.provider,'misticpay') || ')';
          _extra := _extra || E'\n' || '🛠 Origem: Loja pública';
        END IF;
      END IF;

    ELSIF NEW.kind = 'license_purchase' THEN
      _should_send := _settings.notify_sales;
      _emoji := '🛒'; _label := 'Venda de Licença';
      SELECT o.*, c.name AS cust_name, c.whatsapp AS cust_wa
        INTO _ord
        FROM public.orders o
        LEFT JOIN public.reseller_customers c ON c.id = o.customer_id
        WHERE o.id = NEW.reference_id;
      IF FOUND THEN
        IF _ord.promotion_id IS NOT NULL THEN
          _promo_id := _ord.promotion_id;
          _promo_amt := COALESCE(_ord.promotion_discount_cents, 0);
        END IF;
        _produto := 'Licença ' || CASE _ord.license_type
            WHEN 'pro_1d' THEN 'PRO 1 dia'
            WHEN 'pro_7d' THEN 'PRO 7 dias'
            WHEN 'pro_15d' THEN 'PRO 15 dias'
            WHEN 'pro_30d' THEN 'PRO 30 dias'
            WHEN 'lifetime' THEN 'Vitalícia'
            WHEN 'trial' THEN 'Trial'
            ELSE COALESCE(_ord.license_type,'—')
          END;
        _extra := E'\n' || '🧾 Pedido (interno): <code>#' || substr(_ord.id::text,1,8) || '</code>';
        _extra := _extra || E'\n' || '🆔 ID completo: <code>' || _ord.id::text || '</code>';
        _extra := _extra || E'\n' || '📦 Produto: ' || _produto;
        _extra := _extra || E'\n' || '🔑 Chave: <code>' || COALESCE(_ord.license_key,'—') || '</code>';
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_ord.cust_name,'—') ||
                            ' (' || COALESCE(_ord.cust_wa,'—') || ')';
        _extra := _extra || E'\n' || '💳 Pagamento: Saldo do revendedor';
        _extra := _extra || E'\n' || '🛠 Origem: ' || CASE WHEN _ord.api_key_id IS NOT NULL THEN 'API do revendedor' ELSE 'Manual' END;
      ELSE
        _extra := E'\n' || '📦 ' || COALESCE(NEW.description, 'Licença gerada manualmente');
        _extra := _extra || E'\n' || '💳 Pagamento: Saldo do revendedor';
        _extra := _extra || E'\n' || '🛠 Origem: Geração manual (gerente)';
      END IF;

    ELSIF NEW.kind IN ('credit_purchase','credit_recharge_api') THEN
      _should_send := _settings.notify_sales;
      _emoji := '🛒'; _label := CASE WHEN NEW.kind='credit_recharge_api' THEN 'Venda de Créditos (API)' ELSE 'Venda de Créditos Lovable' END;
      SELECT * INTO _rcp FROM public.reseller_credit_purchases WHERE id = NEW.reference_id;
      IF FOUND THEN
        IF _rcp.promotion_id IS NOT NULL THEN
          _promo_id := _rcp.promotion_id;
          _promo_amt := COALESCE(_rcp.promotion_discount_cents, 0);
        END IF;
        _produto := COALESCE(_rcp.credits::text,'?') || ' créditos Lovable';
        _link := CASE WHEN _rcp.provider_pedido_id IS NOT NULL
                   THEN 'https://pedido.lvbcredits.com/' || _rcp.provider_pedido_id::text
                   ELSE '—' END;
        _extra := E'\n' || '🧾 Pedido (interno): <code>#' || substr(_rcp.id::text,1,8) || '</code>';
        _extra := _extra || E'\n' || '🆔 ID completo: <code>' || _rcp.id::text || '</code>';
        _extra := _extra || E'\n' || '🔗 Pedido no provedor: <code>' || COALESCE(_rcp.provider_pedido_id::text,'—') || '</code>';
        _extra := _extra || E'\n' || '🌐 Link do cliente: ' || _link;
        _extra := _extra || E'\n' || '📦 Produto: ' || _produto;
        _extra := _extra || E'\n' || '🚚 Entrega: ' || COALESCE(_rcp.tipo_entrega,'—');
        _extra := _extra || E'\n' || '✉️ Conta Lovable: ' || COALESCE(_rcp.email_conta_lovable,'—');
        _extra := _extra || E'\n' || '🗂 Workspace: ' || COALESCE(_rcp.workspace_name,'—');
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_rcp.customer_name,'—') ||
                            ' (' || COALESCE(_rcp.customer_whatsapp,'—') || ')';
        _extra := _extra || E'\n' || '💳 Pagamento: Saldo do revendedor';
        _extra := _extra || E'\n' || '🛠 Origem: API do revendedor';
      ELSE
        _extra := E'\n' || '📦 Produto: créditos Lovable';
        _extra := _extra || E'\n' || '💳 Pagamento: Saldo do revendedor';
        _extra := _extra || E'\n' || '🛠 Origem: API do revendedor';
        IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
          _extra := _extra || E'\n' || '📝 ' || NEW.description;
        END IF;
      END IF;

    ELSIF NEW.kind = 'recharge' THEN
      _should_send := _settings.notify_recharges;
      _emoji := '💰'; _label := 'Recarga de saldo';
      SELECT ri.*, ri.payer_name INTO _ri FROM public.recharge_intents ri WHERE ri.id = NEW.reference_id;
      IF FOUND THEN
        IF _ri.promotion_id IS NOT NULL THEN
          _promo_id := _ri.promotion_id;
        END IF;
        _extra := E'\n' || '💳 Via: PIX (' || COALESCE(_ri.provider,'misticpay') || ')';
        IF _ri.payer_name IS NOT NULL THEN
          _extra := _extra || E'\n' || '👤 Pagador: ' || _ri.payer_name;
        END IF;
        IF _ri.bonus_cents IS NOT NULL AND _ri.bonus_cents > 0 THEN
          _extra := _extra || E'\n' || '🎁 Bônus: R$ ' || to_char(_ri.bonus_cents::numeric/100.0,'FM999G990D00');
        END IF;
      ELSE
        _extra := E'\n' || '🛠 Origem: Crédito manual (gerente)';
      END IF;

    ELSIF NEW.kind IN ('refund','order_refund','estorno','reembolso') THEN
      _should_send := _settings.notify_refunds;
      _emoji := '↩️'; _label := 'Reembolso / Estorno';
      SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.reference_id;
      IF FOUND THEN
        _extra := E'\n' || '🧾 Pedido: <code>#' || COALESCE(_so.short_code, substr(_so.id::text,1,8)) || '</code>';
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_so.buyer_name,'—');
      END IF;

    ELSIF NEW.kind IN ('manual_credit','manual_debit') THEN
      _should_send := _settings.notify_reseller_activity;
      _emoji := CASE WHEN NEW.kind='manual_credit' THEN '➕' ELSE '➖' END;
      _label := CASE WHEN NEW.kind='manual_credit' THEN 'Crédito manual (gerente)' ELSE 'Débito manual (gerente)' END;

    ELSE
      _should_send := _settings.notify_reseller_activity;
      _emoji := '⚙️'; _label := 'Movimentação (' || NEW.kind || ')';
    END IF;

    -- Append promotion line for sales kinds when known
    IF _promo_id IS NOT NULL AND _promo_amt > 0 AND NEW.kind IN ('order_debit','license_purchase','credit_purchase','credit_recharge_api') THEN
      SELECT name INTO _promo_name FROM public.promotions WHERE id = _promo_id;
      _extra := _extra || E'\n' || '🎉 Promoção aplicada: ' || COALESCE(_promo_name,'—')
        || ' (−R$ ' || to_char(_promo_amt::numeric/100.0, 'FM999G990D00') || ')';
    END IF;

    IF _should_send THEN
      PERFORM public.telegram_enqueue(
        _emoji || ' <b>' || _label || '</b>' || E'\n' ||
        '👨‍💼 Revendedor: ' || COALESCE(_reseller_name, '—') || E'\n' ||
        '💵 Valor: ' || _amount_brl ||
        _extra ||
        CASE WHEN NEW.description IS NOT NULL AND NEW.description <> ''
          AND NEW.kind NOT IN ('credit_recharge_api','credit_purchase','license_purchase','order_debit',
                               'license_purchase_refund','credit_purchase_refund','referral_commission','promotion_bonus')
          THEN E'\n' || '📝 ' || NEW.description ELSE '' END
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_telegram_balance_tx failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;
