
-- 1) telegram_outbox: suporte a referência e edição de mensagens
ALTER TABLE public.telegram_outbox
  ADD COLUMN IF NOT EXISTS reference_kind TEXT,
  ADD COLUMN IF NOT EXISTS reference_id   UUID,
  ADD COLUMN IF NOT EXISTS message_id     BIGINT,
  ADD COLUMN IF NOT EXISTS edit_message_id BIGINT,
  ADD COLUMN IF NOT EXISTS is_edit        BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_outbox_ref ON public.telegram_outbox(reference_kind, reference_id, message_id);

-- 2) reseller_credit_purchases: link direto para storefront_orders + flags de alerta (idempotência)
ALTER TABLE public.reseller_credit_purchases
  ADD COLUMN IF NOT EXISTS storefront_order_id UUID,
  ADD COLUMN IF NOT EXISTS alert_permissao_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alert_stuck_configurando_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_rcp_storefront ON public.reseller_credit_purchases(storefront_order_id);

-- 3) Helper: enqueue normal com referência
CREATE OR REPLACE FUNCTION public.telegram_enqueue_ref(_text TEXT, _kind TEXT, _ref_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _enabled BOOLEAN;
BEGIN
  SELECT chat_id IS NOT NULL INTO _enabled FROM public.telegram_settings WHERE id = 1;
  IF NOT _enabled THEN RETURN; END IF;
  INSERT INTO public.telegram_outbox (text, reference_kind, reference_id)
    VALUES (_text, _kind, _ref_id);
END; $$;

-- 4) Helper: enfileira EDIÇÃO da última mensagem que tem esta referência
CREATE OR REPLACE FUNCTION public.telegram_enqueue_edit(_text TEXT, _kind TEXT, _ref_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _enabled BOOLEAN;
  _mid BIGINT;
BEGIN
  SELECT chat_id IS NOT NULL INTO _enabled FROM public.telegram_settings WHERE id = 1;
  IF NOT _enabled THEN RETURN; END IF;

  SELECT message_id INTO _mid
    FROM public.telegram_outbox
   WHERE reference_kind = _kind
     AND reference_id   = _ref_id
     AND message_id IS NOT NULL
     AND is_edit = false
   ORDER BY created_at DESC LIMIT 1;

  IF _mid IS NULL THEN
    -- ainda não foi enviada — enfileira como nova mensagem
    INSERT INTO public.telegram_outbox (text, reference_kind, reference_id)
      VALUES (_text, _kind, _ref_id);
    RETURN;
  END IF;

  INSERT INTO public.telegram_outbox (text, reference_kind, reference_id, edit_message_id, is_edit)
    VALUES (_text, _kind, _ref_id, _mid, true);
END; $$;

-- 5) Builder REUTILIZÁVEL para o texto da venda da Loja Pública (créditos)
CREATE OR REPLACE FUNCTION public.build_storefront_credit_sale_text(_order_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _so RECORD;
  _rcp RECORD;
  _reseller_name TEXT;
  _short_id TEXT;
  _amount_brl TEXT;
  _produto TEXT;
  _link TEXT;
  _txt TEXT;
BEGIN
  SELECT * INTO _so FROM public.storefront_orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = _so.reseller_id;

  -- prioriza link explícito; cai no heurístico se ainda não preenchido
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
          '💳 Pagamento: PIX (' || COALESCE(_so.provider,'misticpay') || ')' || E'\n' ||
          '🛠 Origem: Loja pública';

  RETURN _txt;
END; $$;

-- 6) Atualiza o trigger de venda (debit_reseller_balance) para:
--    a) incluir Link do cliente em compras de crédito com provider conhecido
--    b) usar telegram_enqueue_ref para a venda da Loja Pública (assim podemos editar depois)
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
  _short_id TEXT;
  _full_id TEXT;
  _produto TEXT;
  _link TEXT;
  _sf_text TEXT;
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
      SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.reference_id;
      IF FOUND THEN
        IF _so.product_type = 'credits' OR _so.credit_amount IS NOT NULL THEN
          -- Caso CRÉDITOS na Loja Pública: enfileira com referência para podermos EDITAR depois
          _sf_text := public.build_storefront_credit_sale_text(_so.id);
          IF _sf_text IS NOT NULL AND _should_send THEN
            PERFORM public.telegram_enqueue_ref(_sf_text, 'storefront_credit_sale', _so.id);
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
      END IF;

    ELSIF NEW.kind = 'credit_recharge_api' THEN
      _should_send := _settings.notify_sales;
      _emoji := '🛒'; _label := 'Venda de Créditos (API)';
      SELECT * INTO _rcp FROM public.reseller_credit_purchases WHERE id = NEW.reference_id;
      IF FOUND THEN
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
    RAISE WARNING 'trg_telegram_balance_tx failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;

