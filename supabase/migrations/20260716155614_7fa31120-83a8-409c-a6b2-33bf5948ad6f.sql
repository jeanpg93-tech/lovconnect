
-- Tabela de tokens de confirmação single-use para exportação
CREATE TABLE public.claude_export_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at timestamptz,
  used_by uuid
);

GRANT SELECT ON public.claude_export_tokens TO authenticated;
GRANT ALL ON public.claude_export_tokens TO service_role;

ALTER TABLE public.claude_export_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gerente can view own export tokens"
  ON public.claude_export_tokens FOR SELECT
  TO authenticated
  USING (created_by = auth.uid() AND public.has_role(auth.uid(), 'gerente'));

-- Tabela de auditoria (sem segredos)
CREATE TABLE public.claude_export_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  manager_id uuid NOT NULL,
  manager_email text,
  licenses_exported integer NOT NULL DEFAULT 0,
  public_key_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.claude_export_audit TO authenticated;
GRANT ALL ON public.claude_export_audit TO service_role;

ALTER TABLE public.claude_export_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gerente can view export audit"
  ON public.claude_export_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gerente'));

CREATE INDEX idx_claude_export_tokens_hash ON public.claude_export_tokens (token_hash);
CREATE INDEX idx_claude_export_audit_manager ON public.claude_export_audit (manager_id, created_at DESC);
