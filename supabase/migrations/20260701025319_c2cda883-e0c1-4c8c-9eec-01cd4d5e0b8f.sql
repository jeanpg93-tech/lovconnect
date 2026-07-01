-- Add 'expired' status for Claude orders whose PIX window elapsed without payment
ALTER TYPE public.claude_order_status ADD VALUE IF NOT EXISTS 'expired';