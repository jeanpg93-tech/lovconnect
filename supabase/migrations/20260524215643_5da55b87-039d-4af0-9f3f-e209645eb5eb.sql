
-- 1) Enriquecer notificação de novo cadastro com nome do indicador
CREATE OR REPLACE FUNCTION public.trg_telegram_new_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _on boolean;
  _ref_name text;
  _ref_code text;
BEGIN
  SELECT notify_signups INTO _on FROM public.telegram_settings WHERE id = 1;
  IF NOT COALESCE(_on, false) THEN RETURN NEW; END IF;
  IF NEW.approval_status <> 'pending' THEN RETURN NEW; END IF;

  _ref_code := NEW.affiliate_code_used;
  IF _ref_code IS NOT NULL THEN
    SELECT COALESCE(p.display_name, r.display_name, ac.label)
      INTO _ref_name
      FROM public.affiliate_codes ac
      LEFT JOIN public.resellers r ON r.id = ac.owner_reseller_id
      LEFT JOIN public.profiles p ON p.id = r.user_id
      WHERE upper(ac.code) = upper(_ref_code)
      LIMIT 1;
  END IF;

  PERFORM public.telegram_enqueue(
    '🆕 <b>Novo cadastro pendente</b>' || E'\n' ||
    '👤 Nome: ' || COALESCE(NEW.display_name, '—') || E'\n' ||
    '✉️ Email: ' || COALESCE(NEW.email, '—') || E'\n' ||
    '📱 WhatsApp: ' || COALESCE(NEW.whatsapp, '—') || E'\n' ||
    '🎟 Código: ' || COALESCE(_ref_code, '—') ||
    CASE WHEN _ref_name IS NOT NULL
      THEN E'\n' || '🤝 Indicado por: ' || _ref_name
      ELSE '' END
  );
  RETURN NEW;
END;
$function$;

-- 2) Caso explícito para "referral_commission" no trigger de transações
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
  _referred_name TEXT;
