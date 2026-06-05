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
BEGIN
  -- Apenas para consumos (vendas)
  IF NEW.kind NOT IN ('consume', 'sale_consume') THEN RETURN NEW; END IF;

  SELECT COALESCE(is_demo, false) INTO _is_demo
    FROM public.resellers WHERE id = NEW.reseller_id;
  IF _is_demo THEN RETURN NEW; END IF;

  -- Tenta achar em orders (Manual/API) primeiro
  IF NEW.order_id IS NOT NULL THEN
    SELECT * INTO _ord FROM public.orders WHERE id = NEW.order_id;
    IF FOUND THEN
      _event_key := CASE 
        WHEN (_ord.notes::jsonb)->>'source' IN ('api','unified_api') THEN 'reseller_sale_api'
        ELSE 'reseller_sale_manual'
      END;
      
      -- Sobrescreve para sale_pack se for consumo de pack
      _event_key := 'reseller_sale_pack';

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
        'cliente_nome', COALESCE((SELECT display_name FROM public.reseller_customers WHERE id = _ord.customer_id), '—'),
        'cliente_whatsapp', COALESCE((SELECT whatsapp FROM public.reseller_customers WHERE id = _ord.customer_id), '—'),
        'prazo', _prazo,
        'licenca', COALESCE(_ord.license_key, '—'),
        'restantes', NEW.balance_after::text
      );
      
      PERFORM public.dispatch_system_whatsapp_event(_event_key, NEW.reseller_id, _vars);
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
        'licenca', COALESCE(_so.license_key, '—'),
        'restantes', NEW.balance_after::text
      );
      
      PERFORM public.dispatch_system_whatsapp_event('reseller_sale_pack', NEW.reseller_id, _vars);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Adiciona o trigger à tabela reseller_pack_ledger
DROP TRIGGER IF EXISTS trg_reseller_pack_sale_whatsapp ON public.reseller_pack_ledger;
CREATE TRIGGER trg_reseller_pack_sale_whatsapp
AFTER INSERT ON public.reseller_pack_ledger
FOR EACH ROW EXECUTE FUNCTION public.reseller_pack_sale_whatsapp_notify();
