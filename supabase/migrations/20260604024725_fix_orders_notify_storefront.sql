-- Corrige detecção de vendas da Loja Pública no trigger de notificação:
-- agora storefront grava notes em JSON ({"source":"storefront",...}) e a
-- checagem antiga por "Venda da Loja" falhava, gerando notificação duplicada.
CREATE OR REPLACE FUNCTION public.trg_orders_notify_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_storefront BOOLEAN := false;
  _is_subscription BOOLEAN := false;
  _is_demo BOOLEAN := false;
BEGIN
  BEGIN
    SELECT COALESCE(is_demo, false) INTO _is_demo
      FROM public.resellers WHERE id = NEW.reseller_id;
    IF _is_demo THEN RETURN NEW; END IF;

    IF NEW.notes IS NOT NULL THEN
      IF position('Venda da Loja' in NEW.notes) > 0
         OR position('"source":"storefront"' in NEW.notes) > 0 THEN
        _is_storefront := true;
      END IF;
      IF position('"billing_mode":"subscription"' in NEW.notes) > 0 THEN
        _is_subscription := true;
      END IF;
    END IF;

    IF NEW.status = 'completed'
       AND NEW.license_key IS NOT NULL
       AND NEW.telegram_sale_notified_at IS NULL
       AND COALESCE(NEW.is_test, false) = false
       AND NOT _is_storefront
       AND NOT _is_subscription
       AND (TG_OP = 'INSERT'
            OR OLD.license_key IS DISTINCT FROM NEW.license_key
            OR OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM public.notify_license_order_sale(NEW.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_orders_notify_sale failed (non-fatal): % / %', SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END;
$function$;
