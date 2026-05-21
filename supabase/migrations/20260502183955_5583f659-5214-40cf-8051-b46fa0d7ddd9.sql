-- Storefront config table
CREATE TABLE public.reseller_storefronts (
  reseller_id UUID PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  store_name TEXT NOT NULL DEFAULT '',
  tagline TEXT,
  welcome_message TEXT,
  contact_whatsapp TEXT,
  primary_color TEXT NOT NULL DEFAULT '#7c3aed',
  logo_url TEXT,
  visible_extension_ids UUID[] NOT NULL DEFAULT '{}',
  -- key = "{extension_id}:{license_type}" -> price_cents
  custom_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_storefronts ENABLE ROW LEVEL SECURITY;

-- Public can read storefronts (for the public store page).
-- We expose all rows; the public page filters by enabled + active reseller.
CREATE POLICY "Public can view storefronts"
  ON public.reseller_storefronts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Revendedor cria sua loja"
  ON public.reseller_storefronts FOR INSERT
  TO authenticated
  WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Revendedor atualiza sua loja"
  ON public.reseller_storefronts FOR UPDATE
  TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente gerencia lojas - update"
  ON public.reseller_storefronts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE TRIGGER trg_reseller_storefronts_updated
  BEFORE UPDATE ON public.reseller_storefronts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storefront orders (public buyers)
CREATE TABLE public.storefront_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL,
  extension_id UUID,
  license_type TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_whatsapp TEXT NOT NULL,
  price_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, failed, refunded, completed
  provider TEXT NOT NULL DEFAULT 'misticpay',
  provider_transaction_id TEXT,
  qr_code_base64 TEXT,
  copy_paste TEXT,
  license_key TEXT,
  error_message TEXT,
  paid_at TIMESTAMPTZ,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.storefront_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor vê seus pedidos da loja"
  ON public.storefront_orders FOR SELECT
  TO authenticated
  USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));

CREATE POLICY "Gerente vê todos pedidos da loja"
  ON public.storefront_orders FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

-- Buyer can poll their own order by id (no auth) — we expose only by exact id from the public page;
-- to keep this tight, we don't add anon SELECT here. The public page will poll via an edge function.

CREATE TRIGGER trg_storefront_orders_updated
  BEFORE UPDATE ON public.storefront_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_storefront_orders_reseller ON public.storefront_orders(reseller_id);
CREATE INDEX idx_storefront_orders_provider_tx ON public.storefront_orders(provider_transaction_id);

-- Storage bucket for storefront logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('storefront-assets', 'storefront-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Storefront assets are public readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'storefront-assets');

CREATE POLICY "Revendedor envia assets da sua loja"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'storefront-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.resellers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Revendedor atualiza assets da sua loja"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'storefront-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.resellers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Revendedor remove assets da sua loja"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'storefront-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.resellers WHERE user_id = auth.uid()
    )
  );