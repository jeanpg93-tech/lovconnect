import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { ExtensionCustomizer } from "@/components/extension-customizer/ExtensionCustomizer";
import { Loader2 } from "lucide-react";

export default function RevendedorPersonalizarExtensao() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("resellers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setResellerId(data?.id ?? null);
        setLoading(false);
      });
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personalizar Minha Extensão"
        description="Customize cores, textos, logo e atalhos. Baixe o ZIP pronto para entregar aos seus clientes."
      />
      {resellerId ? (
        <ExtensionCustomizer scope="reseller" resellerId={resellerId} />
      ) : (
        <p className="text-sm text-muted-foreground">Revendedor não encontrado.</p>
      )}
    </div>
  );
}
