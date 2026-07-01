// Endpoint do cliente final: retorna suas próprias chaves Claude + consumo de tokens.
// Auth: JWT do cliente (auth.users), casa com claude_customers.auth_user_id.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLAUDE_API_KEY = Deno.env.get("CLAUDE_RESELLER_API_KEY")!;
const CLAUDE_BASE_URL = (Deno.env.get("CLAUDE_RESELLER_API_BASE_URL") ?? "").replace(/\/$/, "");

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PLAN_CODES = ["pro_30d", "5x_30d", "20x_30d"] as const;

function computeSalePrice(cost: number, mode: string, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

function extractProviderCode(resp: any): string | null {
  if (!resp || typeof resp !== "object") return null;
  return String(
    resp?.code ??
    resp?.key ??
    resp?.data?.code ??
    resp?.data?.key ??
    resp?.credential ??
    resp?.data?.credential ??
    ""
  ).trim() || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const resellerSlug = String(body?.reseller_slug ?? url.searchParams.get("reseller_slug") ?? "").trim().toLowerCase();
    const resellerIdIn = String(body?.reseller_id ?? url.searchParams.get("reseller_id") ?? "").trim();

    let scopedResellerId = resellerIdIn || "";
    if (resellerSlug && !scopedResellerId) {
      const { data: scopedReseller } = await admin
        .from("resellers")
        .select("id")
        .eq("slug", resellerSlug)
        .maybeSingle();
      scopedResellerId = scopedReseller?.id ?? "";
    }
    if ((resellerSlug || resellerIdIn) && !scopedResellerId) return json({ error: "customer_not_found" }, 404);

    let customerQuery = admin
      .from("claude_customers")
      .select("id, email, whatsapp, reseller_id, name, must_change_password")
      .eq("auth_user_id", userData.user.id);
    if (scopedResellerId) customerQuery = customerQuery.eq("reseller_id", scopedResellerId);
    const { data: customer } = await customerQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!customer) return json({ error: "customer_not_found" }, 404);

    // Pedidos: por customer_id OU (fallback) por customer_email dentro do mesmo revendedor
    const emailLower = String(customer.email).toLowerCase();
    const { data: byId } = await admin
      .from("claude_orders")
      .select("id, plan_code, status, provider_key_id, code, provider_response, created_at, sale_price_cents, customer_email")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    const { data: byEmail } = await admin
      .from("claude_orders")
      .select("id, plan_code, status, provider_key_id, code, provider_response, created_at, sale_price_cents, customer_email")
      .eq("reseller_id", customer.reseller_id)
      .ilike("customer_email", emailLower)
      .order("created_at", { ascending: false });

    const seen = new Set<string>();
    const orders = [...(byId ?? []), ...(byEmail ?? [])].filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    }).map((o: any) => {
      const code = String(o.code ?? "").trim() || extractProviderCode(o.provider_response);
      return {
        id: o.id,
        plan_code: o.plan_code,
        status: o.status,
        provider_key_id: o.provider_key_id,
        code,
        created_at: o.created_at,
        sale_price_cents: o.sale_price_cents,
        customer_email: o.customer_email,
      };
    });

    // Planos disponíveis para renovação (sale price com override do revendedor)
    const [{ data: defaults }, { data: overrides }, { data: storefront }, { data: reseller }] = await Promise.all([
      admin.from("claude_plan_prices").select("plan_code, sale_price_cents, cost_cents, is_active").in("plan_code", PLAN_CODES as any),
      admin.from("claude_reseller_price_overrides").select("plan_code, markup_mode, markup_value_cents, is_active").eq("reseller_id", customer.reseller_id),
      admin.from("reseller_storefronts").select("contact_whatsapp, support_whatsapp, store_name, primary_color, background_color, logo_url, logo_size, background_effect, visual_effect").eq("reseller_id", customer.reseller_id).maybeSingle(),
      admin.from("resellers").select("slug, display_name, claude_enabled").eq("id", customer.reseller_id).maybeSingle(),
    ]);
    const overrideMap = new Map((overrides ?? []).map((o: any) => [o.plan_code, o]));
    const plans = (defaults ?? [])
      .filter((p: any) => p.is_active)
      .map((p: any) => {
        const ov = overrideMap.get(p.plan_code);
        const sale = ov && ov.is_active ? computeSalePrice(p.cost_cents, ov.markup_mode, ov.markup_value_cents) : p.sale_price_cents;
        return { plan_code: p.plan_code, sale_price_cents: sale };
      });

    // Chaves de EXTENSÃO do mesmo cliente (match por reseller_id + whatsapp normalizado)
    const digits = (v: any) => String(v ?? "").replace(/\D+/g, "");
    const custWa = digits(customer.whatsapp);
    let extensionKeys: any[] = [];
    if (custWa) {
      const { data: sfo } = await admin
        .from("storefront_orders")
        .select("id, extension_id, license_type, license_key, status, buyer_name, buyer_whatsapp, price_cents, created_at, paid_at, expires_at, cancellation_status")
        .eq("reseller_id", customer.reseller_id)
        .not("license_key", "is", null)
        .in("status", ["paid", "issued", "completed"] as any)
        .order("created_at", { ascending: false });
      const mine = (sfo ?? []).filter((o: any) => digits(o.buyer_whatsapp) === custWa);
      const extIds = Array.from(new Set(mine.map((o: any) => o.extension_id).filter(Boolean)));
      let extMap = new Map<string, string>();
      if (extIds.length) {
        const { data: exts } = await admin.from("extensions").select("id, name").in("id", extIds as any);
        extMap = new Map((exts ?? []).map((e: any) => [e.id, e.name]));
      }
      extensionKeys = mine.map((o: any) => ({
        id: o.id,
        extension_id: o.extension_id,
        extension_name: extMap.get(o.extension_id) ?? "Extensão",
        license_type: o.license_type,
        license_key: o.license_key,
        status: o.status,
        cancellation_status: o.cancellation_status ?? null,
        price_cents: o.price_cents,
        created_at: o.created_at,
        paid_at: o.paid_at,
        expires_at: o.expires_at,
      }));
    }

    // Consumo no provedor (best-effort)
    let providerUser: any = null;
    let providerError: string | null = null;
    if (CLAUDE_BASE_URL && CLAUDE_API_KEY) {
      try {
        const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/users`, {
          headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: "application/json" },
        });
        const txt = await r.text();
        let parsed: any = null;
        try { parsed = JSON.parse(txt); } catch {}
        if (r.ok) {
          const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : [];
          providerUser = list.find((u: any) => String(u?.email ?? "").toLowerCase() === emailLower) ?? null;
        } else {
          providerError = `provider_${r.status}`;
        }
      } catch (e) {
        providerError = String((e as Error)?.message ?? e);
      }
    }

    const usage = providerUser
      ? {
          kind: providerUser.kind,
          status: providerUser.status,
          accountExpiresAt: providerUser.accountExpiresAt,
          redeemedAt: providerUser.redeemedAt,
          tokensConsumed: providerUser?.usage?.tokensConsumed ?? null,
          tokenLimit: providerUser?.usage?.tokenLimit ?? null,
          tokensInWindow: providerUser?.usage?.tokensInWindow ?? null,
          tokenWindowHours: providerUser?.usage?.tokenWindowHours ?? null,
          dailyPercentUsed: providerUser?.usage?.dailyPercentUsed ?? null,
          percentRemaining: providerUser?.usage?.percentRemaining ?? null,
          weeklyTokenLimit: providerUser?.usage?.weeklyTokenLimit ?? null,
          weeklyTokensInWindow: providerUser?.usage?.weeklyTokensInWindow ?? null,
        }
      : null;

    return json({
      ok: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        reseller_id: customer.reseller_id,
        must_change_password: !!customer.must_change_password,
      },
      orders,
      usage,
      plans,
      extension_keys: extensionKeys,
      reseller: {
        display_name: reseller?.display_name ?? null,
        claude_enabled: !!reseller?.claude_enabled,
        whatsapp: storefront?.support_whatsapp ?? storefront?.contact_whatsapp ?? null,
        slug: (reseller as any)?.slug ?? null,
        store_name: storefront?.store_name ?? null,
        primary_color: storefront?.primary_color ?? null,
        background_color: storefront?.background_color ?? null,
        logo_url: storefront?.logo_url ?? null,
        logo_size: storefront?.logo_size ?? null,
        background_effect: storefront?.background_effect ?? null,
        visual_effect: storefront?.visual_effect ?? null,
      },
      provider_error: providerError,
    });
  } catch (e) {
    console.error("[claude-my-usage]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});