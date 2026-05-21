-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('extension-assets', 'extension-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public can view assets
CREATE POLICY "Public can view extension assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'extension-assets');

-- Resellers can upload their own assets
CREATE POLICY "Resellers can upload extension assets"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'extension-assets' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Resellers can update their own assets
CREATE POLICY "Resellers can update extension assets"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'extension-assets' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Resellers can delete their own assets
CREATE POLICY "Resellers can delete extension assets"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'extension-assets' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);