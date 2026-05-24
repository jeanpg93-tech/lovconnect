import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MISTIC_BASE = "https://api.misticpay.com/api";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Checa se a conta MisticPay do revendedor logado está habilitada para saque.
 * Tenta /users/info e devolve flags relevantes; em paralelo tenta /account/balance.
 * Responde:
 *   { withdraw_enabled: boolean, account_verified: boolean, available_cents: number|null,
 *     reason?: 'no_credentials'|'invalid_credentials'|'withdraw_blocked'|'not_verified'|'unknown',
 *     details?: any }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: cErr } = await userClient.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: reseller } = await admin
    .from("resellers").select("id").eq("user_id", userId).maybeSingle();
  if (!reseller) return json({ error: "reseller_not_found" }, 403);

  const { data: integ } = await admin
    .from("reseller_integrations")
    .select("misticpay_client_id, misticpay_client_secret")
    .eq("reseller_id", reseller.id)
    .maybeSingle();

  const ci = integ?.misticpay_client_id?.trim();
  const cs = integ?.misticpay_client_secret?.trim();
  if (!ci || !cs) {
    return json({
      withdraw_enabled: false,
      account_verified: false,
      available_cents: null,
      reason: "no_credentials",
    });
  }

  const headers = { ci, cs, "Content-Type": "application/json" } as const;
  const attempts: any[] = [];

  // 1) users/info
  let info: any = null;
  try {
    const r = await fetch(`${MISTIC_BASE}/users/info`, { method: "GET", headers });
    const txt = await r.text();
    try { info = JSON.parse(txt); } catch { info = { raw: txt.slice(0, 500) }; }
    attempts.push({ path: "/users/info", status: r.status, body: info });
    if (r.status === 401 || r.status === 403) {
      return json({
        withdraw_enabled: false,
        account_verified: false,
        available_cents: null,
        reason: "invalid_credentials",
        attempts,
      });
    }
  } catch (e) {
    attempts.push({ path: "/users/info", error: e instanceof Error ? e.message : String(e) });
  }

  // 2) account/balance (não-bloqueante)
  let availableCents: number | null = null;
  try {
    const r = await fetch(`${MISTIC_BASE}/account/balance`, { method: "GET", headers });
    const txt = await r.text();
    let body: any = null;
    try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 500) }; }
    attempts.push({ path: "/account/balance", status: r.status, body });
    if (r.ok) {
      const v = body?.data?.available ?? body?.available ?? body?.data?.balance ?? body?.balance;
      if (typeof v === "number") availableCents = Math.round(v * 100);
    }
  } catch (e) {
    attempts.push({ path: "/account/balance", error: e instanceof Error ? e.message : String(e) });
  }

  // Extrai flags do users/info (pode vir em data ou direto)
  const u = info?.data ?? info ?? {};
  const accountVerified = Boolean(
    u.accountVerified ?? u.account_verified ?? u.verified ?? u.isVerified,
  );
  const withdrawBlocked = Boolean(
    u.withdrawBlocked ?? u.withdraw_blocked ?? u.blockWithdraw ?? false,
  );
  // Alguns providers expõem `withdrawEnabled`
  const withdrawEnabledFlag =
    u.withdrawEnabled ?? u.withdraw_enabled ?? (accountVerified && !withdrawBlocked);

  const withdraw_enabled = Boolean(withdrawEnabledFlag);
  let reason: string | undefined;
  if (!withdraw_enabled) {
    if (!accountVerified) reason = "not_verified";
    else if (withdrawBlocked) reason = "withdraw_blocked";
    else reason = "unknown";
  }

  return json({
    withdraw_enabled,
    account_verified: accountVerified,
    withdraw_blocked: withdrawBlocked,
    available_cents: availableCents,
    reason,
    attempts,
  });
});