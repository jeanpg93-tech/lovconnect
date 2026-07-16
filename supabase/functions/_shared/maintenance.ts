// Shared helper: block reseller emission endpoints while system.maintenance is enabled.
// Any function that creates a sale / license / key on behalf of a reseller should call
// `assertNotInMaintenance(supabase)` at the top (after auth), and return the resulting
// Response if truthy.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_MSG =
  "Sistema em manutenção. Novas emissões estão temporariamente pausadas. Consultas ao painel continuam disponíveis.";

export async function isSystemInMaintenance(
  supabase: SupabaseClient,
): Promise<{ enabled: boolean; message: string }> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "system.maintenance")
      .maybeSingle();
    const v: any = data?.value ?? null;
    const enabled = v?.enabled === true;
    const message =
      typeof v?.message === "string" && v.message.trim() ? v.message : DEFAULT_MSG;
    return { enabled, message };
  } catch {
    return { enabled: false, message: DEFAULT_MSG };
  }
}

/**
 * Returns a Response (503) if system is in maintenance, otherwise null.
 * Pass CORS headers so the client can read the body.
 */
export async function maintenanceGuard(
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const { enabled, message } = await isSystemInMaintenance(supabase);
  if (!enabled) return null;
  return new Response(
    JSON.stringify({ error: "maintenance", message, code: "SYSTEM_MAINTENANCE" }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}