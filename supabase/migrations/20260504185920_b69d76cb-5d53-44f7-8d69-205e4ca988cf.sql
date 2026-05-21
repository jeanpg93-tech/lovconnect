-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create extension_customizations table
CREATE TABLE public.extension_customizations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
    extension_id UUID NOT NULL REFERENCES public.extensions(id) ON DELETE CASCADE,
    display_name TEXT,
    primary_color TEXT DEFAULT '#7C3AED',
    secondary_color TEXT DEFAULT '#F9FAFB',
    logo_url TEXT,
    favicon_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(reseller_id, extension_id)
);

-- Enable RLS
ALTER TABLE public.extension_customizations ENABLE ROW LEVEL SECURITY;

-- Policies for resellers
CREATE POLICY "Resellers can view their own extension customizations"
ON public.extension_customizations
FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.resellers r
    WHERE r.id = extension_customizations.reseller_id
    AND r.user_id = auth.uid()
));

CREATE POLICY "Resellers can insert their own extension customizations"
ON public.extension_customizations
FOR INSERT
WITH CHECK (EXISTS (
    SELECT 1 FROM public.resellers r
    WHERE r.id = extension_customizations.reseller_id
    AND r.user_id = auth.uid()
));

CREATE POLICY "Resellers can update their own extension customizations"
ON public.extension_customizations
FOR UPDATE
USING (EXISTS (
    SELECT 1 FROM public.resellers r
    WHERE r.id = extension_customizations.reseller_id
    AND r.user_id = auth.uid()
));

-- Policy for public access (to be used in storefronts)
CREATE POLICY "Public can view extension customizations"
ON public.extension_customizations
FOR SELECT
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_extension_customizations_updated_at
BEFORE UPDATE ON public.extension_customizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();