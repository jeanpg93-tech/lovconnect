-- Expandir tabela de customização para suportar marca, cores, textos e flags de funcionalidades
ALTER TABLE public.extension_customizations
  ADD COLUMN IF NOT EXISTS badge_text text DEFAULT 'PRO',
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#7C5AFF',
  ADD COLUMN IF NOT EXISTS bg_color text DEFAULT '#0A0A0B',
  ADD COLUMN IF NOT EXISTS text_color text DEFAULT '#F4F4F5',
  ADD COLUMN IF NOT EXISTS texts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS support_url text,
  ADD COLUMN IF NOT EXISTS last_build_path text,
  ADD COLUMN IF NOT EXISTS last_build_at timestamptz;

-- Bucket privado para os builds white-label gerados
INSERT INTO storage.buckets (id, name, public)
VALUES ('extension-builds', 'extension-builds', false)
ON CONFLICT (id) DO NOTHING;

-- Apenas o próprio revendedor pode ler seus builds (pasta = reseller_id)
DROP POLICY IF EXISTS "Reseller reads own builds" ON storage.objects;
CREATE POLICY "Reseller reads own builds"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'extension-builds'
  AND EXISTS (
    SELECT 1 FROM public.resellers r
    WHERE r.user_id = auth.uid()
      AND r.id::text = (storage.foldername(name))[1]
  )
);