-- Revoga colunas de flags internas do público (anon) na tabela resellers
REVOKE SELECT (claude_enabled, recharge_plans_enabled) ON public.resellers FROM anon;