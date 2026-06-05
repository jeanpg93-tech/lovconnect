CREATE OR REPLACE FUNCTION public.reseller_pack_sale_whatsapp_notify()
RETURNS TRIGGER AS $$
DECLARE
  _reseller_name TEXT;
  _ord RECORD;
  _so RECORD;
  _event_key TEXT;
  _vars JSONB;
  _prazo TEXT;
  _is_demo BOOLEAN := false;
  _cliente_nome TEXT;
  _cliente_whatsapp TEXT;
  _canal TEXT;
  _source TEXT;
  _saldo_brl TEXT;
BEGIN
  -- Apenas para consumos (vendas)
  IF NEW.kind NOT IN ('consume', 'sale_consume') THEN RETURN NEW; END IF;

  SELECT COALESCE(is_demo, false) INTO _is_demo
    FROM public.resellers WHERE id = NEW.reseller_id;
  IF _is_demo THEN RETURN NEW; END IF;

  -- Busca saldo do painel para compor a mensagem
  SELECT to_char(COALESCE(balance_cents, 0)::numeric / 100.0, 'FM999G999G990D00') 
    INTO _saldo_brl 
    FROM public.reseller_balances 
    WHERE reseller_id = NEW.reseller_id;

  -- Tenta achar em orders (Manual/API) primeiro
  IF NEW.order_id IS NOT NULL THEN
    SELECT * INTO _ord FROM public.orders WHERE id = NEW.order_id;
    IF FOUND THEN
      -- Extrai dados do cliente dos metadados se não houver relação formal
      IF _ord.customer_id IS NOT NULL THEN
        SELECT display_name, whatsapp INTO _cliente_nome, _cliente_whatsapp 
          FROM public.reseller_customers WHERE id = _ord.customer_id;
      ELSE
        BEGIN
          _cliente_nome := (_ord.notes::jsonb)->>'display_name';
          _cliente_whatsapp := (_ord.notes::jsonb)->>'whatsapp';
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      -- Determina o canal
      BEGIN
        _source := (_ord.notes::jsonb)->>'source';
      EXCEPTION WHEN OTHERS THEN _source := NULL;
      END;

      _canal := CASE 
        WHEN _ord.api_key_id IS NOT NULL OR _source IN ('api','unified_api') THEN 'API de Integração'
        WHEN _source = 'storefront' THEN 'Loja Pública'
        ELSE 'Painel Revendedor'
      END;

      _prazo := CASE _ord.license_type
        WHEN 'pro_1d' THEN '1 dia'
        WHEN 'pro_7d' THEN '7 dias'
        WHEN 'pro_15d' THEN '15 dias'
        WHEN 'pro_30d' THEN '30 dias'
        WHEN 'flow_1d' THEN '1 dia'
        WHEN 'flow_7d' THEN '7 dias'
        WHEN 'flow_15d' THEN '15 dias'
        WHEN 'flow_30d' THEN '30 dias'
        WHEN 'flow_pro_1d' THEN '1 dia'
        WHEN 'flow_pro_7d' THEN '7 dias'
        WHEN 'flow_pro_30d' THEN '30 dias'
        WHEN 'lifetime' THEN 'Vitalício'
        WHEN 'flow_lifetime' THEN 'Vitalício'
        WHEN 'trial' THEN 'Trial'
        ELSE COALESCE(_ord.license_type,'—')
      END;

      _vars := jsonb_build_object(
        'pedido_id', substr(_ord.id::text, 1, 8),
        'cliente_nome', COALESCE(_cliente_nome, '—'),
        'cliente_whatsapp', COALESCE(_cliente_whatsapp, '—'),
        'prazo', _prazo,
        'canal', _canal,
        'licenca', COALESCE(_ord.license_key, '—'),
        'licencas_restantes', NEW.balance_after::text,
        'restantes', NEW.balance_after::text,
        'saldo', COALESCE(_saldo_brl, '0,00')
      );
      
      PERFORM public.dispatch_system_whatsapp_event('reseller_sale_pack', NEW.reseller_id, _vars);
      RETURN NEW;
    END IF;
  END IF;

  -- Se não achou em orders, tenta storefront_orders
  IF NEW.order_id IS NOT NULL THEN
    SELECT * INTO _so FROM public.storefront_orders WHERE id = NEW.order_id;
    IF FOUND THEN
      _prazo := CASE _so.license_type
        WHEN 'pro_1d' THEN '1 dia'
        WHEN 'pro_7d' THEN '7 dias'
        WHEN 'pro_30d' THEN '30 dias'
        WHEN 'flow_1d' THEN '1 dia'
        WHEN 'flow_7d' THEN '7 dias'
        WHEN 'flow_30d' THEN '30 dias'
        WHEN 'lifetime' THEN 'Vitalício'
        WHEN 'flow_lifetime' THEN 'Vitalício'
        ELSE COALESCE(_so.license_type,'—')
      END;

      _vars := jsonb_build_object(
        'pedido_id', COALESCE(_so.short_code, substr(_so.id::text, 1, 8)),
        'cliente_nome', COALESCE(_so.buyer_name, '—'),
        'cliente_whatsapp', COALESCE(_so.buyer_whatsapp, '—'),
        'prazo', _prazo,
        'canal', 'Loja Pública',
        'licenca', COALESCE(_so.license_key, '—'),
        'licencas_restantes', NEW.balance_after::text,
        'restantes', NEW.balance_after::text,
        'saldo', COALESCE(_saldo_brl, '0,00')
      );
      
      PERFORM public.dispatch_system_whatsapp_event('reseller_sale_pack', NEW.reseller_id, _vars);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
