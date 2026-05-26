
CREATE OR REPLACE FUNCTION public.notify_purchase_permission_alert(_purchase_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rcp RECORD;
  _reseller_name TEXT;
  _link TEXT;
  _settings RECORD;
  _when TEXT;
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
  _when := to_char(_rcp.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');

  PERFORM public.telegram_enqueue(
    '⚠️ <b>Pedido travado — permissão de admin faltando</b>' || E'\n' ||
    '🗓 Venda: ' || _when || E'\n' ||
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

CREATE OR REPLACE FUNCTION public.notify_purchase_stuck_alert(_purchase_id UUID, _hours INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _rcp RECORD;
  _reseller_name TEXT;
  _link TEXT;
  _settings RECORD;
  _when TEXT;
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
  _when := to_char(_rcp.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');

  PERFORM public.telegram_enqueue(
    '🕒 <b>Pedido parado há mais de ' || _hours || 'h</b>' || E'\n' ||
    '🗓 Venda: ' || _when || E'\n' ||
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
