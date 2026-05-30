
-- 1) Marcador de idempotência na tabela orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS telegram_sale_notified_at timestamptz;

-- 2) Função que monta e envia a notificação de venda de licença (idempotente)
CREATE OR REPLACE FUNCTION public.notify_license_order_sale(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _settings RECORD;
  _ord RECORD;
  _btx RECORD;
  _reseller_name TEXT;
  _produto TEXT;
  _label TEXT;
  _kind_label TEXT;
  _short_id TEXT;
  _amount_brl TEXT;
  _promo_name TEXT;
  _extra TEXT;
BEGIN
  SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
  IF _settings.chat_id IS NULL OR COALESCE(_settings.notify_sales, true) = false THEN
    RETURN;
  END IF;

  SELECT o.*, c.display_name AS cust_name, c.whatsapp AS cust_wa
    INTO _ord
    FROM public.orders o
    LEFT JOIN public.reseller_customers c ON c.id = o.customer_id
    WHERE o.id = _order_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF _ord.telegram_sale_notified_at IS NOT NULL THEN RETURN; END IF;
  IF _ord.license_key IS NULL OR _ord.status <> 'completed' THEN RETURN; END IF;

  -- Busca o débito associado para identificar valor e se foi API
  SELECT * INTO _btx
    FROM public.balance_transactions
   WHERE reference_id = _order_id
     AND kind IN ('license_purchase','api_debit')
   ORDER BY created_at DESC
   LIMIT 1;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = _ord.reseller_id;

  _kind_label := CASE WHEN _btx.kind = 'api_debit' OR _ord.api_key_id IS NOT NULL
                      THEN 'Venda de Licença (API)' ELSE 'Venda de Licença' END;

  _produto := 'Licença ' || CASE _ord.license_type
      WHEN 'pro_1d' THEN 'PRO 1 dia'
      WHEN 'pro_7d' THEN 'PRO 7 dias'
      WHEN 'pro_15d' THEN 'PRO 15 dias'
      WHEN 'pro_30d' THEN 'PRO 30 dias'
      WHEN 'flow_1d' THEN 'FLOW 1 dia'
      WHEN 'flow_7d' THEN 'FLOW 7 dias'
      WHEN 'flow_15d' THEN 'FLOW 15 dias'
      WHEN 'flow_30d' THEN 'FLOW 30 dias'
      WHEN 'lifetime' THEN 'Vitalícia'
      WHEN 'trial' THEN 'Trial'
      ELSE COALESCE(_ord.license_type,'—')
    END;

  _short_id := substr(_ord.id::text, 1, 8);
  _amount_brl := 'R$ ' || to_char(ABS(COALESCE(_btx.amount_cents, _ord.price_cents, 0))::numeric / 100.0, 'FM999G999G990D00');

  _extra := E'\n' || '🧾 Pedido (interno): <code>#' || _short_id || '</code>'
         || E'\n' || '🆔 ID completo: <code>' || _ord.id::text || '</code>'
         || E'\n' || '📦 Produto: ' || _produto
         || E'\n' || '🔑 Chave: <code>' || _ord.license_key || '</code>'
         || E'\n' || '👤 Cliente: ' || COALESCE(_ord.cust_name,'—') ||
              ' (' || COALESCE(_ord.cust_wa,'—') || ')'
         || E'\n' || '💳 Pagamento: Saldo do revendedor'
         || E'\n' || '🛠 Origem: ' || CASE WHEN _ord.api_key_id IS NOT NULL OR _btx.kind = 'api_debit'
                                            THEN 'API do revendedor' ELSE 'Geração manual / painel' END;

  IF _ord.promotion_id IS NOT NULL AND COALESCE(_ord.promotion_discount_cents,0) > 0 THEN
    SELECT name INTO _promo_name FROM public.promotions WHERE id = _ord.promotion_id;
    _extra := _extra || E'\n' || '🎉 Promoção aplicada: ' || COALESCE(_promo_name,'—')
      || ' (−R$ ' || to_char(_ord.promotion_discount_cents::numeric/100.0, 'FM999G990D00') || ')';
  END IF;

  PERFORM public.telegram_enqueue(
    '🛒 <b>' || _kind_label || '</b>' || E'\n' ||
    '👨‍💼 Revendedor: ' || COALESCE(_reseller_name, '—') || E'\n' ||
    '💵 Valor: ' || _amount_brl ||
    _extra
  );

  UPDATE public.orders SET telegram_sale_notified_at = now() WHERE id = _order_id;
END;
$$;

-- 3) Trigger em orders: quando license_key chega e status=completed, notifica
CREATE OR REPLACE FUNCTION public.trg_orders_notify_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    IF NEW.status = 'completed'
       AND NEW.license_key IS NOT NULL
       AND NEW.telegram_sale_notified_at IS NULL
       AND COALESCE(NEW.is_test, false) = false
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
$$;

