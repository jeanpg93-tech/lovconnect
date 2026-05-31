import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const DEFAULT_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const safeJson = async (r: Response) => { try { return await r.json(); } catch { return null; } };
const maskKey = (k: string) => (!k || k.length < 8 ? "••••" : `${k.slice(0, 6)}…${k.slice(-4)}`);

const KEY_TOKEN = "lovax_api_token";
const KEY_BASE = "lovax_base_url";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "status";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const { data: roleRow } = await serviceClient
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "gerente").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const loadCreds = async () => {
      const { data } = await serviceClient
        .from("app_settings").select("key, value, updated_at").in("key", [KEY_TOKEN, KEY_BASE]);
      const tk = data?.find((r: any) => r.key === KEY_TOKEN);
      const bs = data?.find((r: any) => r.key === KEY_BASE);
      return {
        apiKey: tk?.value as string | undefined,
        base: (bs?.value as string | undefined) || DEFAULT_BASE,
        updated_at: tk?.updated_at,
      };
    };

    if (action === "get-settings") {
      const { apiKey, base, updated_at } = await loadCreds();
      if (!apiKey) return json({ configured: false, base_url: base });
      return json({ configured: true, base_url: base, api_key_masked: maskKey(apiKey), updated_at });
    }

    if (action === "save-settings" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
      const baseUrl = (typeof body.base_url === "string" && body.base_url.trim())
        ? body.base_url.trim().replace(/\/+$/, "") : DEFAULT_BASE;
      if (!apiKey || apiKey.length < 8) return json({ error: "Token inválido" }, 400);
      const up1 = await serviceClient.from("app_settings").upsert({ key: KEY_TOKEN, value: apiKey, updated_by: userId });
      const up2 = await serviceClient.from("app_settings").upsert({ key: KEY_BASE, value: baseUrl, updated_by: userId });
      if (up1.error || up2.error) return json({ error: up1.error?.message || up2.error?.message }, 500);
      return json({ ok: true });
    }

    if (action === "delete-settings" && req.method === "POST") {
      await serviceClient.from("app_settings").delete().in("key", [KEY_TOKEN, KEY_BASE]);
      return json({ ok: true });
    }

    const { apiKey, base } = await loadCreds();
    if (!apiKey) return json({ error: "MétodoLovax não configurado", code: "not_configured" }, 400);

    const callTs = async (lovaxAction: string, payload: Record<string, unknown> = {}) => {
      const r = await fetch(base, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ action: lovaxAction, payload }),
      });
      return { ok: r.ok, status: r.status, data: await safeJson(r) };
    };

    if (action === "status") {
      const r = await callTs("balance", {});
      if (!r.ok || !r.data?.success) return json({ provider_error: r.data?.error ?? `HTTP ${r.status}`, status: r.status }, 200);
      const b = r.data.balance;
      if (b && typeof b === "object") {
        return json({
          used: b.keys_used, max: (b.keys_used ?? 0) + (b.keys_available ?? 0), remaining: b.keys_available,
          active: b.active, pending: b.pending, expired: b.expired, revoked: b.revoked, trials: b.trials,
          paid: b.paid, total_licenses: b.total_licenses,
        }, 200);
      }
      return json({ used: r.data.used ?? 0, max: (r.data.used ?? 0) + (typeof b === "number" ? b : 0), remaining: typeof b === "number" ? b : 0 }, 200);
    }

    if (action === "usage") {
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const r = await callTs("list_licenses", { limit: Math.min(500, Math.max(1, limit)), offset: 0 });
      if (!r.ok || !r.data?.success) return json({ usage: [], provider_error: r.data?.error ?? `HTTP ${r.status}` }, 200);
      const items = Array.isArray(r.data.licenses) ? r.data.licenses : [];
      const usage = items.map((l: any) => ({
        license_type: l.status === "trial" ? "trial" : "active",
        license_key: l.license_key, status: l.status,
        created_at: l.created_at ?? null, expires_at: l.expires_at ?? null,
      }));
      return json({ usage }, 200);
    }

    if (action === "generate" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const r = await callTs("generate_license", {
        customer_name: body.display_name || body.customer_name || "Cliente",
        email: body.email ?? null, days: body.days ?? 30, hours: body.hours ?? 0,
        minutes: body.minutes ?? 0, max_devices: body.max_devices ?? 1,
      });
      if (!r.ok || !r.data?.success) return json({ error: r.data?.error ?? `HTTP ${r.status}` }, 502);
      return json(r.data, 200);
    }

    if (action === "generate-trial" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const r = await callTs("generate_trial", {
        customer_name: body.display_name || body.customer_name || "Cliente Trial",
        email: body.email ?? null, minutes: body.minutes ?? 15, max_devices: body.max_devices ?? 1,
      });
      if (!r.ok || !r.data?.success) return json({ error: r.data?.error ?? `HTTP ${r.status}` }, 502);
      return json(r.data, 200);
    }

    if (action === "reset-hwid" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!body?.license_key) return json({ error: "license_key obrigatório" }, 400);
      const r = await callTs("reset_hwid", { license_key: body.license_key });
      if (!r.ok || !r.data?.success) return json({ ok: false, error: r.data?.error ?? `HTTP ${r.status}` }, 200);
      return json({ ok: true, ...r.data }, 200);
    }

    if (action === "delete-license" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!body?.license_key) return json({ error: "license_key obrigatório" }, 400);
      const r = await callTs("delete_license", { license_key: body.license_key });
      if (!r.ok || !r.data?.success) return json({ ok: false, error: r.data?.error ?? `HTTP ${r.status}` }, 200);
      return json({ ok: true, ...r.data }, 200);
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[lovax-api] error", e);
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});
