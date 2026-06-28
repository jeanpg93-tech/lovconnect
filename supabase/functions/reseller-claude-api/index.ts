// Public reseller-facing Claude API. Auth via header `X-API-Key: lov_live_...`
// Endpoints (path after /reseller-claude-api):
//   GET  /status              -> health + claude_enabled flag
//   GET  /planos              -> catalog with prices for this reseller
//   GET  /saldo               -> wallet balance (BRL cents)
//   POST /chaves              -> issue Claude key. Body: { plano: "<plan_code>", id_cliente?: string }
//   GET  /chaves              -> list recent orders (max 50)
//   GET  /chaves/{id}         -> get a specific order (no `code` field)

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CLAUDE_API_KEY = Deno.env.get("CLAUDE_RESELLER_API_KEY") ?? "";
const CLAUDE_BASE_URL = (Deno.env.get("CLAUDE_RESELLER_API_BASE_URL") ?? "").replace(/\/$/, "");

const PLAN_CODES = new Set(["5x_7d", "5x_30d", "20x_30d", "pro_30d"]);

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function computeSale(cost: number, mode: string, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const idx = segments.findIndex((s) => s === "reseller-claude-api");
  const route = idx >= 0 ? segments.slice(idx + 1) : segments;
  const action = route[0] ?? "";
  const subId = route[1] ?? "";

  // ---- Auth ----
  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey || apiKey.length < 10) return json({ success: false, error: "Missing X-API-Key" }, 401);

  const keyHash = await sha256Hex(apiKey);
  const { data: keyRow } = await svc
    .from("reseller_api_keys")
    .select("id, reseller_id, is_active, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (!keyRow || !keyRow.is_active || keyRow.revoked_at) {
    return json({ success: false, error: "API Key inválida ou revogada" }, 401);
  }

  const { data: reseller } = await svc
    .from("resellers")
    .select("id, is_active, claude_enabled, activation_status")
    .eq("id", keyRow.reseller_id)
    .maybeSingle();
  if (!reseller || !reseller.is_active) return json({ success: false, error: "Revendedor inativo" }, 403);
  if (reseller.activation_status && reseller.activation_status !== "active") {
    return json({ success: false, error: "activation_required" }, 403);
  }
  if (!reseller.claude_enabled) return json({ success: false, error: "Claude API não habilitada para este revendedor" }, 403);

  await svc.from("reseller_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

  const resolvePrices = async () => {
    const [{ data: def }, { data: ov }] = await Promise.all([
      svc.from("claude_plan_prices").select("*"),
      svc.from("claude_reseller_price_overrides").select("*").eq("reseller_id", reseller.id),
    ]);
    return Array.from(PLAN_CODES).map((pc) => {
      const base: any = (def ?? []).find((x: any) => x.plan_code === pc);
      if (!base) return null;
      const override: any = (ov ?? []).find((x: any) => x.plan_code === pc && x.is_active);
      const sale = override
        ? computeSale(base.cost_cents, override.markup_mode, override.markup_value_cents)
        : base.sale_price_cents;
      return { plano: pc, preco_centavos: sale, preco: (sale / 100).toFixed(2), disponivel: !!base.is_active };
    }).filter(Boolean);
  };

  try {
    // ---- Routes ----
    if (action === "status" && req.method === "GET") {
      return json({ success: true, claude_enabled: true });
    }

    if (action === "planos" && req.method === "GET") {
      return json({ success: true, planos: await resolvePrices() });
    }

    if (action === "saldo" && req.method === "GET") {
      const { data: bal } = await svc.from("reseller_balances").select("balance_cents").eq("reseller_id", reseller.id).maybeSingle();
      const cents = bal?.balance_cents ?? 0;
      return json({ success: true, saldo_centavos: cents, saldo: (cents / 100).toFixed(2) });
    }

    if (action === "chaves" && req.method === "GET" && !subId) {
      const { data } = await svc
        .from("claude_orders")
        .select("id, plan_code, status, sale_price_cents, provider_key_id, created_at, error_message")
        .eq("reseller_id", reseller.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return json({ success: true, chaves: data ?? [] });
    }

    if (action === "chaves" && req.method === "GET" && subId) {
      const { data } = await svc
        .from("claude_orders")
        .select("id, plan_code, status, sale_price_cents, provider_key_id, created_at, error_message")
        .eq("reseller_id", reseller.id)
        .eq("id", subId)
        .maybeSingle();
      if (!data) return json({ success: false, error: "Pedido não encontrado" }, 404);
      return json({ success: true, chave: data });
    }

    if (action === "chaves" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const planCode = String(body?.plano ?? body?.plan_code ?? "").trim();
      const customerId = body?.id_cliente ? String(body.id_cliente) : null;
      const requestId = req.headers.get("idempotency-key") || (body?.request_id ? String(body.request_id) : null);
      if (!PLAN_CODES.has(planCode)) return json({ success: false, error: "invalid_plano" }, 400);

      // Idempotency
      if (requestId) {
        const { data: prior } = await svc
          .from("claude_orders")
          .select("id, plan_code, status, sale_price_cents, provider_key_id, code")
          .eq("reseller_id", reseller.id)
          .eq("request_id", requestId)
          .maybeSingle();
        if (prior) return json({ success: true, idempotent: true, pedido: prior });
      }

      const [{ data: defaultPrice }, { data: override }] = await Promise.all([
        svc.from("claude_plan_prices").select("*").eq("plan_code", planCode).maybeSingle(),
        svc.from("claude_reseller_price_overrides").select("*").eq("reseller_id", reseller.id).eq("plan_code", planCode).maybeSingle(),
      ]);
      if (!defaultPrice || !defaultPrice.is_active) return json({ success: false, error: "plano_indisponivel" }, 400);

      const costCents = defaultPrice.cost_cents;
      const resellerCostCents = (defaultPrice as any).reseller_cost_cents ?? defaultPrice.sale_price_cents;
      const saleCents = override && override.is_active
        ? computeSale(costCents, override.markup_mode, override.markup_value_cents)
        : defaultPrice.sale_price_cents;
      const profitCents = saleCents - resellerCostCents;

      // Pre-check (informational; atomic check happens inside the RPC below)
      const { data: balRow } = await svc.from("reseller_balances").select("balance_cents").eq("reseller_id", reseller.id).maybeSingle();
      const balance = balRow?.balance_cents ?? 0;
      if (balance < resellerCostCents) {
        return json({ success: false, error: "saldo_insuficiente", saldo_centavos: balance, preco_centavos: resellerCostCents }, 402);
      }

      const { data: order, error: oErr } = await svc.from("claude_orders").insert({
        reseller_id: reseller.id,
        plan_code: planCode,
        customer_identifier: customerId,
        cost_cents: costCents,
        sale_price_cents: saleCents,
        profit_cents: profitCents,
        status: "pending",
        request_id: requestId,
      }).select().single();
      if (oErr) throw oErr;

      if (!CLAUDE_BASE_URL) {
        await svc.from("claude_orders").update({ status: "failed", error_message: "provider_not_configured" }).eq("id", order.id);
        return json({ success: false, error: "provider_not_configured" }, 500);
      }

      let providerResp: any = null;
      let providerStatus = 0;
      try {
        const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/keys`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${CLAUDE_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ kind: planCode }),
        });
        providerStatus = r.status;
        const txt = await r.text();
        try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
      } catch (e) {
        await svc.from("claude_orders").update({ status: "failed", error_message: `network: ${(e as Error).message}` }).eq("id", order.id);
        return json({ success: false, error: "provider_network_error" }, 502);
      }

      if (providerStatus < 200 || providerStatus >= 300) {
        await svc.from("claude_orders").update({
          status: "failed",
          provider_response: providerResp,
          error_message: `provider_${providerStatus}`,
        }).eq("id", order.id);
        return json({ success: false, error: "provider_error", status: providerStatus, body: providerResp }, 502);
      }

      const code: string | undefined =
        providerResp?.code ?? providerResp?.key ?? providerResp?.data?.code ?? providerResp?.data?.key;
      const providerKeyId: string | undefined =
        providerResp?.id ?? providerResp?.key_id ?? providerResp?.data?.id;

      // SECURITY: atomic debit via RPC to prevent TOCTOU / double-spend.
      const { data: debited, error: debitErr } = await svc.rpc("debit_reseller_balance", {
        _reseller_id: reseller.id,
        _amount_cents: resellerCostCents,
        _kind: "claude_key_issue",
        _description: `Emissão chave Claude ${planCode} (API)`,
        _reference_id: order.id,
      });
      if (debitErr || debited !== true) {
        await svc.from("claude_orders").update({
          status: "failed",
          provider_response: providerResp,
          error_message: `debit_failed: ${debitErr?.message ?? 'insufficient_balance'}`,
        }).eq("id", order.id);
        return json({ success: false, error: debitErr ? "debit_failed" : "saldo_insuficiente" }, 402);
      }

      await svc.from("claude_orders").update({
        status: "issued",
        code,
        provider_key_id: providerKeyId,
        provider_response: providerResp,
        code_revealed_at: new Date().toISOString(),
      }).eq("id", order.id);

      return json({
        success: true,
        pedido_id: order.id,
        plano: planCode,
        preco_centavos: saleCents,
        codigo: code, // one-time
        provider_key_id: providerKeyId,
      });
    }

    return json({ success: false, error: "not_found" }, 404);
  } catch (e) {
    console.error("[reseller-claude-api]", e);
    return json({ success: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});