import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DeliveryMode = "automatico" | "manual";

export type RechargeSettings = {
  active_mode: DeliveryMode;
  maintenance_enabled: boolean;
  maintenance_message: string;
};

export const DEFAULT_RECHARGE_SETTINGS: RechargeSettings = {
  active_mode: "automatico",
  maintenance_enabled: false,
  maintenance_message:
    "Estamos em manutenção. Novas recarga estarão disponíveis em breve.",
};

const KEY = "recarga_settings";

function normalize(raw: any): RechargeSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_RECHARGE_SETTINGS;
  // Backward compat: previous shape had automatico_enabled / manual_enabled
  let active_mode: DeliveryMode = "automatico";
  if (raw.active_mode === "manual" || raw.active_mode === "automatico") {
    active_mode = raw.active_mode;
  } else if (raw.manual_enabled && !raw.automatico_enabled) {
    active_mode = "manual";
  }
  return {
    active_mode,
    maintenance_enabled: !!raw.maintenance_enabled,
    maintenance_message:
      typeof raw.maintenance_message === "string" && raw.maintenance_message
        ? raw.maintenance_message
        : DEFAULT_RECHARGE_SETTINGS.maintenance_message,
  };
}

export function useRechargeSettings() {
  const [settings, setSettings] = useState<RechargeSettings>(DEFAULT_RECHARGE_SETTINGS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    setSettings(normalize(data?.value));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const save = useCallback(async (next: RechargeSettings) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: KEY, value: next as any }, { onConflict: "key" });
    if (!error) setSettings(next);
    return { error };
  }, []);

  return { settings, loading, save, reload };
}
