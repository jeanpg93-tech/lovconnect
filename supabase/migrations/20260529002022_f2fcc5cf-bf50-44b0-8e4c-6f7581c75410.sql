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
      END IF;

    ELSIF NEW.kind IN ('license_purchase','api_debit') THEN
      _should_send := _settings.notify_sales;
      _emoji := '🛒'; _label := CASE WHEN NEW.kind='api_debit' THEN 'Venda de Licença (API)' ELSE 'Venda de Licença' END;
      SELECT o.*, c.display_name AS cust_name, c.whatsapp AS cust_wa
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
            WHEN 'flow_1d' THEN 'FLOW 1 dia'
            WHEN 'flow_7d' THEN 'FLOW 7 dias'
            WHEN 'flow_15d' THEN 'FLOW 15 dias'
            WHEN 'flow_30d' THEN 'FLOW 30 dias'
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
        _extra := _extra || E'\n' || '🛠 Origem: ' || CASE WHEN _ord.api_key_id IS NOT NULL OR NEW.kind='api_debit' THEN 'API do revendedor' ELSE 'Manual' END;
      ELSE
        _extra := E'\n' || '📦 ' || COALESCE(NEW.description, 'Licença gerada manualmente');
        _extra := _extra || E'\n' || '💳 Pagamento: Saldo do revendedor';
        _extra := _extra || E'\n' || '🛠 Origem: ' || CASE WHEN NEW.kind='api_debit' THEN 'API do revendedor' ELSE 'Geração manual (gerente)' END;
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

    IF _promo_id IS NOT NULL AND _promo_amt > 0 AND NEW.kind IN ('order_debit','license_purchase','api_debit','credit_purchase','credit_recharge_api') THEN
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
          AND NEW.kind NOT IN ('credit_recharge_api','credit_purchase','api_debit','license_purchase','order_debit',
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