DROP TRIGGER IF EXISTS orders_notify_sale_ai ON public.orders;
CREATE TRIGGER orders_notify_sale_ai
AFTER INSERT OR UPDATE OF status, license_key
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trg_orders_notify_sale();

-- 4) Atualiza a trigger de balance_transactions: suprime notificação inline de
--    license_purchase/api_debit (será emitida pela trigger de orders quando a
--    chave estiver disponível). Mantém comportamento idêntico nos demais kinds.
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
  _kind text;
BEGIN
  BEGIN
    SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
    IF _settings.chat_id IS NULL THEN RETURN NEW; END IF;

    SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = NEW.reseller_id;
    _amount_brl := 'R$ ' || to_char(ABS(NEW.amount_cents)::numeric / 100.0, 'FM999G999G990D00');

    _promo_id := NEW.promotion_id;
    _kind := NEW.kind;

    IF _kind = 'referral_commission' THEN
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

    ELSIF _kind = 'promotion_bonus' THEN
      _should_send := COALESCE(_settings.notify_recharges, true);
      _emoji := '🎉'; _label := 'Bônus de promoção creditado';
      IF _promo_id IS NOT NULL THEN
        SELECT name INTO _promo_name FROM public.promotions WHERE id = _promo_id;
        _extra := E'\n' || '🏷 Promoção: ' || COALESCE(_promo_name,'—');
      END IF;
      IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
        _extra := _extra || E'\n' || '📝 ' || NEW.description;
      END IF;

    ELSIF _kind = 'order_debit' THEN
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
              WHEN 'flow_1d' THEN 'FLOW 1 dia'
              WHEN 'flow_7d' THEN 'FLOW 7 dias'
              WHEN 'flow_15d' THEN 'FLOW 15 dias'
              WHEN 'flow_30d' THEN 'FLOW 30 dias'
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
      ELSE
        _emoji := '🛒'; _label := 'Venda na Loja Pública';
        _extra := E'\n' || '📦 ' || COALESCE(NEW.description, 'Pedido na loja pública');
        _extra := _extra || E'\n' || '🛠 Origem: Loja pública';
      END IF;

    ELSIF _kind IN ('license_purchase','api_debit') THEN
      -- Suprimimos a notificação aqui. A notificação completa (com chave)
      -- será disparada por trg_orders_notify_sale assim que a chave for gerada.
      RETURN NEW;

    ELSIF _kind IN ('credit_purchase','credit_recharge_api','credit_purchase_api','credit_purchase_api_manual') THEN
      _should_send := _settings.notify_sales;
      _emoji := '🛒';
      _label := CASE
        WHEN _kind='credit_purchase' THEN 'Venda de Créditos Lovable'
        WHEN _kind='credit_recharge_api' THEN 'Venda de Créditos (API)'
        WHEN _kind='credit_purchase_api' THEN 'Compra de Créditos (API)'
        WHEN _kind='credit_purchase_api_manual' THEN 'Compra Manual de Créditos (API)'
      END;
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
        _extra := E'\n' || '📦 ' || COALESCE(NEW.description, 'Créditos Lovable');
        _extra := _extra || E'\n' || '💳 Pagamento: Saldo do revendedor';
        _extra := _extra || E'\n' || '🛠 Origem: ' || CASE WHEN _kind LIKE '%api%' THEN 'API do revendedor' ELSE 'Painel' END;
      END IF;

    ELSIF _kind IN ('recharge','deposit') THEN
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
        _extra := E'\n' || '🛠 Origem: ' || CASE WHEN _kind='deposit' THEN 'Depósito' ELSE 'Crédito manual (gerente)' END;
        IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
          _extra := _extra || E'\n' || '📝 ' || NEW.description;
        END IF;
      END IF;

    ELSIF _kind IN (
      'refund','order_refund','estorno','reembolso',
      'license_purchase_refund','credit_purchase_refund',
      'credit_purchase_api_refund','credit_purchase_api_manual_refund',
      'credit_recharge_refund','api_refund','panel_refund'
    ) THEN
      _should_send := _settings.notify_refunds;
      _emoji := '↩️';
      _label := CASE
        WHEN _kind='license_purchase_refund' THEN 'Estorno de Licença'
        WHEN _kind IN ('credit_purchase_refund','credit_purchase_api_refund','credit_purchase_api_manual_refund') THEN 'Estorno de Créditos'
        WHEN _kind='credit_recharge_refund' THEN 'Estorno de Recarga de Créditos'
        WHEN _kind='api_refund' THEN 'Estorno API'
        WHEN _kind='order_refund' THEN 'Estorno de Pedido'
        ELSE 'Reembolso / Estorno'
      END;
      SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.reference_id;
      IF FOUND THEN
        _extra := E'\n' || '🧾 Pedido: <code>#' || COALESCE(_so.short_code, substr(_so.id::text,1,8)) || '</code>';
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_so.buyer_name,'—');
      END IF;
      IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
        _extra := _extra || E'\n' || '📝 ' || NEW.description;
      END IF;

    ELSIF _kind IN ('manual_credit','manual_debit','adjustment','adjustment_debit') THEN
      _should_send := _settings.notify_reseller_activity;
      _emoji := CASE WHEN _kind IN ('manual_credit','adjustment') THEN '➕' ELSE '➖' END;
      _label := CASE
        WHEN _kind='manual_credit' THEN 'Crédito manual (gerente)'
        WHEN _kind='manual_debit' THEN 'Débito manual (gerente)'
        WHEN _kind='adjustment' THEN 'Ajuste de saldo (+)'
        WHEN _kind='adjustment_debit' THEN 'Ajuste de saldo (−)'
      END;
      IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
        _extra := E'\n' || '📝 ' || NEW.description;
      END IF;

    ELSE
      _should_send := COALESCE(_settings.notify_reseller_activity, true);
      _emoji := '⚙️'; _label := 'Movimentação (' || _kind || ')';
      IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
        _extra := E'\n' || '📝 ' || NEW.description;
      END IF;
    END IF;

    IF _promo_id IS NOT NULL AND _promo_amt > 0 AND _kind IN ('order_debit','credit_purchase','credit_recharge_api','credit_purchase_api','credit_purchase_api_manual') THEN
      SELECT name INTO _promo_name FROM public.promotions WHERE id = _promo_id;
      _extra := _extra || E'\n' || '🎉 Promoção aplicada: ' || COALESCE(_promo_name,'—')
        || ' (−R$ ' || to_char(_promo_amt::numeric/100.0, 'FM999G990D00') || ')';
    END IF;

    IF _should_send THEN
      PERFORM public.telegram_enqueue(
        _emoji || ' <b>' || _label || '</b>' || E'\n' ||
        '👨‍💼 Revendedor: ' || COALESCE(_reseller_name, '—') || E'\n' ||
        '💵 Valor: ' || _amount_brl ||
        _extra
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.telegram_notification_failures (balance_tx_id, kind, reseller_id, amount_cents, reason, sqlstate, context)
      VALUES (NEW.id, NEW.kind, NEW.reseller_id, NEW.amount_cents, SQLERRM, SQLSTATE,
              jsonb_build_object('description', NEW.description, 'reference_id', NEW.reference_id));
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RAISE WARNING 'trg_telegram_balance_tx failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;
