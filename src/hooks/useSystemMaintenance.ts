import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notify } from "@/lib/notify";

export const SYSTEM_MAINTENANCE_KEY = "system.maintenance";

export type SystemMaintenance = {
  enabled: boolean;
  message: string;
  started_at?: string | null;
  started_by?: string | null;
};

export const DEFAULT_SYSTEM_MAINTENANCE_MESSAGE =
  "Sistema em manutenção. Novas emissões de licenças, recargas e vendas estão temporariamente pausadas. Você pode continuar consultando seus dados normalmente.";

const DEFAULT: SystemMaintenance = {
  enabled: false,
  message: DEFAULT_SYSTEM_MAINTENANCE_MESSAGE,
};

function normalize(raw: any): SystemMaintenance {
  if (!raw || typeof raw !== "object") return DEFAULT;
  return {
    enabled: raw.enabled === true,
    message:
      typeof raw.message === "string" && raw.message.trim()
        ? raw.message
        : DEFAULT_SYSTEM_MAINTENANCE_MESSAGE,
    started_at: raw.started_at ?? null,
    started_by: raw.started_by ?? null,
  };
}

/**
 * Hook para o modo de manutenção global do sistema.
 * Quando ativado, revendedores ficam bloqueados de emitir vendas/licenças
 * mas continuam podendo consultar seus dados.
 *
 * @param notifyOnChange se true, dispara toast + notificação nativa
 *   quando o estado mudar (usar apenas em UM ponto — o banner do layout).
 */
export function useSystemMaintenance(notifyOnChange = false) {
  const [state, setState] = useState<SystemMaintenance>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const prev = useRef<boolean | null>(null);

  const apply = useCallback(
    (next: SystemMaintenance, initial = false) => {
      setState(next);
      if (notifyOnChange && !initial && prev.current !== null && prev.current !== next.enabled) {
        if (next.enabled) {
          toast.warning("Sistema em manutenção", {
            description: next.message,
            duration: 10000,
          });
          notify("⚠️ Sistema em manutenção", next.message, { tag: "sys-maint" });
        } else {
          toast.success("Sistema reativado", {
            description: "Emissões liberadas — você já pode operar normalmente.",
          });
          notify("✅ Sistema reativado", "Emissões liberadas.", { tag: "sys-maint" });
        }
      }
      prev.current = next.enabled;
    },
    [notifyOnChange],
  );

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SYSTEM_MAINTENANCE_KEY)
      .maybeSingle();
    apply(normalize(data?.value), true);
    setLoading(false);
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SYSTEM_MAINTENANCE_KEY)
        .maybeSingle();
      if (cancelled) return;
      apply(normalize(data?.value), true);
      setLoading(false);
    })();

    const ch = supabase
      .channel(`sys-maint-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: "app_settings",
          filter: `key=eq.${SYSTEM_MAINTENANCE_KEY}`,
        },
        (payload: any) => {
          apply(normalize(payload.new?.value));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [apply]);

  const save = useCallback(async (next: SystemMaintenance) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: SYSTEM_MAINTENANCE_KEY, value: next as any },
        { onConflict: "key" },
      );
    if (!error) setState(next);
    return { error };
  }, []);

  return { ...state, loading, save, reload };
}
