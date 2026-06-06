// Public Reseller API — used by external systems with x-api-key header.
// Endpoints:
//   GET  /status         -> conta, saldo, plano
//   GET  /pricing        -> preços efetivos por tipo de licença
//   POST /generate       -> gera licença (debita saldo)
//   GET  /usage          -> últimas chamadas
//   POST /webhook        -> { url } atualiza webhook da key
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_TYPES = ["pro_1d", "pro_7d", "pro_30d", "lifetime"];
// Mapeia o license_type legado da API pública para o duration_code unificado
// usado por tier_license_prices / get_license_pack_cost.
const LEGACY_TYPE_TO_DURATION: Record<string, string> = {
  pro_1d: "1d",
  pro_7d: "7d",
  pro_30d: "30d",
  lifetime: "lifetime",
};
const DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";

const UNIFIED_METHODS = ["flow", "lovax"];
const UNIFIED_PACKS = ["1d", "7d", "30d", "90d", "365d", "lifetime"];
// MétodoFlow tem teto de 60 dias no provedor — 90d/365d entregavam apenas 60d.
// Mantemos somente as durações que o provedor honra de verdade.
const FLOW_ALLOWED_PACKS = new Set(["1d", "7d", "30d", "lifetime"]);
const PACK_LABEL: Record<string, string> = {
  "1d": "1 Dia", "7d": "7 Dias", "30d": "30 Dias",
  "90d": "90 Dias", "365d": "1 Ano", "lifetime": "Vitalícia",
};
const genUnifiedKey = (method: string, pack: string) => {
  const rnd = crypto.randomUUID().replace(/-/g, "").toUpperCase().slice(0, 16);
  return `${method.toUpperCase()}-${pack.toUpperCase()}-${rnd}`;
};

const DEFAULT_LOVAX_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

function packToFlowBody(pack: string): Record<string, unknown> {
  switch (pack) {
    case "1d": return { days: 1 };
    case "7d": return { days: 7 };
    case "30d": return { days: 30 };
    case "90d": return { days: 90 };
    case "365d": return { days: 365 };
    case "lifetime": return { lifetime: true };
    default: return { days: 30 };
  }
}

function packToLovaxDays(pack: string): number {
  switch (pack) {
    case "1d": return 1;
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "365d": return 365;
    case "lifetime": return 36500;
    default: return 30;
  }
}

