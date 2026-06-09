
CREATE OR REPLACE FUNCTION public.notify_license_order_sale(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _settings RECORD;
  _ord RECORD;
  _btx RECORD;
  _reseller_name TEXT;
  _produto TEXT;
  _kind_label TEXT;
  _short_id TEXT;
  _amount_brl TEXT;
  _promo_name TEXT;
  _extra TEXT;
  _paid_with_pack BOOLEAN := false;
  _payment_label TEXT;
  _origin_label TEXT;
  _wallet_cents BIGINT;
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

  SELECT EXISTS(
    SELECT 1 FROM public.reseller_pack_ledger
    WHERE order_id = _order_id AND kind = 'sale_consume'
  ) OR (_ord.notes IS NOT NULL AND position('"delivery_source":"pack"' in _ord.notes) > 0)
  INTO _paid_with_pack;

  IF _paid_with_pack THEN
    UPDATE public.orders SET telegram_sale_notified_at = now() WHERE id = _order_id;
    RETURN;
  END IF;

  SELECT * INTO _btx
    FROM public.balance_transactions
   WHERE reference_id = _order_id
     AND kind IN ('license_purchase','api_debit')
   ORDER BY created_at DESC
   LIMIT 1;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = _ord.reseller_id;

  _origin_label := CASE WHEN _ord.api_key_id IS NOT NULL OR _btx.kind = 'api_debit'
                          THEN 'API do revendedor' ELSE 'Geração manual / painel' END;
  _kind_label := CASE WHEN _ord.api_key_id IS NOT NULL OR _btx.kind = 'api_debit'
                       THEN 'Venda de Licença (API)' ELSE 'Venda de Licença (Manual)' END;

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
  _payment_label := 'Saldo do revendedor';

  SELECT balance_cents INTO _wallet_cents FROM public.reseller_balances WHERE reseller_id = _ord.reseller_id;

  _extra := E'\n' || '🧾 Pedido (interno): <code>#' || _short_id || '</code>'
         || E'\n' || '🆔 ID completo: <code>' || _ord.id::text || '</code>'
         || E'\n' || '📦 Produto: ' || _produto
         || E'\n' || '🔑 Chave: <code>' || _ord.license_key || '</code>'
         || E'\n' || '👤 Cliente: ' || COALESCE(_ord.cust_name,'—') ||
              ' (' || COALESCE(_ord.cust_wa,'—') || ')'
         || E'\n' || '💳 Pagamento: ' || _payment_label
         || E'\n' || '💼 Saldo atual: R$ ' || to_char(COALESCE(_wallet_cents,0)::numeric/100.0, 'FM999G999G990D00')
         || E'\n' || '🛠 Origem: ' || _origin_label;

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
$function$;

CREATE OR REPLACE FUNCTION public.build_storefront_credit_sale_text(_order_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _so RECORD;
  _rcp RECORD;
  _reseller_name TEXT;
  _short_id TEXT;
  _amount_brl TEXT;
  _produto TEXT;
  _link TEXT;
  _txt TEXT;
  _wallet_cents BIGINT;
  _wallet_line TEXT := '';
BEGIN
  SELECT * INTO _so FROM public.storefront_orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = _so.reseller_id;

  SELECT * INTO _rcp FROM public.reseller_credit_purchases
    WHERE storefront_order_id = _so.id
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO _rcp FROM public.reseller_credit_purchases
      WHERE reseller_id = _so.reseller_id
        AND credits = _so.credit_amount
        AND COALESCE(customer_whatsapp,'') = COALESCE(_so.buyer_whatsapp,'')
      ORDER BY created_at DESC LIMIT 1;
  END IF;

  _short_id := COALESCE(_so.short_code, substr(_so.id::text,1,8));
  _amount_brl := 'R$ ' || to_char(COALESCE(_so.amount_cents,0)::numeric/100.0, 'FM999G999G990D00');
  _produto := COALESCE(_so.credit_amount::text,'?') || ' créditos Lovable';
  _link := CASE WHEN _rcp.provider_pedido_id IS NOT NULL
             THEN 'https://pedido.lvbcredits.com/' || _rcp.provider_pedido_id::text
             ELSE '—' END;

  IF _so.delivery_source IN ('wallet','wallet_fallback') OR COALESCE(_so.fallback_from_pack,false) THEN
    SELECT balance_cents INTO _wallet_cents FROM public.reseller_balances WHERE reseller_id = _so.reseller_id;
    _wallet_line := E'\n' || '💼 Saldo atual: R$ ' || to_char(COALESCE(_wallet_cents,0)::numeric/100.0, 'FM999G999G990D00');
  END IF;

  _txt := '🛒 <b>Venda na Loja Pública</b>' || E'\n' ||
          '👨‍💼 Revendedor: ' || COALESCE(_reseller_name, '—') || E'\n' ||
          '💵 Valor: ' || _amount_brl || E'\n' ||
          '🧾 Pedido (loja): <code>#' || _short_id || '</code>' || E'\n' ||
          '🆔 ID completo: <code>' || _so.id::text || '</code>' || E'\n' ||
          '🔗 Pedido no provedor: <code>' || COALESCE(_rcp.provider_pedido_id::text,'—') || '</code>' || E'\n' ||
          '🌐 Link do cliente: ' || _link || E'\n' ||
          '📦 Produto: ' || _produto || E'\n' ||
          '🚚 Entrega: ' || COALESCE(_so.delivery_type, _rcp.tipo_entrega, '—') || E'\n' ||
          '✉️ Conta Lovable: ' || COALESCE(_rcp.email_conta_lovable, '—') || E'\n' ||
          '🗂 Workspace: ' || COALESCE(_rcp.workspace_name, '—') || E'\n' ||
          '👤 Cliente: ' || COALESCE(_so.buyer_name,'—') ||
            ' (' || COALESCE(_so.buyer_whatsapp,'—') || ')' || E'\n' ||
          '💳 Pagamento: PIX (' || COALESCE(_so.provider,'misticpay') || ')' ||
          _wallet_line || E'\n' ||
          '🛠 Origem: Loja pública';

  RETURN _txt;
END; $function$;
