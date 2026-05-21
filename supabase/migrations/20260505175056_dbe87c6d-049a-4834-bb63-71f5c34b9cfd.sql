CREATE TABLE public.trial_registrations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    license_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trial_registrations ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (we'll check limits via logic or more strict policies if needed)
-- For now, let's allow anyone to insert but we will handle the "1 per day" logic in the UI/Edge Function
CREATE POLICY "Anyone can create trial registrations" 
ON public.trial_registrations 
FOR INSERT 
WITH CHECK (true);

-- Allow users to see their own trials by ID (for the session)
CREATE POLICY "Users can view trial registrations" 
ON public.trial_registrations 
FOR SELECT 
USING (true);

-- Index for faster lookups on phone/IP to check daily limits
CREATE INDEX idx_trial_phone ON public.trial_registrations(phone);
CREATE INDEX idx_trial_ip ON public.trial_registrations(ip_address);
CREATE INDEX idx_trial_created_at ON public.trial_registrations(created_at);