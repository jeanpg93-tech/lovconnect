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
BEGIN
  SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
  IF _settings.chat_id IS NULL THEN RETURN NEW; END IF;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = NEW.reseller_id;
  _amount_brl := 'R$ ' || to_char(ABS(NEW.amount_cents)::numeric / 100.0, 'FM999G999G990D00');

  IF NEW.kind = 'order_debit' THEN
    _should_send := _settings.notify_sales;
    _emoji := '🛒'; _label := 'Venda na Loja Pública';
    SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.reference_id;
    IF FOUND THEN
      _extra := E'\n' || '🧾 Pedido: <code>#' || COALESCE(_so.short_code, substr(_so.id::text,1,8)) || '</code>';
      IF _so.product_type = 'credits' OR _so.credit_amount IS NOT NULL THEN
        _extra := _extra || E'\n' || '📦 Produto: Créditos Lovable (' || COALESCE(_so.credit_amount::text,'?') || ' créditos)';
        IF _so.delivery_type IS NOT NULL THEN
          _extra := _extra || E'\n' || '🚚 Entrega: ' || _so.delivery_type;
        END IF;
      ELSE
        _extra := _extra || E'\n' || '📦 Produto: Licença ' ||
          CASE _so.license_type
            WHEN 'pro_1d' THEN 'PRO 1 dia'
            WHEN 'pro_7d' THEN 'PRO 7 dias'
            WHEN 'pro_15d' THEN 'PRO 15 dias'
            WHEN 'pro_30d' THEN 'PRO 30 dias'
            WHEN 'lifetime' THEN 'Vitalícia'
            WHEN 'trial' THEN 'Trial'
            ELSE COALESCE(_so.license_type,'—')
          END;
      END IF;
      _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_so.buyer_name,'—') ||
                          ' (' || COALESCE(_so.buyer_whatsapp,'—') || ')';
      IF _so.license_key IS NOT NULL THEN
        _extra := _extra || E'\n' || '🔑 Chave: <code>' || _so.license_key || '</code>';
      END IF;
      _extra := _extra || E'\n' || '💳 Pago via PIX (' || COALESCE(_so.provider,'misticpay') || ')';
    END IF;

  ELSIF NEW.kind = 'license_purchase' THEN
    _should_send := _settings.notify_sales;
    _emoji := '🛒'; _label := 'Venda de Licença';
    SELECT o.*, rc.display_name AS cust_name, rc.whatsapp AS cust_wa
      INTO _ord
      FROM public.orders o
      LEFT JOIN public.reseller_customers rc ON rc.id = o.customer_id
      WHERE o.id = NEW.reference_id;
    IF FOUND THEN
      _origem := CASE WHEN _ord.api_key_id IS NOT NULL THEN 'API do revendedor' ELSE 'Painel (manual)' END;
      _extra := E'\n' || '🧾 Pedido: <code>#' || substr(_ord.id::text,1,8) || '</code>';
      _extra := _extra || E'\n' || '📦 Produto: Licença ' || COALESCE(_ord.license_type,'—');
      IF _ord.license_key IS NOT NULL THEN
        _extra := _extra || E'\n' || '🔑 Chave: <code>' || _ord.license_key || '</code>';
      END IF;
      IF _ord.cust_name IS NOT NULL OR _ord.cust_wa IS NOT NULL THEN
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_ord.cust_name,'—') ||
                            ' (' || COALESCE(_ord.cust_wa,'—') || ')';
      END IF;
      _extra := _extra || E'\n' || '🛠 Origem: ' || _origem;
    END IF;

  ELSIF NEW.kind = 'credit_purchase' THEN
    _should_send := _settings.notify_sales;
    _emoji := '🛒'; _label := 'Venda de Créditos Lovable';
    SELECT * INTO _rcp FROM public.reseller_credit_purchases WHERE id = NEW.reference_id;
    IF FOUND THEN
      _origem := CASE WHEN _rcp.api_key_id IS NOT NULL THEN 'API do revendedor' ELSE 'Painel (manual)' END;
      _extra := E'\n' || '🧾 Pedido: <code>#' || substr(_rcp.id::text,1,8) || '</code>';
      _extra := _extra || E'\n' || '📦 Produto: ' || _rcp.credits || ' créditos Lovable';
      IF _rcp.tipo_entrega IS NOT NULL THEN
        _extra := _extra || E'\n' || '🚚 Entrega: ' || _rcp.tipo_entrega;
      END IF;
      IF _rcp.email_conta_lovable IS NOT NULL THEN
        _extra := _extra || E'\n' || '✉️ Conta Lovable: ' || _rcp.email_conta_lovable;
      END IF;
      IF _rcp.workspace_name IS NOT NULL THEN
        _extra := _extra || E'\n' || '🗂 Workspace: ' || _rcp.workspace_name;
      END IF;
      IF _rcp.customer_name IS NOT NULL OR _rcp.customer_whatsapp IS NOT NULL THEN
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_rcp.customer_name,'—') ||
                            ' (' || COALESCE(_rcp.customer_whatsapp,'—') || ')';
      END IF;
      _extra := _extra || E'\n' || '🛠 Origem: ' || _origem;
    END IF;

  ELSIF NEW.kind = 'credit_recharge_api' THEN
    _should_send := _settings.notify_sales;
    _emoji := '🛒'; _label := 'Compra de créditos via API';
    _extra := E'\n' || '🛠 Origem: API do revendedor';
    IF NEW.description IS NOT NULL AND NEW.description <> '' THEN
      _extra := _extra || E'\n' || '📦 ' || NEW.description;
    END IF;

  ELSIF NEW.kind = 'credit_recharge_refund' THEN
    _should_send := _settings.notify_refunds;
    _emoji := '↩️'; _label := 'Estorno — compra de créditos via API';
    _extra := E'\n' || '🛠 Origem: API do revendedor (falha no fornecedor)';

  ELSIF NEW.kind IN ('deposit','recharge') THEN
    _should_send := _settings.notify_recharges;
    _emoji := '💰'; _label := 'Recarga de saldo';
    SELECT * INTO _ri FROM public.recharge_intents WHERE id = NEW.reference_id;
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
      CASE WHEN NEW.description IS NOT NULL AND NEW.description <> '' AND NEW.kind <> 'credit_recharge_api'
        THEN E'\n' || '📝 ' || NEW.description ELSE '' END
    );
  END IF;
  RETURN NEW;
END;
$function$;