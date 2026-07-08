// Revoga em massa chaves teste geradas em um ataque, chamando o Lovax.
// Requer role 'gerente'. Uso único; pode ser removido depois.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;
    const { data: roleRow } = await svc
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "gerente").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const reseller_id = String(body.reseller_id ?? "");
    const since_iso = String(body.since_iso ?? "");
    const dry_run = body.dry_run === true;
    const limit = Math.min(2000, Number(body.limit ?? 2000));
    if (!reseller_id || !since_iso) return json({ error: "reseller_id e since_iso obrigatórios" }, 400);

    // Carrega credenciais Lovax
    const { data: settings } = await svc.from("app_settings")
      .select("key,value").in("key", ["lovax_api_token", "lovax_base_url"]);
    const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
    const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined)
      || "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";
    if (!tk) return json({ error: "Lovax não configurado" }, 500);

    // Lista chaves alvo
    const { data: rows, error: qErr } = await svc.from("orders")
      .select("id, license_key")
      .eq("reseller_id", reseller_id)
      .eq("is_test", true)
      .eq("status", "completed")
      .gte("created_at", since_iso)
      .not("license_key", "is", null)
      .limit(limit);
    if (qErr) return json({ error: qErr.message }, 500);

    const targets = (rows ?? []).filter((r: any) => r.license_key);
    if (dry_run) return json({ dry_run: true, would_revoke: targets.length });

    let revoked = 0, failed = 0;
    const failures: any[] = [];
    for (const r of targets) {
      try {
        const resp = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete_license", payload: { license_key: r.license_key } }),
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data?.success) {
          revoked++;
          await svc.from("orders")
            .update({ status: "revoked", error_message: "attack_burst_revoked" })
            .eq("id", r.id);
        } else {
          failed++;
          if (failures.length < 20) failures.push({ id: r.id, key: r.license_key, err: data?.error ?? resp.status });
          // marca como revogada mesmo assim se provedor disser "não encontrada"
          const errStr = String(data?.error ?? "").toLowerCase();
          if (errStr.includes("not found") || errStr.includes("nao encontrad") || errStr.includes("não encontrad")) {
            await svc.from("orders")
              .update({ status: "revoked", error_message: "attack_burst_not_found" })
              .eq("id", r.id);
          }
        }
      } catch (e) {
        failed++;
        if (failures.length < 20) failures.push({ id: r.id, err: (e as Error).message });
      }
      // pequeno delay para não estourar rate do provedor
      await new Promise((res) => setTimeout(res, 50));
    }

    return json({ ok: true, total: targets.length, revoked, failed, failures });
  } catch (e) {
    return json({ error: (e as Error).message ?? "erro interno" }, 500);
  }
});