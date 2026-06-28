import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Beaker, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ID do usuário (Jean Gomes / jeanpg.93) — conta de testes do dono do painel.
// É a ÚNICA conta autorizada pelo backend a usar o endpoint dev-release-pix.
const TEST_USER_ID = "beae9f73-5c2c-4878-bfc5-41e9e2faf15e";

type Props = {
  kind: "recharge" | "pack" | "activation" | "subscription" | "storefront";
  id: string | null | undefined;
  className?: string;
  onReleased?: () => void;
};

/**
 * Botão visível APENAS para a conta de testes (Jean Gomes).
 * Simula a confirmação do PIX no MisticPay disparando o webhook real
 * com um cabeçalho secreto de bypass — todo o fluxo (crédito, entrega
 * de pack, notificação Telegram, etc) é executado normalmente.
 */
export function DevReleasePixButton({ kind, id, className, onReleased }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!user || user.id !== TEST_USER_ID || !id) return null;

  const release = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dev-release-pix", {
        body: { kind, id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("PIX liberado (modo teste). Fluxo executado.");
      onReleased?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao liberar PIX de teste");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={release}
      disabled={loading}
      className={
        "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 " +
        (className ?? "")
      }
    >
      {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Beaker className="mr-1.5 h-3.5 w-3.5" />}
      Liberar PIX (teste)
    </Button>
  );
}

export default DevReleasePixButton;