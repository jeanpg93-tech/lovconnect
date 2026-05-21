ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS short_code text;

CREATE UNIQUE INDEX IF NOT EXISTS storefront_orders_short_code_key
  ON public.storefront_orders (short_code)
  WHERE short_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_storefront_order_short_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  attempt int := 0;
  digits int := 5;
  exists_count int;
BEGIN
  IF NEW.short_code IS NOT NULL AND NEW.short_code <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    attempt := attempt + 1;
    IF attempt > 10 THEN digits := 6; END IF;
    IF attempt > 25 THEN digits := 7; END IF;
    IF attempt > 60 THEN
      RAISE EXCEPTION 'Não foi possível gerar short_code único';
    END IF;

    candidate := lpad(floor(random() * (10 ^ digits))::bigint::text, digits, '0');

    SELECT count(*) INTO exists_count
    FROM public.storefront_orders
    WHERE short_code = candidate;

    EXIT WHEN exists_count = 0;
  END LOOP;

  NEW.short_code := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_storefront_orders_short_code ON public.storefront_orders;
CREATE TRIGGER trg_storefront_orders_short_code
BEFORE INSERT ON public.storefront_orders
FOR EACH ROW
EXECUTE FUNCTION public.set_storefront_order_short_code();

UPDATE public.storefront_orders
SET short_code = lpad(floor(random() * 100000)::int::text, 5, '0')
WHERE short_code IS NULL;