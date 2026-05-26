
-- 1) Hardening: never let a failure in the Telegram notification trigger
--    rollback a balance transaction (and consequently block a sale).
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
  _origem TEXT;
  _so RECORD;
  _ord RECORD;
  _rcp RECORD;
  _ri RECORD;
  _ref_intent RECORD;
  _so_rcp RECORD;
  _short_id TEXT;
  _full_id TEXT;
  _produto TEXT;
BEGIN
  BEGIN
    SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
    IF _settings.chat_id IS NULL THEN RETURN NEW; END IF;

    SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = NEW.reseller_id;
    _amount_brl := 'R$ ' || to_char(ABS(NEW.amount_cents)::numeric / 100.0, 'FM999G999G990D00');

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

    ELSIF NEW.kind = 'order_debit' THEN
      _should_send := _settings.notify_sales;
      _emoji := '🛒'; _label := 'Venda na Loja Pública';
      SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.reference_id;
      IF FOUND THEN
        _short_id := COALESCE(_so.short_code, substr(_so.id::text,1,8));
        _full_id := _so.id::text;
        IF _so.product_type = 'credits' OR _so.credit_amount IS NOT NULL THEN
          SELECT * INTO _so_rcp
            FROM public.reseller_credit_purchases
            WHERE reseller_id = _so.reseller_id
              AND credits = _so.credit_amount
              AND COALESCE(customer_whatsapp,'') = COALESCE(_so.buyer_whatsapp,'')
            ORDER BY created_at DESC
            LIMIT 1;
          _produto := COALESCE(_so.credit_amount::text,'?') || ' créditos Lovable';
          _extra := E'\n' || '🧾 Pedido (loja): <code>#' || _short_id || '</code>';
          _extra := _extra || E'\n' || '🆔 ID completo: <code>' || _full_id || '</code>';
          _extra := _extra || E'\n' || '🔗 Pedido no provedor: <code>' || COALESCE(_so_rcp.provider_pedido_id::text,'—') || '</code>';
          _extra := _extra || E'\n' || '📦 Produto: ' || _produto;
          _extra := _extra || E'\n' || '🚚 Entrega: ' || COALESCE(_so.delivery_type, _so_rcp.tipo_entrega, '—');
          _extra := _extra || E'\n' || '✉️ Conta Lovable: ' || COALESCE(_so_rcp.email_conta_lovable, '—');
          _extra := _extra || E'\n' || '🗂 Workspace: ' || COALESCE(_so_rcp.workspace_name, '—');
          _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_so.buyer_name,'—') ||
                              ' (' || COALESCE(_so.buyer_whatsapp,'—') || ')';
          _extra := _extra || E'\n' || '💳 Pagamento: PIX (' || COALESCE(_so.provider,'misticpay') || ')';
          _extra := _extra || E'\n' || '🛠 Origem: Loja pública';
        ELSE
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
      END IF;

    ELSIF NEW.kind = 'credit_purchase' THEN
      _should_send := _settings.notify_sales;
      _emoji := '🛒'; _label := 'Venda de Créditos Lovable';
      SELECT * INTO _rcp FROM public.reseller_credit_purchases WHERE id = NEW.reference_id;
      IF FOUND THEN
        _produto := COALESCE(_rcp.credits::text,'?') || ' créditos Lovable';
        _extra := E'\n' || '🧾 Pedido (interno): <code>#' || substr(_rcp.id::text,1,8) || '</code>';
        _extra := _extra || E'\n' || '🆔 ID completo: <code>' || _rcp.id::text || '</code>';
        _extra := _extra || E'\n' || '🔗 Pedido no provedor: <code>' || COALESCE(_rcp.provider_pedido_id::text,'—') || '</code>';
        _extra := _extra || E'\n' || '📦 Produto: ' || _produto;
        _extra := _extra || E'\n' || '🚚 Entrega: ' || COALESCE(_rcp.tipo_entrega,'—');
        _extra := _extra || E'\n' || '✉️ Conta Lovable: ' || COALESCE(_rcp.email_conta_lovable,'—');
        _extra := _extra || E'\n' || '🗂 Workspace: ' || COALESCE(_rcp.workspace_name,'—');
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_rcp.customer_name,'—') ||
                            ' (' || COALESCE(_rcp.customer_whatsapp,'—') || ')';
        _extra := _extra || E'\n' || '💳 Pagamento: Saldo do revendedor';
        _extra := _extra || E'\n' || '🛠 Origem: API do revendedor';
      END IF;

    ELSIF NEW.kind = 'credit_recharge_api' THEN
      _should_send := _settings.notify_sales;
      _emoji := '🛒'; _label := 'Venda de Créditos (API)';
      _extra := E'\n' || '📦 Produto: créditos Lovable';
      _extra := _extra || E'\n' || '💳 Pagamento: Saldo do revendedor';
      _extra := _extra || E'\n' || '🛠 Origem: API do revendedor';
      IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
        _extra := _extra || E'\n' || '📝 ' || NEW.description;
      END IF;

    ELSIF NEW.kind = 'recharge' THEN
      _should_send := _settings.notify_recharges;
      _emoji := '💰'; _label := 'Recarga de saldo';
      SELECT ri.*, ri.payer_name
        INTO _ri
        FROM public.recharge_intents ri
        WHERE ri.id = NEW.reference_id;
      IF FOUND THEN
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

    IF _should_send THEN
      PERFORM public.telegram_enqueue(
        _emoji || ' <b>' || _label || '</b>' || E'\n' ||
        '👨‍💼 Revendedor: ' || COALESCE(_reseller_name, '—') || E'\n' ||
        '💵 Valor: ' || _amount_brl ||
        _extra ||
        CASE WHEN NEW.description IS NOT NULL AND NEW.description <> ''
          AND NEW.kind NOT IN ('credit_recharge_api','credit_purchase','license_purchase','order_debit',
                               'license_purchase_refund','credit_purchase_refund','referral_commission')
          THEN E'\n' || '📝 ' || NEW.description ELSE '' END
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- NUNCA deixar uma falha de notificação derrubar a transação financeira.
    RAISE WARNING 'trg_telegram_balance_tx failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;


-- 2) Notificação no Telegram quando uma venda da loja for BLOQUEADA por saldo.
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
BEGIN
  BEGIN
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

DROP TRIGGER IF EXISTS telegram_order_blocked ON public.storefront_orders;
CREATE TRIGGER telegram_order_blocked
AFTER UPDATE OF status ON public.storefront_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_telegram_order_blocked();
