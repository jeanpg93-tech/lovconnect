CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_outbox_single_sale_ref
ON public.telegram_outbox (reference_kind, reference_id)
WHERE reference_kind IS NOT NULL
  AND reference_id IS NOT NULL
  AND COALESCE(is_edit, false) = false;

CREATE OR REPLACE FUNCTION public.telegram_enqueue_ref(_text TEXT, _kind TEXT, _ref_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enabled BOOLEAN;
BEGIN
  SELECT chat_id IS NOT NULL INTO _enabled FROM public.telegram_settings WHERE id = 1;
  IF NOT _enabled THEN RETURN; END IF;

  INSERT INTO public.telegram_outbox (text, reference_kind, reference_id, is_edit)
  VALUES (_text, _kind, _ref_id, false)
  ON CONFLICT (reference_kind, reference_id)
  WHERE reference_kind IS NOT NULL
    AND reference_id IS NOT NULL
    AND COALESCE(is_edit, false) = false
  DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_telegram_pack_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings RECORD;
  _reseller_name TEXT;
  _ord RECORD;
  _so RECORD;
  _channel_label TEXT;
  _source TEXT;
  _produto TEXT;
  _short_id TEXT;
  _is_demo BOOLEAN := false;
  _extra TEXT := '';
  _label TEXT;
  _notes_json JSONB;
  _cust_name TEXT;
  _cust_wa TEXT;
  _text TEXT;
  _ref_kind TEXT;
BEGIN
  BEGIN
    IF NEW.kind <> 'sale_consume' THEN RETURN NEW; END IF;

    SELECT COALESCE(is_demo, false) INTO _is_demo
      FROM public.resellers WHERE id = NEW.reseller_id;
    IF _is_demo THEN RETURN NEW; END IF;

    SELECT * INTO _settings FROM public.telegram_settings WHERE id = 1;
    IF _settings.chat_id IS NULL OR NOT COALESCE(_settings.notify_sales, true) THEN
      RETURN NEW;
    END IF;

    SELECT display_name INTO _reseller_name FROM public.resellers WHERE id = NEW.reseller_id;

    IF NEW.order_id IS NOT NULL THEN
      SELECT * INTO _ord FROM public.orders WHERE id = NEW.order_id;
      IF FOUND THEN
        IF _ord.notes IS NOT NULL THEN
          BEGIN
            _notes_json := _ord.notes::jsonb;
            _source := _notes_json->>'source';
          EXCEPTION WHEN OTHERS THEN
            _notes_json := NULL;
            _source := NULL;
          END;
        END IF;

        IF _source IS NULL AND _ord.api_key_id IS NOT NULL THEN
          _source := 'api';
        END IF;

        _channel_label := CASE
          WHEN _source IN ('api','unified_api') THEN 'API do revendedor'
          WHEN _source = 'storefront' THEN 'Loja Pública'
          ELSE 'Manual (Painel)'
        END;

        IF _ord.customer_id IS NOT NULL THEN
          SELECT display_name, whatsapp INTO _cust_name, _cust_wa
            FROM public.reseller_customers WHERE id = _ord.customer_id;
        END IF;
        IF _notes_json IS NOT NULL THEN
          IF _cust_name IS NULL OR _cust_name = '' THEN
            _cust_name := NULLIF(_notes_json->>'display_name', '');
          END IF;
          IF _cust_wa IS NULL OR _cust_wa = '' THEN
            _cust_wa := NULLIF(_notes_json->>'whatsapp', '');
          END IF;
        END IF;

        _short_id := substr(_ord.id::text,1,8);
        _produto := 'Licença ' || COALESCE(_ord.license_type,'—');
        _extra := E'\n' || '🧾 Pedido: <code>#' || _short_id || '</code>';
        _extra := _extra || E'\n' || '🆔 ID completo: <code>' || _ord.id::text || '</code>';
        _extra := _extra || E'\n' || '📦 Produto: ' || _produto;
        IF _ord.license_key IS NOT NULL THEN
          _extra := _extra || E'\n' || '🔑 Chave: <code>' || _ord.license_key || '</code>';
        END IF;
        _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_cust_name,'—') ||
                            ' (' || COALESCE(_cust_wa,'—') || ')';
      END IF;
    END IF;

    IF NOT FOUND OR _ord.id IS NULL THEN
      IF NEW.order_id IS NOT NULL THEN
        SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.order_id;
        IF FOUND THEN
          _channel_label := 'Loja Pública';
          _short_id := COALESCE(_so.short_code, substr(_so.id::text,1,8));
          _produto := 'Licença ' || COALESCE(_so.license_type,'—');
          _extra := E'\n' || '🧾 Pedido (loja): <code>#' || _short_id || '</code>';
          _extra := _extra || E'\n' || '🆔 ID completo: <code>' || _so.id::text || '</code>';
          _extra := _extra || E'\n' || '📦 Produto: ' || _produto;
          IF _so.license_key IS NOT NULL THEN
            _extra := _extra || E'\n' || '🔑 Chave: <code>' || _so.license_key || '</code>';
          END IF;
          _extra := _extra || E'\n' || '👤 Cliente: ' || COALESCE(_so.buyer_name,'—') ||
                              ' (' || COALESCE(_so.buyer_whatsapp,'—') || ')';
        END IF;
      END IF;
    END IF;

    IF _channel_label IS NULL THEN
      _channel_label := 'Manual (Painel)';
      IF NEW.description IS NOT NULL THEN
        _extra := E'\n' || '📝 ' || NEW.description;
      END IF;
    END IF;

    _label := 'Venda paga com Pack — ' || _channel_label;
    _extra := _extra || E'\n' || '🏷 Canal: ' || _channel_label;
    _extra := _extra || E'\n' || '💳 Pagamento: Pack (1 crédito)';
    _extra := _extra || E'\n' || '📊 Pack restante: ' || NEW.balance_after::text;

    _text := '📦 <b>' || _label || '</b>' || E'\n' ||
      '👨‍💼 Revendedor: ' || COALESCE(_reseller_name, '—') ||
      _extra;

    IF NEW.order_id IS NOT NULL THEN
      _ref_kind := CASE
        WHEN _channel_label = 'Loja Pública' THEN 'storefront_license_sale'
        ELSE 'order_pack_sale'
      END;
      PERFORM public.telegram_enqueue_ref(_text, _ref_kind, NEW.order_id);
    ELSE
      PERFORM public.telegram_enqueue(_text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_telegram_pack_sale failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$$;