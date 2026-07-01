// Endpoint do cliente final: retorna suas próprias chaves Claude + consumo de tokens.
// Auth: JWT do cliente (auth.users), casa com claude_customers.auth_user_id.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLAUDE_API_KEY = Deno.env.get("CLAUDE_RESELLER_API_KEY")!;
const CLAUDE_BASE_URL = (Deno.env.get("CLAUDE_RESELLER_API_BASE_URL") ?? "").replace(/\/$/, "");

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    const { data: customer } = await admin
      .from("claude_customers")
      .select("id, email, reseller_id, name")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!customer) return json({ error: "customer_not_found" }, 404);

    // Pedidos: por customer_id OU (fallback) por customer_email dentro do mesmo revendedor
    const emailLower = String(customer.email).toLowerCase();
    const { data: byId } = await admin
      .from("claude_orders")
      .select("id, plan_code, status, provider_key_id, created_at, sale_price_cents, customer_email")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });
    const { data: byEmail } = await admin
      .from("claude_orders")
      .select("id, plan_code, status, provider_key_id, created_at, sale_price_cents, customer_email")
      .eq("reseller_id", customer.reseller_id)
      .ilike("customer_email", emailLower)
      .order("created_at", { ascending: false });

    const seen = new Set<string>();
    const orders = [...(byId ?? []), ...(byEmail ?? [])].filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

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
      customer: { id: customer.id, name: customer.name, email: customer.email },
      orders,
      usage,
      provider_error: providerError,
    });
  } catch (e) {
    console.error("[claude-my-usage]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});