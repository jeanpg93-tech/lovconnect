import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { EssentialCustomizerForm } from "@/components/extension-customizer/EssentialCustomizerForm";
import { Loader2 } from "lucide-react";

type LovaxExtension = {
  id: string;
  name: string;
  version: string;
};

export default function RevendedorPersonalizarExtensao() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [lovaxExtension, setLovaxExtension] = useState<LovaxExtension | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("resellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("extensions")
        .select("id,name,version")
        .eq("is_active", true)
        .eq("method", "lovax")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([resellerResult, extensionResult]) => {
        setResellerId(resellerResult.data?.id ?? null);
        setLovaxExtension((extensionResult.data as LovaxExtension | null) ?? null);
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
      {resellerId === "68fddcfb-5e1f-492c-be75-9a8a3d2a63fa" ? (
        <EssentialCustomizerForm
          resellerId={resellerId}
          extensionId={lovaxExtension?.id ?? null}
          extensionName={lovaxExtension?.name ?? "LovaX"}
          extensionVersion={lovaxExtension?.version ?? "5.3"}
          extensionMethod="lovax"
        />
      ) : (
        <p className="text-sm text-muted-foreground">Funcionalidade em fase de testes. Em breve disponível para todos os revendedores.</p>
      )}
    </div>
  );
}
