import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Centraliza o que cada revendedor pode vender/visualizar.
 * Quando um método é desabilitado globalmente (ou para o revendedor),
 * todas as páginas/atalhos referentes a ele devem sumir do painel.
 */
export type EnabledMethods = {
  recharges: boolean; // Recargas avulsas (não em manutenção)
  plano3k: boolean;   // Plano 3K (recharge plans) habilitado
  flow: boolean;      // PromptFlow / MétodoFlow (entrega ativa)
  lovax: boolean;     // LovaX (entrega ativa)
  loading: boolean;
};

export function useResellerEnabledMethods(): EnabledMethods {
  const { user } = useAuth();
  const [state, setState] = useState<EnabledMethods>({
    recharges: true,
    plano3k: false,
    flow: true,
    lovax: true,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [rechargeRes, planoGlobalRes, methodRes, resellerRes] = await Promise.all([
          supabase.from("app_settings").select("value").eq("key", "recargas_settings").maybeSingle(),
          supabase.from("app_settings").select("value").eq("key", "recharge_plans_enabled_globally").maybeSingle(),
          supabase.from("app_settings").select("value").eq("key", "licencas.delivery.method").maybeSingle(),
          user?.id
            ? supabase.from("resellers").select("recharge_plans_enabled").eq("user_id", user.id).maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);
        if (cancelled) return;

        const maintenance = !!(rechargeRes.data?.value as any)?.maintenance_enabled;
        const globallyEnabled = (planoGlobalRes.data?.value as any) === true;
        const resellerEnabled = !!(resellerRes?.data as any)?.recharge_plans_enabled;
        const method = (methodRes.data?.value as any)?.method;

        setState({
          recharges: !maintenance,
          // Plano 3K só aparece se estiver habilitado globalmente.
          // O flag por revendedor é um gate adicional (precisa do global também).
          plano3k: globallyEnabled && (resellerEnabled || globallyEnabled),
          flow: method !== "lovax", // padrão = flow ativo
          lovax: method === "lovax",
          loading: false,
        });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false }));
      }
    };
    load();

    const topic = `reseller-enabled-methods-${user?.id ?? "anon"}-${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(topic);
    ch.on("postgres_changes" as any, { event: "*", schema: "public", table: "app_settings" }, load)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "resellers" }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  return state;
}