BEGIN
  SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
  IF _settings.chat_id IS NULL THEN RETURN NEW; END IF;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = NEW.reseller_id;
  _amount_brl := 'R$ ' || to_char(ABS(NEW.amount_cents)::numeric / 100.0, 'FM999G999G990D00');

  IF NEW.kind = 'referral_commission' THEN
    _should_send := COALESCE(_settings.notify_recharges, true);
    _emoji := '🎁'; _label := 'Comissão de indicação recebida';
    -- referência é a recharge_intent que originou a comissão
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

  ELSIF NEW.kind = 'license_purchase_refund' THEN
    _should_send := _settings.notify_refunds;
    _emoji := '↩️'; _label := 'Estorno de Licença';
    SELECT o.*, rc.display_name AS cust_name, rc.whatsapp AS cust_wa
      INTO _ord
      FROM public.orders o
      LEFT JOIN public.reseller_customers rc ON rc.id = o.customer_id
      WHERE o.id = NEW.reference_id;
    IF FOUND THEN
      _extra := E'\n' || '🧾 Venda original: <code>#' || substr(_ord.id::text,1,8) || '</code>';
      _extra := _extra || E'\n' || '📅 Data da venda: ' || to_char(_ord.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
      _extra := _extra || E'\n' || '📦 Produto: Licença ' || COALESCE(_ord.license_type,'—');
      IF _ord.license_key IS NOT NULL THEN
        _extra := _extra || E'\n' || '🔑 Chave: <code>' || _ord.license_key || '</code>';
      END IF;
      IF _ord.cust_name IS NOT NULL OR _ord.cust_wa IS NOT NULL THEN
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_ord.cust_name,'—') ||
                            ' (' || COALESCE(_ord.cust_wa,'—') || ')';
      END IF;
    ELSE
      SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.reference_id;
      IF FOUND THEN
        _extra := E'\n' || '🧾 Venda original: <code>#' || COALESCE(_so.short_code, substr(_so.id::text,1,8)) || '</code>';
        _extra := _extra || E'\n' || '📅 Data da venda: ' || to_char(_so.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
        _extra := _extra || E'\n' || '📦 Produto: Licença ' || COALESCE(_so.license_type,'—');
        IF _so.license_key IS NOT NULL THEN
          _extra := _extra || E'\n' || '🔑 Chave: <code>' || _so.license_key || '</code>';
        END IF;
        IF _so.buyer_name IS NOT NULL THEN
          _extra := _extra || E'\n' || '👤 Cliente: ' || _so.buyer_name ||
                              ' (' || COALESCE(_so.buyer_whatsapp,'—') || ')';
        END IF;
      END IF;
    END IF;

  ELSIF NEW.kind = 'credit_purchase_refund' THEN
    _should_send := _settings.notify_refunds;
    _emoji := '↩️'; _label := 'Estorno de Créditos Lovable';
    SELECT * INTO _rcp FROM public.reseller_credit_purchases WHERE id = NEW.reference_id;
    IF FOUND THEN
      _extra := E'\n' || '🧾 Venda original: <code>#' || substr(_rcp.id::text,1,8) || '</code>';
      _extra := _extra || E'\n' || '📅 Data da venda: ' || to_char(_rcp.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
      _extra := _extra || E'\n' || '📦 Produto: ' || _rcp.credits || ' créditos Lovable';
      IF _rcp.customer_name IS NOT NULL OR _rcp.customer_whatsapp IS NOT NULL THEN
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_rcp.customer_name,'—') ||
                            ' (' || COALESCE(_rcp.customer_whatsapp,'—') || ')';
      END IF;
    END IF;

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
      CASE WHEN NEW.description IS NOT NULL AND NEW.description <> ''
        AND NEW.kind NOT IN ('credit_recharge_api','license_purchase_refund','credit_purchase_refund','referral_commission')
        THEN E'\n' || '📝 ' || NEW.description ELSE '' END
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Trigger para notificar pagamento de ativação do revendedor
CREATE OR REPLACE FUNCTION public.trg_telegram_activation_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _settings RECORD;
  _reseller RECORD;
  _ref_name TEXT;
  _amount_brl TEXT;
  _extra TEXT := '';
BEGIN
  SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
  IF _settings.chat_id IS NULL THEN RETURN NEW; END IF;
  IF NOT COALESCE(_settings.notify_signups, true) THEN RETURN NEW; END IF;

  -- dispara apenas na transição para activated_at (pagamento confirmado / ativação)
  IF NEW.activated_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.activated_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT r.id, r.display_name, r.slug, p.email, p.whatsapp
    INTO _reseller
    FROM public.resellers r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.id = NEW.reseller_id;

  SELECT COALESCE(pr.display_name, rr.display_name)
    INTO _ref_name
    FROM public.reseller_referrals rf
    LEFT JOIN public.resellers rr ON rr.id = rf.referrer_reseller_id
    LEFT JOIN public.profiles pr ON pr.id = rr.user_id
    WHERE rf.referred_reseller_id = NEW.reseller_id
    LIMIT 1;

  _amount_brl := 'R$ ' || to_char(NEW.amount_cents::numeric / 100.0, 'FM999G990D00');

  _extra := E'\n' || '👨‍💼 Revendedor: ' || COALESCE(_reseller.display_name, '—');
  IF _reseller.email IS NOT NULL THEN
    _extra := _extra || E'\n' || '✉️ Email: ' || _reseller.email;
  END IF;
  IF _reseller.whatsapp IS NOT NULL THEN
    _extra := _extra || E'\n' || '📱 WhatsApp: ' || _reseller.whatsapp;
  END IF;
  _extra := _extra || E'\n' || '💵 Valor pago: ' || _amount_brl;
  _extra := _extra || E'\n' || '💳 Via: PIX (' || COALESCE(NEW.provider,'misticpay') || ')';
  IF _ref_name IS NOT NULL THEN
    _extra := _extra || E'\n' || '🤝 Indicado por: ' || _ref_name;
  END IF;

  PERFORM public.telegram_enqueue(
    '✅ <b>Revendedor ativou o painel</b>' || _extra
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS telegram_activation_paid ON public.activation_payments;
CREATE TRIGGER telegram_activation_paid
AFTER INSERT OR UPDATE OF activated_at ON public.activation_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_telegram_activation_paid();