-- 7) Trigger: quando reseller_credit_purchases mudar e for vinculada a uma storefront_order,
--    re-renderiza a mensagem da venda e ENFILEIRA uma EDIÇÃO.
CREATE OR REPLACE FUNCTION public.trg_telegram_storefront_sale_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _so_id UUID;
  _txt TEXT;
  _changed BOOLEAN := false;
BEGIN
  BEGIN
    _so_id := NEW.storefront_order_id;
    IF _so_id IS NULL THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
      _changed := true;
    ELSE
      IF COALESCE(OLD.provider_pedido_id::text,'') IS DISTINCT FROM COALESCE(NEW.provider_pedido_id::text,'')
         OR COALESCE(OLD.workspace_name,'') IS DISTINCT FROM COALESCE(NEW.workspace_name,'')
         OR COALESCE(OLD.email_conta_lovable,'') IS DISTINCT FROM COALESCE(NEW.email_conta_lovable,'')
         OR COALESCE(OLD.tipo_entrega,'') IS DISTINCT FROM COALESCE(NEW.tipo_entrega,'') THEN
        _changed := true;
      END IF;
    END IF;
    IF NOT _changed THEN RETURN NEW; END IF;

    _txt := public.build_storefront_credit_sale_text(_so_id);
    IF _txt IS NULL THEN RETURN NEW; END IF;

    PERFORM public.telegram_enqueue_edit(_txt, 'storefront_credit_sale', _so_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_telegram_storefront_sale_edit failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_telegram_storefront_sale_edit_ins ON public.reseller_credit_purchases;
CREATE TRIGGER trg_telegram_storefront_sale_edit_ins
AFTER INSERT ON public.reseller_credit_purchases
FOR EACH ROW EXECUTE FUNCTION public.trg_telegram_storefront_sale_edit();

DROP TRIGGER IF EXISTS trg_telegram_storefront_sale_edit_upd ON public.reseller_credit_purchases;
CREATE TRIGGER trg_telegram_storefront_sale_edit_upd
AFTER UPDATE OF provider_pedido_id, workspace_name, email_conta_lovable, tipo_entrega
ON public.reseller_credit_purchases
FOR EACH ROW EXECUTE FUNCTION public.trg_telegram_storefront_sale_edit();

-- 8) Alerta no Telegram quando o pedido travar por permissao_incorreta
--    Disparado pela função purchase-stuck-watch (cron) atualizando provider_response.
CREATE OR REPLACE FUNCTION public.notify_purchase_permission_alert(_purchase_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rcp RECORD;
  _reseller_name TEXT;
  _link TEXT;
  _settings RECORD;
BEGIN
  SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
  IF _settings.chat_id IS NULL THEN RETURN; END IF;

  SELECT * INTO _rcp FROM public.reseller_credit_purchases
    WHERE id = _purchase_id AND alert_permissao_sent_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = _rcp.reseller_id;
  _link := CASE WHEN _rcp.provider_pedido_id IS NOT NULL
             THEN 'https://pedido.lvbcredits.com/' || _rcp.provider_pedido_id::text
             ELSE '—' END;

  PERFORM public.telegram_enqueue(
    '⚠️ <b>Pedido travado — permissão de admin faltando</b>' || E'\n' ||
    '👨‍💼 Revendedor: ' || COALESCE(_reseller_name,'—') || E'\n' ||
    '👤 Cliente: ' || COALESCE(_rcp.customer_name,'—') ||
      ' (' || COALESCE(_rcp.customer_whatsapp,'—') || ')' || E'\n' ||
    '📦 ' || COALESCE(_rcp.credits::text,'?') || ' créditos Lovable' || E'\n' ||
    '🗂 Workspace: ' || COALESCE(_rcp.workspace_name,'—') || E'\n' ||
    '🆔 ID: <code>' || _rcp.id::text || '</code>' || E'\n' ||
    '🔗 Provedor: <code>' || COALESCE(_rcp.provider_pedido_id::text,'—') || '</code>' || E'\n' ||
    '🌐 Link do cliente: ' || _link || E'\n' ||
    '👉 O cliente convidou o bot mas <b>não deu permissão de admin</b>. Ele precisa reconvidar como admin.'
  );

  UPDATE public.reseller_credit_purchases
    SET alert_permissao_sent_at = now()
    WHERE id = _purchase_id;
END; $$;

-- 9) Alerta no Telegram quando pedido ficar muito tempo em "configurando"
CREATE OR REPLACE FUNCTION public.notify_purchase_stuck_alert(_purchase_id UUID, _hours INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rcp RECORD;
  _reseller_name TEXT;
  _link TEXT;
  _settings RECORD;
BEGIN
  SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
  IF _settings.chat_id IS NULL THEN RETURN; END IF;

  SELECT * INTO _rcp FROM public.reseller_credit_purchases
    WHERE id = _purchase_id AND alert_stuck_configurando_sent_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = _rcp.reseller_id;
  _link := CASE WHEN _rcp.provider_pedido_id IS NOT NULL
             THEN 'https://pedido.lvbcredits.com/' || _rcp.provider_pedido_id::text
             ELSE '—' END;

  PERFORM public.telegram_enqueue(
    '🕒 <b>Pedido parado há mais de ' || _hours || 'h</b>' || E'\n' ||
    '👨‍💼 Revendedor: ' || COALESCE(_reseller_name,'—') || E'\n' ||
    '👤 Cliente: ' || COALESCE(_rcp.customer_name,'—') ||
      ' (' || COALESCE(_rcp.customer_whatsapp,'—') || ')' || E'\n' ||
    '📦 ' || COALESCE(_rcp.credits::text,'?') || ' créditos Lovable' || E'\n' ||
    '⚙️ Status: configurando (aguardando cliente vincular bot)' || E'\n' ||
    '🆔 ID: <code>' || _rcp.id::text || '</code>' || E'\n' ||
    '🔗 Provedor: <code>' || COALESCE(_rcp.provider_pedido_id::text,'—') || '</code>' || E'\n' ||
    '🌐 Link do cliente: ' || _link
  );

  UPDATE public.reseller_credit_purchases
    SET alert_stuck_configurando_sent_at = now()
    WHERE id = _purchase_id;
END; $$;

-- 10) Scanner usado pelo cron: notifica pedidos travados em "configurando" há > 2h
CREATE OR REPLACE FUNCTION public.scan_stuck_configurando_purchases()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row RECORD;
BEGIN
  FOR _row IN
    SELECT id
      FROM public.reseller_credit_purchases
     WHERE status = 'configurando'
       AND alert_stuck_configurando_sent_at IS NULL
       AND created_at < now() - interval '2 hours'
     LIMIT 50
  LOOP
    PERFORM public.notify_purchase_stuck_alert(_row.id, 2);
  END LOOP;
END; $$;
