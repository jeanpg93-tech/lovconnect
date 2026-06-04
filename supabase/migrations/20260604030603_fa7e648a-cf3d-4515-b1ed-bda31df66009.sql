DO $$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_functiondef('public.trg_telegram_balance_tx()'::regprocedure) INTO _def;

  IF _def IS NULL THEN
    RAISE EXCEPTION 'Função public.trg_telegram_balance_tx() não encontrada';
  END IF;

  IF position('license_purchase and api_debit are notified by orders trigger' in _def) = 0 THEN
    _def := replace(
      _def,
      '    _kind := NEW.kind;

    IF _kind = ''referral_commission'' THEN',
      '    _kind := NEW.kind;

    -- license_purchase and api_debit are notified by orders trigger after the license key is available.
    -- The wallet debit is only an accounting event; notifying it here creates duplicate sale messages.
    IF _kind IN (''license_purchase'', ''api_debit'') THEN
      RETURN NEW;
    END IF;

    IF _kind = ''referral_commission'' THEN'
    );

    IF position('license_purchase and api_debit are notified by orders trigger' in _def) = 0 THEN
      RAISE EXCEPTION 'Não foi possível aplicar a correção automática em trg_telegram_balance_tx()';
    END IF;

    EXECUTE _def;
  END IF;
END $$;