function mapTypeToProviderBody(type: string): Record<string, unknown> {
  switch (type) {
    case "pro_1d": return { days: 1 };
    case "pro_7d": return { days: 7 };
    case "pro_15d": return { days: 15 };
    case "pro_30d": return { days: 30 };
    case "lifetime": return { lifetime: true };
    default: return { days: 30 };
  }
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getDeliveryGuard(svc: any) {
  const { data } = await svc
    .from("app_settings")
    .select("key,value")
    .in("key", ["licencas.delivery.method", "licencas.delivery.maintenance"]);
  const methodValue = data?.find((r: any) => r.key === "licencas.delivery.method")?.value;
  const maintenanceValue = data?.find((r: any) => r.key === "licencas.delivery.maintenance")?.value;
  const activeMethod = methodValue?.method === "lovax" ? "lovax" : "flow";
  const maintenance = maintenanceValue?.enabled === true;
  return { activeMethod, maintenance };
}

function assertDeliveryAllowed(requested: string, guard: { activeMethod: string; maintenance: boolean }) {
  if (guard.maintenance) {
    return { error: "Entrega de licenças em manutenção. Nenhuma chave pode ser gerada agora.", code: "delivery_maintenance", status: 503 };
  }
  if (requested !== guard.activeMethod) {
    return {
      error: `Método desativado. Apenas ${guard.activeMethod === "flow" ? "MétodoFlow" : "MétodoLovax"} pode gerar licenças agora.`,
      code: "method_disabled",
      status: 403,
    };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Parse path: /reseller-api/<action>
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const action = segments[segments.length - 1] || "status";

  // Auth via x-api-key
  const apiKey = req.headers.get("x-api-key") ?? "";
  if (!apiKey || apiKey.length < 10) return json({ error: "Missing x-api-key" }, 401);

  const keyHash = await sha256Hex(apiKey);
  const { data: keyRow } = await svc.from("reseller_api_keys")
    .select("id, reseller_id, is_active, webhook_url, revoked_at, scope, reseller:resellers(user_id)")
    .eq("key_hash", keyHash).maybeSingle();
  if (!keyRow || !keyRow.is_active || keyRow.revoked_at) return json({ error: "Invalid API key" }, 401);
  if (keyRow.scope && keyRow.scope !== "keys") return json({ error: "API key não autorizada para este endpoint" }, 403);

  const { data: reseller } = await svc.from("resellers")
    .select("id, display_name, slug, is_active, activation_status, billing_mode, subscription_blocked, subscription_sales_disabled, pack_sales_disabled, delivery_source").eq("id", keyRow.reseller_id).maybeSingle();
  if (!reseller || !reseller.is_active) return json({ error: "Reseller inactive" }, 403);
  if (reseller.activation_status && reseller.activation_status !== "active") {
    return json({ error: "activation_required", message: "Painel pendente de ativação (R$ 200)" }, 403);
  }
  const isSubscription = (reseller as any).billing_mode === "subscription";
  const isPack = (reseller as any).billing_mode === "pack";
  const deliveryFromPack = isPack && (reseller as any).delivery_source === "pack";
  if (isSubscription && (reseller as any).subscription_blocked) {
    return json({ error: "subscription_blocked", message: "Painel bloqueado por cobrança em aberto" }, 403);
  }
  if (isSubscription && (reseller as any).subscription_sales_disabled) {
    await svc.from("blocked_sale_attempts").insert({
      reseller_id: reseller.id,
      attempt_type: "subscription",
      endpoint: `reseller-api/${action}`,
      reason: "sales_disabled",
      metadata: { via: "api" },
    });
    return json({ error: "sales_disabled", message: "Vendas pausadas pelo gerente" }, 403);
  }
  if (isPack && (reseller as any).pack_sales_disabled) {
    await svc.from("blocked_sale_attempts").insert({
      reseller_id: reseller.id,
      attempt_type: "pack",
      endpoint: `reseller-api/${action}`,
      reason: "sales_disabled",
      metadata: { via: "api" },
    });
    return json({ error: "sales_disabled", message: "Vendas pausadas pelo gerente" }, 403);
  }

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? null;

  const logUsage = async (status_code: number, opts: {
    cost_cents?: number; license_type?: string; license_key?: string; error_message?: string;
  } = {}) => {
    await svc.from("reseller_api_usage").insert({
      api_key_id: keyRow.id,
      reseller_id: reseller.id,
      endpoint: action,
      method: req.method,
      status_code,
      cost_cents: opts.cost_cents ?? 0,
      license_type: opts.license_type ?? null,
      license_key: opts.license_key ?? null,
      error_message: opts.error_message ?? null,
      ip_address: ip,
    });
    await svc.from("reseller_api_keys")
      .update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
  };

  // ---------- GET /status ou /balance ----------
  if (req.method === "GET" && (action === "status" || action === "balance")) {
    const { data: bal } = await svc.from("reseller_balances")
      .select("balance_cents").eq("reseller_id", reseller.id).maybeSingle();
    const cents = Number(bal?.balance_cents ?? 0);
    const reais = Math.round(cents) / 100;

    if (action === "balance") {
      await logUsage(200);
      return json({
        ok: true,
        balance_cents: cents,
        balance: reais,
        balance_brl: reais.toFixed(2),
        currency: "BRL",
      });
    }

    const { data: tier } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
    const tierRow: any = Array.isArray(tier) ? tier[0] : tier;
    await logUsage(200);
    return json({
      reseller: { id: reseller.id, name: reseller.display_name, slug: reseller.slug },
      balance_cents: cents,
      balance: reais,
      balance_brl: reais.toFixed(2),
      currency: "BRL",
      tier: tierRow ? { name: tierRow.name, slug: tierRow.slug, discount_percent: Number(tierRow.discount_percent ?? 0) } : null,
      webhook_url: keyRow.webhook_url,
    });
  }

  // ---------- GET /pricing ----------
  if (req.method === "GET" && action === "pricing") {
    const { data: plans } = await svc.from("pricing_plans")
      .select("license_type, label, price_cents, min_price_cents, is_active").eq("is_active", true);
    const { data: overrides } = await svc.from("reseller_extension_prices")
      .select("extension_id, license_type, price_cents, is_active")
      .eq("reseller_id", reseller.id).eq("is_active", true);
    const { data: tier } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
    const tierRow: any = Array.isArray(tier) ? tier[0] : tier;
    const discount = Number(tierRow?.discount_percent ?? 0);
    const minByType: Record<string, number> = {};
    (plans ?? []).forEach((p: any) => { minByType[p.license_type] = Number(p.min_price_cents ?? 0); });
    const apply = (cents: number, lt: string) =>
      Math.max(0, minByType[lt] ?? 0, Math.round(cents * (1 - discount / 100)));
    await logUsage(200);
    return json({
      discount_percent: discount,
      plans: (plans ?? []).map((p) => ({
        license_type: p.license_type,
        label: p.label,
        base_price_cents: p.price_cents,
        min_price_cents: Number((p as any).min_price_cents ?? 0),
        final_price_cents: apply(p.price_cents, p.license_type),
      })),
      extension_overrides: (overrides ?? []).map((o) => ({
        extension_id: o.extension_id,
        license_type: o.license_type,
        base_price_cents: o.price_cents,
        final_price_cents: apply(o.price_cents, o.license_type),
      })),
    });
  }

  // ---------- GET /usage ----------
  if (req.method === "GET" && action === "usage") {
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const { data } = await svc.from("reseller_api_usage")
      .select("created_at, endpoint, method, status_code, cost_cents, license_type, license_key, error_message")
      .eq("reseller_id", reseller.id).order("created_at", { ascending: false }).limit(limit);
    await logUsage(200);
    return json({ items: data ?? [] });
  }

  // ---------- POST /webhook ----------
  if (req.method === "POST" && action === "webhook") {
    const body = await req.json().catch(() => ({}));
    const wurl = typeof body.url === "string" ? body.url.trim() : "";
    if (wurl && !/^https?:\/\//.test(wurl)) {
      await logUsage(400, { error_message: "URL inválida" });
      return json({ error: "URL deve começar com http(s)://" }, 400);
    }
    await svc.from("reseller_api_keys")
      .update({ webhook_url: wurl || null }).eq("id", keyRow.id);
    await logUsage(200);
    return json({ ok: true, webhook_url: wurl || null });
  }

  // ---------- POST /generate ----------
  if (req.method === "POST" && action === "generate") {
    const body = await req.json().catch(() => ({}));
    const license_type = String(body.license_type ?? body.type ?? "");
    const extension_id = body.extension_id ? String(body.extension_id) : null;
    const display_name = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) : "";
    const whatsapp = (typeof body.whatsapp === "string" ? body.whatsapp : "").replace(/\D+/g, "").slice(0, 15);

    if (!ALLOWED_TYPES.includes(license_type)) {
      await logUsage(400, { error_message: "Tipo inválido" });
      return json({ error: "license_type inválido", allowed: ALLOWED_TYPES }, 400);
    }
    if (display_name.length < 2) {
      await logUsage(400, { error_message: "display_name obrigatório" });
      return json({ error: "display_name obrigatório (>= 2 chars)" }, 400);
    }

    // Se informou extension_id, garante que a extensão está liberada para o revendedor
    if (extension_id) {
      // 1) Checa se revendedor tem a extensão liberada (reseller_extensions)
      const { data: re } = await svc.from("reseller_extensions")
        .select("id").eq("reseller_id", reseller.id).eq("extension_id", extension_id).maybeSingle();
      
      // 2) Checa se há override específico para o parceiro (reseller_extension_price_overrides)
      const { data: pov } = await svc.from("reseller_extension_price_overrides")
        .select("id").eq("reseller_id", reseller.id).eq("extension_id", extension_id).limit(1);
      
      const isPartner = (pov?.length ?? 0) > 0;

      if (!re && !isPartner) {
        await logUsage(403, { error_message: "Extensão não liberada" });
        return json({ error: "Extensão não liberada para você" }, 403);
      }
    }

    // Preço: Partner Override (extensão) > Tier Extension Price > tier_license_prices (unificado)
    let price_cents = 0;
    let tier_price_override = 0;

    // 1) Override individual por revendedor (Partners) tem prioridade máxima
    if (extension_id) {
      const { data: partnerRow } = await svc.from("reseller_extension_price_overrides")
        .select("price_cents,is_active")
        .eq("reseller_id", reseller.id)
        .eq("extension_id", extension_id)
        .eq("license_type", license_type)
        .maybeSingle();
      if (partnerRow && partnerRow.is_active && partnerRow.price_cents >= 0) {
        tier_price_override = partnerRow.price_cents;
      }
    } else {
      // Pacote global (sem extensão): menor override de Partners ativo
      const { data: partnerRows } = await svc.from("reseller_extension_price_overrides")
        .select("price_cents,is_active")
        .eq("reseller_id", reseller.id)
        .eq("license_type", license_type)
        .eq("is_active", true);
      if (partnerRows && partnerRows.length > 0) {
        const min = Math.min(...partnerRows.map((r: any) => Number(r.price_cents)).filter((n: number) => n >= 0));
        if (Number.isFinite(min)) tier_price_override = min;
      }
    }

    // 2) Fallback: override por nível (tier_extension_prices)
    if (tier_price_override === 0 && extension_id) {
      const { data: tierNow } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
      const tierObj = Array.isArray(tierNow) ? tierNow[0] : tierNow;
      if (tierObj?.id) {
        const { data: tierPriceRow } = await svc.from("tier_extension_prices")
          .select("price_cents,is_active")
          .eq("tier_id", tierObj.id)
          .eq("extension_id", extension_id)
          .eq("license_type", license_type)
          .maybeSingle();
        if (tierPriceRow && tierPriceRow.is_active && tierPriceRow.price_cents >= 0) {
          tier_price_override = tierPriceRow.price_cents;
        }
      }
    }

    const discount = 0; // Mantido para compatibilidade no response

    if (tier_price_override > 0) {
      price_cents = tier_price_override;
    } else {
      // Fonte única: tier_license_prices via RPC (mesmo custo usado no painel)
      const duration_code = LEGACY_TYPE_TO_DURATION[license_type];
      if (!duration_code) {
        await logUsage(400, { error_message: "Tipo sem mapeamento" });
        return json({ error: "license_type sem preço unificado", allowed: ALLOWED_TYPES }, 400);
      }
      const { data: costData } = await svc.rpc("get_license_pack_cost", {
        _reseller_id: reseller.id,
        _duration_code: duration_code,
      });
      price_cents = Number(costData ?? 0);
      if (!isSubscription && (!price_cents || price_cents <= 0)) {
        await logUsage(400, { error_message: "Preço não configurado" });
        return json({ error: "Preço não configurado para esse tipo pelo gerente" }, 400);
      }
    }

    if (isSubscription) price_cents = 0;

    // Cria pedido
    const { data: order, error: ordErr } = await svc.from("orders").insert({
      reseller_id: reseller.id,
      extension_id,
      license_type,
      price_cents,
      status: "pending",
      api_key_id: keyRow.id,
      notes: JSON.stringify({
        source: "api",
        display_name: display_name || null,
        whatsapp: whatsapp || null,
      }),
    }).select().single();
    if (ordErr || !order) {
      await logUsage(500, { error_message: "Falha pedido" });
      return json({ error: "Falha ao criar pedido" }, 500);
    }

    // Cobrança: Pacote (modo pack + delivery_source=pack) com fallback Saldo.
    let usedPack = false;
    let fallbackFromPack = false;
    if (!isSubscription) {
      if (deliveryFromPack) {
        const { data: consumed, error: consumeErr } = await svc.rpc(
          "pack_try_consume_sale_credit",
          { _reseller_id: reseller.id, _order_id: order.id, _description: `API ${license_type}` },
        );
        if (consumeErr) {
          await svc.from("orders").update({ status: "failed", error_message: consumeErr.message }).eq("id", order.id);
          await logUsage(500, { error_message: consumeErr.message });
          return json({ error: consumeErr.message }, 500);
        }
        if (typeof consumed === "number" && consumed >= 0) usedPack = true;
        else fallbackFromPack = true;
      }
      if (!usedPack) {
        const debitRpc = fallbackFromPack ? "debit_reseller_balance_pack_fallback" : "debit_reseller_balance";
        const debitArgs: Record<string, unknown> = {
          _reseller_id: reseller.id,
          _amount_cents: price_cents,
          _kind: "api_debit",
          _description: fallbackFromPack ? `API ${license_type} (fallback pacote esgotado)` : `API ${license_type}`,
          _reference_id: order.id,
        };
        if (fallbackFromPack) debitArgs._promotion_id = null;
        const { data: ok, error: debErr } = await svc.rpc(debitRpc, debitArgs);
        if (debErr || !ok) {
          await svc.from("orders").update({
            status: "failed",
            error_message: debErr?.message ?? (fallbackFromPack ? "Pacote esgotado e saldo insuficiente" : "Saldo insuficiente"),
          }).eq("id", order.id);
          await logUsage(402, { error_message: "Saldo insuficiente" });
          return json({ error: fallbackFromPack ? "Pacote esgotado e saldo insuficiente" : "Saldo insuficiente" }, 402);
        }
      }
    }

    // Provedor
    const { data: cfg } = await svc.from("provider_settings")
      .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const provKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? DEFAULT_BASE;

    const refund = async (reason: string, providerResp?: unknown) => {
      if (!isSubscription && !usedPack) {
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: reseller.id,
          _amount_cents: price_cents,
          _kind: "api_refund",
          _description: `Refund API ${order.id}`,
          _reference_id: order.id,
        });
      }
      if (usedPack) {
        await svc.rpc("pack_refund_credit", {
          _reseller_id: reseller.id,
          _order_id: order.id,
          _description: `Refund API ${order.id}: ${reason}`,
        }).then((r: any) => r.error && console.warn("pack_refund_credit failed", r.error));
      }
      await svc.from("orders").update({
        status: "refunded", error_message: reason, provider_response: providerResp ?? null,
      }).eq("id", order.id);
    };

    if (!provKey) {
      await refund("Provedor não configurado");
      await logUsage(500, { error_message: "Provedor offline" });
      return json({ error: "Provedor não configurado" }, 500);
    }

    let providerData: any = null;
    try {
      // Get reseller email for creator_email
      let creator_email = null;
      if (keyRow.reseller?.user_id) {
        const { data: userData } = await svc.auth.admin.getUserById(keyRow.reseller.user_id);
        creator_email = userData?.user?.email ?? null;
      }

      const r = await fetch(`${base}/generate-license`, {
        method: "POST",
        headers: { "x-api-token": provKey, "x-api-key": provKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...mapTypeToProviderBody(license_type), display_name, creator_email }),
      });
      const text = await r.text();
      try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
      if (!r.ok) {
        await refund(`Provedor ${r.status}`, providerData);
        await logUsage(502, { error_message: `Provedor ${r.status}` });
        return json({ error: "Provedor falhou", details: providerData }, 502);
      }
    } catch (e) {
      await refund(e instanceof Error ? e.message : "fetch error");
      await logUsage(502, { error_message: "Erro provedor" });
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    const license_key = providerData?.key ?? providerData?.license_key ?? providerData?.license ?? null;
    await svc.from("orders").update({
      status: "completed", license_key, provider_response: providerData,
      notes: JSON.stringify({
        source: "api",
        billing_mode: (reseller as any).billing_mode ?? "normal",
        delivery_source: deliveryFromPack ? (usedPack ? "pack" : "wallet_fallback") : "wallet",
        fallback_from_pack: fallbackFromPack,
      }),
    }).eq("id", order.id);
    await svc.rpc("add_reseller_spent", { _reseller_id: reseller.id, _amount_cents: price_cents });
    await logUsage(200, { cost_cents: price_cents, license_type, license_key: license_key ?? undefined });

    // Webhook (best-effort)
    if (keyRow.webhook_url) {
      const payload = {
        event: "license.generated",
        order_id: order.id,
        reseller_id: reseller.id,
        license_type,
        license_key,
        price_cents,
        created_at: new Date().toISOString(),
      };
      try {
        const resp = await fetch(keyRow.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const respText = await resp.text().catch(() => "");
        await svc.from("reseller_api_webhook_deliveries").insert({
          api_key_id: keyRow.id, reseller_id: reseller.id,
          event: "license.generated", target_url: keyRow.webhook_url,
          payload, response_status: resp.status,
          response_body: respText.slice(0, 1000),
          delivered_at: new Date().toISOString(),
        });
      } catch (e) {
        await svc.from("reseller_api_webhook_deliveries").insert({
          api_key_id: keyRow.id, reseller_id: reseller.id,
          event: "license.generated", target_url: keyRow.webhook_url,
          payload, response_status: 0,
          response_body: e instanceof Error ? e.message : "fetch failed",
        });
      }
    }

    return json({
      ok: true,
      order_id: order.id,
      license_key,
      license_type,
      price_cents,
      discount_percent: discount,
    });
  }

  // ---------- POST /generate-trial ----------
  if (req.method === "POST" && action === "generate-trial") {
    const body = await req.json().catch(() => ({}));
    const display_name = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) : "Cliente Teste";
    const webhook_url = typeof body.webhook_url === "string" ? body.webhook_url.trim() : null;

    // Provedor
    const { data: cfg } = await svc.from("provider_settings")
      .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const provKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? DEFAULT_BASE;

    if (!provKey) {
      await logUsage(500, { error_message: "Provedor offline" });
      return json({ error: "Provedor não configurado" }, 500);
    }

    let providerData: any = null;
    try {
      const r = await fetch(`${base}/generate-trial`, {
        method: "POST",
        headers: { "x-api-token": provKey, "x-api-key": provKey, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name, minutes: 15, seconds: 0 }),
      });
      const text = await r.text();
      try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
      if (!r.ok) {
        await logUsage(502, { error_message: `Provedor ${r.status}` });
        return json({ error: "Provedor falhou", details: providerData }, 502);
      }
    } catch (e) {
      await logUsage(502, { error_message: "Erro provedor" });
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    const license_key = providerData?.license_key ?? providerData?.key ?? null;
    
    // Log trial creation (no cost)
    await logUsage(200, { license_type: "trial", license_key: license_key ?? undefined });

    return json({
      success: true,
      license_key,
      type: "trial",
      minutes: providerData?.minutes ?? 15,
      expires_at: providerData?.expires_at,
      used: providerData?.used ?? 0,
      limit: providerData?.limit ?? 1,
      remaining: providerData?.remaining ?? 0
    });
  }


  const LICENSE_ACTIONS = ["reset-hwid", "revoke-license", "delete-license"];

  // ---------- GET /metodos ----------
  // Lista os métodos (flow/lovax) com pacotes, preço de custo (nível do revendedor)
  // e preço de venda configurado (override em reseller_license_prices).
  if (req.method === "GET" && (action === "metodos" || action === "methods")) {
    const guard = await getDeliveryGuard(svc);
    const [{ data: tierData }, { data: sales }, { data: tlpRows }] = await Promise.all([
      svc.rpc("get_reseller_tier", { _reseller_id: reseller.id }),
      svc.from("reseller_license_prices").select("method,pack_id,price_cents").eq("reseller_id", reseller.id),
      svc.from("tier_license_prices").select("tier_id,duration_code,price_cents,is_active").eq("is_active", true),
    ]);
    const tier: any = Array.isArray(tierData) ? tierData[0] : tierData;
    const saleMap: Record<string, number> = {};
    (sales ?? []).forEach((r: any) => { saleMap[`${r.method}|${r.pack_id}`] = Number(r.price_cents); });
    const OURO_ID = "4e670a7f-921c-4ca1-8792-8eac2b4905ef";
    const tlpByTierPack: Record<string, number> = {};
    (tlpRows ?? []).forEach((r: any) => { tlpByTierPack[`${r.tier_id}:${r.duration_code}`] = Number(r.price_cents); });
    const costFor = (_m: string, p: string): number => {
      if (tier?.id) {
        const v = tlpByTierPack[`${tier.id}:${p}`];
        if (v && v > 0) return v;
      }
      return tlpByTierPack[`${OURO_ID}:${p}`] ?? 0;
    };

    const result = UNIFIED_METHODS.filter((m) => m === guard.activeMethod && !guard.maintenance).map((m) => ({
      metodo: m,
      pacotes: UNIFIED_PACKS.filter((p) => m !== "flow" || FLOW_ALLOWED_PACKS.has(p)).map((p) => {
        const cost_cents = costFor(m, p);
        const sale_cents = saleMap[`${m}|${p}`] ?? null;
        return {
          pacote: p,
          label: PACK_LABEL[p],
          custo_cents: cost_cents,
          venda_cents: sale_cents,
          disponivel: cost_cents > 0,
        };
      }).filter((x) => x.disponivel),
    })).filter((x) => x.pacotes.length > 0);

    await logUsage(200);
    return json({ ok: true, active_method: guard.activeMethod, maintenance: guard.maintenance, metodos: result, tier: tier ? { id: tier.id, name: tier.name } : null });
  }

  // ---------- POST /licencas ----------
  // Endpoint unificado: { metodo: "flow"|"lovax", pacote, display_name, whatsapp?, client_id? }
  if (req.method === "POST" && (action === "licencas" || action === "licenses")) {
    const body = await req.json().catch(() => ({}));
    const metodo = String(body.metodo ?? body.method ?? "").toLowerCase();
    const pacote = String(body.pacote ?? body.pack_id ?? body.pack ?? "").toLowerCase();
    const display_name = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) : "";
    const whatsapp = (typeof body.whatsapp === "string" ? body.whatsapp : "").replace(/\D+/g, "").slice(0, 15);
    const client_id = body.client_id ? String(body.client_id) : null;

    if (!UNIFIED_METHODS.includes(metodo)) {
      await logUsage(400, { error_message: "metodo inválido" });
      return json({ error: "metodo inválido", permitidos: UNIFIED_METHODS }, 400);
    }
    if (!UNIFIED_PACKS.includes(pacote)) {
      await logUsage(400, { error_message: "pacote inválido" });
      return json({ error: "pacote inválido", permitidos: UNIFIED_PACKS }, 400);
    }
    if (metodo === "flow" && !FLOW_ALLOWED_PACKS.has(pacote)) {
      await logUsage(400, { error_message: "pacote indisponível para MétodoFlow" });
      return json({
        error: "Pacote indisponível para MétodoFlow. O provedor entrega no máximo 30 dias ou vitalício.",
        permitidos: Array.from(FLOW_ALLOWED_PACKS),
      }, 400);
    }
    const guard = await getDeliveryGuard(svc);
    const denied = assertDeliveryAllowed(metodo, guard);
    if (denied) {
      await logUsage(denied.status, { error_message: denied.error });
      return json({ error: denied.error, code: denied.code, active_method: guard.activeMethod }, denied.status);
    }
    if (display_name.length < 2) {
      await logUsage(400, { error_message: "display_name obrigatório" });
      return json({ error: "display_name obrigatório (>= 2 chars)" }, 400);
    }
    if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) {
      await logUsage(400, { error_message: "whatsapp inválido" });
      return json({ error: "whatsapp inválido" }, 400);
    }

    if (client_id) {
      const { data: prof } = await svc.from("profiles")
        .select("id,reseller_id").eq("id", client_id).maybeSingle();
      if (!prof || prof.reseller_id !== reseller.id) {
        await logUsage(403, { error_message: "client_id não pertence ao revendedor" });
        return json({ error: "client_id não pertence a você" }, 403);
      }
    }

    // Preço de custo do método/pacote no nível atual
    const { data: tierData } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
    const tier: any = Array.isArray(tierData) ? tierData[0] : tierData;
    if (!tier?.id) {
      await logUsage(400, { error_message: "Nível não definido" });
      return json({ error: "Nível do revendedor não definido" }, 400);
    }

    // Fonte única de custo: RPC com fallback Ouro embutido.
    const { data: costData } = await svc.rpc("get_license_pack_cost", {
      _reseller_id: reseller.id,
      _duration_code: pacote,
    });
    let price_cents = Number(costData ?? 0);
    if (!isSubscription && (!price_cents || price_cents <= 0)) {
      await logUsage(400, { error_message: "Preço não configurado" });
      return json({ error: "Preço não configurado para esse pacote no seu nível" }, 400);
    }
    if (isSubscription) price_cents = 0;
    const license_type = `${metodo}_${pacote}`;

    // Cria pedido pendente
    const { data: order, error: ordErr } = await svc.from("orders").insert({
      reseller_id: reseller.id,
      client_id,
      license_type,
      price_cents,
      status: "pending",
      api_key_id: keyRow.id,
      product_type: "extension",
      notes: JSON.stringify({ method: metodo, pack_id: pacote, display_name, whatsapp: whatsapp || null, source: "unified_api", billing_mode: isSubscription ? "subscription" : (isPack ? "pack" : "normal") }),
    }).select().single();
    if (ordErr || !order) {
      await logUsage(500, { error_message: "Falha pedido" });
      return json({ error: "Falha ao criar pedido" }, 500);
    }

    // Cobrança: Pacote (modo pack + delivery_source=pack) com fallback Saldo.
    let usedPack2 = false;
    let fallbackFromPack2 = false;
    if (!isSubscription) {
      if (deliveryFromPack) {
        const { data: consumed, error: consumeErr } = await svc.rpc(
          "pack_try_consume_sale_credit",
          { _reseller_id: reseller.id, _order_id: order.id, _description: `API ${metodo.toUpperCase()} ${pacote}` },
        );
        if (consumeErr) {
          await svc.from("orders").update({ status: "failed", error_message: consumeErr.message }).eq("id", order.id);
          await logUsage(500, { error_message: consumeErr.message });
          return json({ error: consumeErr.message }, 500);
        }
        if (typeof consumed === "number" && consumed >= 0) usedPack2 = true;
        else fallbackFromPack2 = true;
      }
      if (!usedPack2) {
        const debitRpc = fallbackFromPack2 ? "debit_reseller_balance_pack_fallback" : "debit_reseller_balance";
        const debitArgs: Record<string, unknown> = {
          _reseller_id: reseller.id,
          _amount_cents: price_cents,
          _kind: "api_debit",
          _description: fallbackFromPack2
            ? `API ${metodo.toUpperCase()} ${pacote} (fallback pacote esgotado)`
            : `API ${metodo.toUpperCase()} ${pacote}`,
          _reference_id: order.id,
        };
        if (fallbackFromPack2) debitArgs._promotion_id = null;
        const { data: ok, error: debErr } = await svc.rpc(debitRpc, debitArgs);
        if (debErr || !ok) {
          await svc.from("orders").update({
            status: "failed",
            error_message: debErr?.message ?? (fallbackFromPack2 ? "Pacote esgotado e saldo insuficiente" : "Saldo insuficiente"),
          }).eq("id", order.id);
          await logUsage(402, { error_message: "Saldo insuficiente" });
          return json({ error: fallbackFromPack2 ? "Pacote esgotado e saldo insuficiente" : "Saldo insuficiente" }, 402);
        }
      }
    }

    // Função de estorno em caso de falha do provedor
    const refund = async (reason: string, providerResp?: unknown) => {
      if (!isSubscription && !usedPack2) {
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: reseller.id,
          _amount_cents: price_cents,
          _kind: "api_refund",
          _description: `Estorno API ${metodo}/${pacote}: ${reason}`,
          _reference_id: order.id,
        });
      }
      if (usedPack2) {
        await svc.rpc("pack_refund_credit", {
          _reseller_id: reseller.id,
          _order_id: order.id,
          _description: `Estorno API ${metodo}/${pacote}: ${reason}`,
        }).then((r: any) => r.error && console.warn("pack_refund_credit failed", r.error));
      }
      await svc.from("orders").update({
        status: "refunded",
        error_message: reason,
        provider_response: providerResp ?? null,
      }).eq("id", order.id);
    };

    // Chama o provedor REAL (igual place-method-license-order) — não gera chave local
    let providerData: any = null;
    let license_key: string | null = null;
    try {
      if (metodo === "lovax") {
        const { data: settings } = await svc
          .from("app_settings")
          .select("key,value")
          .in("key", ["lovax_api_token", "lovax_base_url"]);
        const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
        const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined)
          || DEFAULT_LOVAX_BASE;
        if (!tk) {
          await refund("MétodoLovax não configurado pelo gerente");
          await logUsage(500, { error_message: "MétodoLovax não configurado" });
          return json({ error: "MétodoLovax não configurado pelo gerente" }, 500);
        }
        const r = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_license",
            payload: {
              customer_name: display_name,
              days: packToLovaxDays(pacote),
              hours: 0,
              minutes: 0,
              max_devices: 1,
            },
          }),
        });
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
        if (!r.ok || !providerData?.success) {
          await refund(providerData?.error ?? `Lovax retornou ${r.status}`, providerData);
          await logUsage(502, { error_message: "Falha Lovax" });
          return json({ error: "Falha no MétodoLovax", details: providerData }, 502);
        }
        license_key = providerData?.license?.license_key ?? providerData?.license_key ?? providerData?.key ?? null;
      } else {
        const { data: cfg } = await svc.from("provider_settings")
          .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
        const base = cfg?.base_url ?? DEFAULT_BASE;
        if (!apiKey) {
          await refund("MétodoFlow não configurado pelo gerente");
          await logUsage(500, { error_message: "MétodoFlow não configurado" });
          return json({ error: "MétodoFlow não configurado pelo gerente" }, 500);
        }
        const r = await fetch(`${base}/generate-license`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ ...packToFlowBody(pacote), display_name }),
        });
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
        if (!r.ok) {
          await refund(`MétodoFlow retornou ${r.status}`, providerData);
          await logUsage(502, { error_message: `Provedor ${r.status}` });
          return json({ error: "Falha no MétodoFlow", details: providerData }, 502);
        }
        license_key = providerData?.key ?? providerData?.license_key ?? providerData?.license ?? null;
      }
    } catch (e) {
      await refund(e instanceof Error ? e.message : "Erro no provedor");
      await logUsage(502, { error_message: "Erro provedor" });
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    if (!license_key) {
      await refund("Provedor não retornou chave de licença", providerData);
      await logUsage(502, { error_message: "Sem license_key" });
      return json({ error: "Provedor não retornou chave de licença" }, 502);
    }

    await svc.from("orders").update({
      status: "completed",
      license_key,
      provider_response: providerData,
      notes: JSON.stringify({
        method: metodo,
        pack_id: pacote,
        display_name,
        whatsapp: whatsapp || null,
        source: "unified_api",
        billing_mode: isSubscription ? "subscription" : (isPack ? "pack" : "normal"),
        delivery_source: deliveryFromPack ? (usedPack2 ? "pack" : "wallet_fallback") : "wallet",
        fallback_from_pack: fallbackFromPack2,
      }),
    }).eq("id", order.id);
    await svc.rpc("add_reseller_spent", { _reseller_id: reseller.id, _amount_cents: price_cents });
    await logUsage(200, { cost_cents: price_cents, license_type, license_key });

    // Webhook (best-effort)
    if (keyRow.webhook_url) {
      const payload = {
        event: "license.generated",
        order_id: order.id,
        reseller_id: reseller.id,
        license_type,
        metodo,
        pacote,
        license_key,
        price_cents,
        created_at: new Date().toISOString(),
      };
      try {
        const resp = await fetch(keyRow.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const respText = await resp.text().catch(() => "");
        await svc.from("reseller_api_webhook_deliveries").insert({
          api_key_id: keyRow.id, reseller_id: reseller.id,
          event: "license.generated", target_url: keyRow.webhook_url,
          payload, response_status: resp.status,
          response_body: respText.slice(0, 1000),
          delivered_at: new Date().toISOString(),
        });
      } catch (e) {
        await svc.from("reseller_api_webhook_deliveries").insert({
          api_key_id: keyRow.id, reseller_id: reseller.id,
          event: "license.generated", target_url: keyRow.webhook_url,
          payload, response_status: 0,
          response_body: e instanceof Error ? e.message : "fetch failed",
        });
      }
    }

    return json({
      ok: true,
      order_id: order.id,
      license_key,
      metodo,
      pacote,
      price_cents,
      display_name,
    });
  }

  // ---------- POST /licencas-trial ----------
  // Body: { metodo, display_name } — trial 15min vinculado ao método escolhido
  if (req.method === "POST" && (action === "licencas-trial" || action === "trial")) {
    const body = await req.json().catch(() => ({}));
    const metodo = String(body.metodo ?? body.method ?? "").toLowerCase();
    const display_name = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) : "Cliente Teste";

    if (!UNIFIED_METHODS.includes(metodo)) {
      await logUsage(400, { error_message: "metodo inválido" });
      return json({ error: "metodo inválido", permitidos: UNIFIED_METHODS }, 400);
    }
    const guard = await getDeliveryGuard(svc);
    const denied = assertDeliveryAllowed(metodo, guard);
    if (denied) {
      await logUsage(denied.status, { error_message: denied.error });
      return json({ error: denied.error, code: denied.code, active_method: guard.activeMethod }, denied.status);
    }

    // Limite diário de trial (override do revendedor > tier)
    const { data: resellerRow } = await svc.from("resellers")
      .select("test_keys_per_day_override").eq("id", reseller.id).maybeSingle();
    let dailyLimit: number;
    if (resellerRow?.test_keys_per_day_override != null) {
      dailyLimit = Number(resellerRow.test_keys_per_day_override);
    } else {
      const { data: tierRows } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
      const tierObj: any = Array.isArray(tierRows) ? tierRows[0] : tierRows;
      dailyLimit = Number(tierObj?.test_keys_per_day ?? 10);
    }
    if (dailyLimit <= 0) {
      await logUsage(403, { error_message: "Trial bloqueado pelo nível" });
      return json({ error: "Seu nível não permite trials. Faça upgrade." }, 403);
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const since = today.toISOString();
    const { count } = await svc.from("orders")
      .select("id", { count: "exact", head: true })
      .eq("reseller_id", reseller.id).eq("is_test", true).gte("created_at", since);
    if ((count ?? 0) >= dailyLimit) {
      await logUsage(429, { error_message: "Limite diário atingido" });
      return json({ error: `Limite de ${dailyLimit} trial(s)/dia atingido` }, 429);
    }

    // Chama provedor
    const { data: cfg } = await svc.from("provider_settings")
      .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const provKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? DEFAULT_BASE;
    if (!provKey) {
      await logUsage(500, { error_message: "Provedor offline" });
      return json({ error: "Provedor não configurado" }, 500);
    }

    let providerData: any = null;
    try {
      const r = await fetch(`${base}/generate-trial`, {
        method: "POST",
        headers: { "x-api-token": provKey, "x-api-key": provKey, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name, minutes: 15, seconds: 0, method: metodo, extension: metodo }),
      });
      const text = await r.text();
      try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
      if (!r.ok) {
        await logUsage(502, { error_message: `Provedor ${r.status}` });
        return json({ error: "Provedor falhou", details: providerData }, 502);
      }
    } catch (e) {
      await logUsage(502, { error_message: e instanceof Error ? e.message : "fetch error" });
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    const license_key = providerData?.license_key ?? providerData?.key ?? null;
    const license_type = `${metodo}_trial`;

    // Registra pedido teste (sem custo) para contagem do limite diário
    await svc.from("orders").insert({
      reseller_id: reseller.id,
      license_type,
      price_cents: 0,
      status: "completed",
      is_test: true,
      license_key,
      api_key_id: keyRow.id,
      product_type: "extension",
      notes: JSON.stringify({ method: metodo, source: "unified_api", trial: true }),
    });

    await logUsage(200, { license_type, license_key: license_key ?? undefined });
    return json({
      ok: true,
      license_key,
      metodo,
      tipo: "trial",
      minutos: providerData?.minutes ?? 15,
      expira_em: providerData?.expires_at,
      restantes_hoje: Math.max(0, dailyLimit - ((count ?? 0) + 1)),
      limite_diario: dailyLimit,
    });
  }

  if (req.method === "POST" && LICENSE_ACTIONS.includes(action)) {
    const body = await req.json().catch(() => ({}));
    const license_key = typeof body.license_key === "string" ? body.license_key.trim() : "";
    if (!license_key) {
      await logUsage(400, { error_message: "license_key ausente" });
      return json({ error: "license_key obrigatório" }, 400);
    }

    // Valida ownership: licença precisa ter sido gerada pela própria chave em uso
    // (pedidos antigos sem api_key_id mantêm fallback pelo reseller_id).
    const { data: ownerOrder } = await svc.from("orders")
      .select("id, api_key_id, reseller_id, status, is_legacy")
      .eq("license_key", license_key)
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ownerOrder) {
      await logUsage(404, { error_message: "Licença não pertence a esta chave", license_key });
      return json({ error: "Licença não encontrada para esta chave" }, 404);
    }
    if (ownerOrder.api_key_id && ownerOrder.api_key_id !== keyRow.id) {
      await logUsage(404, { error_message: "Licença gerada por outra chave", license_key });
      return json({ error: "Licença não encontrada para esta chave" }, 404);
    }
    if (ownerOrder.is_legacy) {
      await logUsage(409, { error_message: "Licença legado", license_key });
      return json({ error: "Licença legado: gerada pelo provedor anterior, não pode mais ser gerenciada." }, 409);
    }

    // Provedor
    const { data: cfg } = await svc.from("provider_settings")
      .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const provKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? DEFAULT_BASE;
    if (!provKey) {
      await logUsage(502, { error_message: "Provedor não configurado", license_key });
      return json({ error: "Provedor não configurado" }, 502);
    }

    let providerData: any = null;
    let providerStatus = 0;
    try {
      const r = await fetch(`${base}/${action}`, {
        method: "POST",
        headers: { "x-api-token": provKey, "x-api-key": provKey, "Content-Type": "application/json" },
        body: JSON.stringify({ license_key }),
      });
      providerStatus = r.status;
      const text = await r.text();
      try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
    } catch (e) {
      await logUsage(502, { error_message: e instanceof Error ? e.message : "fetch error", license_key });
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    if (providerStatus < 200 || providerStatus >= 300) {
      await logUsage(providerStatus || 502, { error_message: `Provedor ${providerStatus}`, license_key });
      return json({ error: "Provedor falhou", details: providerData }, providerStatus || 502);
    }

    // Atualiza estado local do pedido
    if (action === "revoke-license") {
      await svc.from("orders").update({ status: "revoked" }).eq("id", ownerOrder.id);
    } else if (action === "delete-license") {
      await svc.from("orders").update({ status: "deleted", license_key: null }).eq("id", ownerOrder.id);
    }

    await logUsage(200, { license_key, license_type: undefined });
    return json({
      success: true,
      action,
      license_key,
      provider: providerData ?? null,
    });
  }

  await logUsage(404, { error_message: "Endpoint inexistente" });
  return json({ error: "Endpoint não encontrado", action }, 404);
});
