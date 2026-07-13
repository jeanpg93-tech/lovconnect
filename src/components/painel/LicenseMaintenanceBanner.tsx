import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { notify } from "@/lib/notify";

const KEY = "licencas.delivery.maintenance";

/**
 * Mostra um banner para o revendedor quando o gerente ativa o modo manutenção
 * da entrega de licenças (extensão). Também dispara toast + notificação nativa
 * na transição off→on em tempo real.
 */
export function LicenseMaintenanceBanner() {
  const [enabled, setEnabled] = useState(false);
  const prev = useRef<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const apply = (val: boolean, initial = false) => {
      if (cancelled) return;
      setEnabled(val);
      if (!initial && prev.current !== null && prev.current !== val) {
        if (val) {
          toast.warning("Entrega de licenças em manutenção", {
            description:
              "O gerente pausou a geração de novas chaves. Aguarde a reativação.",
            duration: 8000,
          });
          notify(
            "⚠️ Entrega de licenças em manutenção",
            "Novas chaves estão temporariamente pausadas.",
            { tag: "lic-maint" },
          );
        } else {
          toast.success("Entrega de licenças reativada", {
            description: "Você já pode gerar novas chaves normalmente.",
          });
          notify("✅ Entrega de licenças reativada", "Já pode gerar chaves novamente.", {
            tag: "lic-maint",
          });
        }
      }
      prev.current = val;
    };

    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      apply((data?.value as any)?.enabled === true, true);
    })();

    const ch = supabase
      .channel(`lic-maint-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "app_settings", filter: `key=eq.${KEY}` },
        (payload: any) => {
          const val = (payload.new?.value as any)?.enabled === true;
          apply(val);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-amber-500 uppercase tracking-wider">
          Entrega de licenças em manutenção
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          O gerente pausou temporariamente a geração de novas chaves de extensão.
          Tente novamente em alguns minutos — chaves já entregues continuam funcionando normalmente.
        </p>
      </div>
    </div>
  );
}

export default LicenseMaintenanceBanner;