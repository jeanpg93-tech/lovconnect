-- Substitui a política aberta que expunha todas as colunas de resellers para anon.
DROP POLICY IF EXISTS "Publico vê revendedores ativos" ON public.resellers;

-- Remove qualquer SELECT amplo concedido a anon e restringe via column-level GRANT.
REVOKE SELECT ON public.resellers FROM anon;
GRANT SELECT (id, display_name, slug, is_active, activation_status, created_at)
  ON public.resellers TO anon;

-- Garante que authenticated continua com SELECT em todas as colunas
GRANT SELECT ON public.resellers TO authenticated;

-- Recria as políticas separando anon (colunas restritas) de authenticated (linhas ativas, todas as colunas via GRANT do role).
CREATE POLICY "Anon ve revendedores ativos (colunas restritas)"
  ON public.resellers
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Authenticated ve revendedores ativos"
  ON public.resellers
  FOR SELECT
  TO authenticated
  USING (is_active = true);