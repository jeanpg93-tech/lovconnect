import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const DEFAULT_PROVIDER_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
// MétodoFlow tem teto de 60 dias no provedor — bloqueia 90d/365d como defesa adicional.
const FLOW_DISALLOWED_TYPES = new Set(["90d", "365d"]);

function mapTypeToProviderBody(type: string): Record<string, unknown> {
  switch (type) {
    case "1d": return { days: 1 };
    case "7d": return { days: 7 };
    case "30d": return { days: 30 };
    case "90d": return { days: 90 };
    case "365d": return { days: 365 };
    case "pro_1d": return { days: 1 };
    case "pro_7d": return { days: 7 };
    case "pro_15d": return { days: 15 };
    case "pro_30d": return { days: 30 };
    case "lifetime": return { lifetime: true };
    default: return { days: 30 };
  }
}

async function createProviderCreditOrder(admin: any, order: any, costCents: number) {
  const { data: master } = await admin
    .from("app_settings").select("value").eq("key", "lovable_credits_master").maybeSingle();
  const apiKey = (master?.value?.api_key as string | undefined) ?? null;
  if (!apiKey) return { ok: false as const, error: "Provedor de créditos não configurado" };
  let providerData: any = null;
  try {
    const r = await fetch("https://lojinhalovable.com/api/v1/revenda/pedidos", {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ creditos: order.credit_amount, tipo_entrega: "workspace_proprio" }),
    });
    const txt = await r.text();
    try { providerData = JSON.parse(txt); } catch { providerData = { raw: txt }; }
    if (!r.ok || providerData?.success === false) {
      return { ok: false as const, error: providerData?.error ?? `Provedor retornou ${r.status}`, providerData };
    }
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "erro provedor de créditos" };
  }
  const payload = providerData?.data ?? providerData;
  const providerPedidoId: string | null = payload?.pedidoId ?? payload?.id ?? null;
  if (!providerPedidoId) return { ok: false as const, error: "Provedor não retornou pedidoId", providerData };
  try {
    await admin.from("reseller_credit_purchases").insert({
      reseller_id: order.reseller_id,
      credits: order.credit_amount,
      price_cents: costCents,
      cost_cents: costCents || null,
      status: payload?.status ?? "processando",
      tipo_entrega: "workspace_proprio",
      provider_pedido_id: providerPedidoId,
      provider_response: providerData,
      customer_name: order.buyer_name ?? null,
      customer_whatsapp: order.buyer_whatsapp ?? null,
      storefront_order_id: order.id,
    });
  } catch (e) { console.warn("reseller_credit_purchases insert (release) failed", e); }
  return { ok: true as const, providerPedidoId, providerData };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (req.headers.get("Authorization") !== `Bearer ${SERVICE_ROLE}`) {
      return json({ error: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? "");
    if (!orderId) return json({ error: "missing order_id" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order } = await admin
      .from("storefront_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) return json({ error: "order not found" }, 404);
    if (order.status === "completed") return json({ ok: true, already: true });
    if (order.status !== "paid") return json({ ok: false, status: order.status }, 200);

    // Créditos: já está pago, só marca completed e registra orders
    if (order.product_type === "credits" || order.license_type === "credits") {
      const credits_cost = Number(order.cost_cents ?? 0);
      // Respeita o modo global: se a plataforma está em manual, NÃO chama o provedor —
      // cria um pedido manual local e deixa a equipe processar.
      let globalMode = "automatico";
      try {
        const { data: rs } = await admin
          .from("app_settings").select("value").eq("key", "recargas_settings").maybeSingle();
        if ((rs?.value as any)?.active_mode === "manual") globalMode = "manual";
      } catch (_e) {}
      if (globalMode === "manual") {
        const localPedidoId = crypto.randomUUID();
        const manualPayload = {
          manual: true,
          pedidoId: localPedidoId,
          status: "manual_pendente",
          creditos: order.credit_amount,
          precoCentavos: credits_cost,
          mode: "manual",
          source: "storefront",
        };
        try {
          await admin.from("reseller_credit_purchases").insert({
            reseller_id: order.reseller_id,
            credits: order.credit_amount,
            price_cents: credits_cost,
            cost_cents: credits_cost || null,
            status: "manual_pendente",
            tipo_entrega: "workspace_proprio",
            provider_pedido_id: localPedidoId,
            provider_response: manualPayload,
            customer_name: order.buyer_name ?? null,
            customer_whatsapp: order.buyer_whatsapp ?? null,
            storefront_order_id: order.id,
          });
        } catch (e) { console.warn("manual credits insert failed", e); }
        const inviteLink = `/recargas/${localPedidoId}`;
        await admin.from("storefront_orders").update({
          status: "completed",
          invite_link: inviteLink,
        }).eq("id", order.id);
        try {
          await admin.from("orders").insert({
            reseller_id: order.reseller_id,
            client_id: null,
            customer_id: null,
            extension_id: null,
            license_type: "credits",
            product_type: "credits",
            credit_amount: order.credit_amount,
            price_cents: credits_cost,
            status: "pending",
            is_test: false,
            notes: `Venda da Loja • ${order.buyer_name} • ${order.credit_amount ?? 0} créditos • MODO MANUAL • ID Local: ${localPedidoId}`,
          });
        } catch (e) { console.warn("orders insert (manual release credits) failed", e); }
        return json({ ok: true, kind: "credits_released_manual", invite_link: inviteLink });
      }
      const prov = await createProviderCreditOrder(admin, order, credits_cost);
      if (!prov.ok) {
        if (credits_cost > 0) {
          await admin.rpc("credit_reseller_balance", {
            _reseller_id: order.reseller_id,
            _amount_cents: credits_cost,
            _kind: "order_refund",
            _description: `Estorno (falha provedor créditos release): ${order.id}`,
            _reference_id: order.id,
          });
        }
        await admin.from("storefront_orders").update({
          status: "failed",
          error_message: prov.error,
        }).eq("id", order.id);
        return json({ ok: false, error: prov.error }, 502);
      }
      const inviteLink = `/recargas/${prov.providerPedidoId}`;
      await admin.from("storefront_orders").update({
        status: "completed",
        invite_link: inviteLink,
      }).eq("id", order.id);
      try {
        await admin.from("orders").insert({
          reseller_id: order.reseller_id,
          client_id: null,
          customer_id: null,
          extension_id: null,
          license_type: "credits",
          product_type: "credits",
          credit_amount: order.credit_amount,
          price_cents: credits_cost,
          status: "completed",
          is_test: false,
          notes: `Venda da Loja • ${order.buyer_name} • ${order.credit_amount ?? 0} créditos (liberado após recarga) • Provedor: ${prov.providerPedidoId}`,
        });
      } catch (e) { console.warn("orders insert (release credits) failed", e); }
      return json({ ok: true, kind: "credits_released", invite_link: inviteLink });
    }

    // Licença: chama provedor
    const { data: storeCfg } = await admin
      .from("reseller_storefronts")
      .select("extension_method")
      .eq("reseller_id", order.reseller_id)
      .maybeSingle();
    const method: "flow" | "lovax" =
      (storeCfg as any)?.extension_method === "lovax" ? "lovax" : "flow";

    const cost_cents = Number(order.cost_cents ?? 0);
    let providerData: any = null;
    let license_key: string | null = null;

    try {
      if (method === "lovax") {
        const { data: settings } = await admin
          .from("app_settings")
          .select("key,value")
          .in("key", ["lovax_api_token", "lovax_base_url"]);
        const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
        const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined)
          || "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";
        if (!tk) {
          await failAndRefund(admin, order, cost_cents, "Lovax não configurado");
          return json({ ok: false, error: "lovax not configured" }, 500);
        }
        const mapped = mapTypeToProviderBody(order.license_type);
        const r = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_license",
            payload: {
              customer_name: order.buyer_name,
              days: (mapped as any).days ?? 30,
              hours: 0,
              minutes: 0,
              max_devices: 1,
            },
          }),
        });
        const txt = await r.text();
        try { providerData = JSON.parse(txt); } catch { providerData = { raw: txt }; }
        if (!r.ok || !providerData?.success) {
          await failAndRefund(admin, order, cost_cents, providerData?.error ?? `Lovax retornou ${r.status}`, providerData);
          return json({ ok: false, error: "lovax failed" }, 502);
        }
        license_key = providerData?.license?.license_key ?? providerData?.license_key ?? providerData?.key ?? null;
      } else {
        const { data: cfg } = await admin.from("provider_settings")
          .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
        const base = cfg?.base_url ?? DEFAULT_PROVIDER_BASE;
        if (!apiKey) {
          await failAndRefund(admin, order, cost_cents, "Flow não configurado");
          return json({ ok: false, error: "no provider api key" }, 500);
        }
        const r = await fetch(`${base}/generate-license`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...mapTypeToProviderBody(order.license_type),
            display_name: order.buyer_name,
          }),
        });
        const txt = await r.text();
        try { providerData = JSON.parse(txt); } catch { providerData = { raw: txt }; }
        if (!r.ok) {
          await failAndRefund(admin, order, cost_cents, `Flow retornou ${r.status}`, providerData);
          return json({ ok: false, error: "provider failed" }, 502);
        }
        license_key = providerData?.key ?? providerData?.license_key ?? providerData?.license ?? null;
      }
    } catch (e) {
      await failAndRefund(admin, order, cost_cents, e instanceof Error ? e.message : "erro provedor");
      return json({ ok: false, error: "provider error" }, 502);
    }

    await admin.from("storefront_orders").update({
      status: "completed",
      license_key,
    }).eq("id", order.id);

    let customer_id: string | null = null;
    try {
      const { data: existing } = await admin
        .from("reseller_customers")
        .select("id")
        .eq("reseller_id", order.reseller_id)
        .eq("whatsapp", order.buyer_whatsapp)
        .maybeSingle();
      if (existing) {
        customer_id = existing.id;
      } else {
        const { data: created } = await admin.from("reseller_customers").insert({
          reseller_id: order.reseller_id,
          whatsapp: order.buyer_whatsapp,
          display_name: order.buyer_name,
        }).select("id").single();
        customer_id = created?.id ?? null;
      }
    } catch (e) { console.warn("customer upsert failed", e); }

    try {
      await admin.from("orders").insert({
        reseller_id: order.reseller_id,
        client_id: null,
        customer_id,
        extension_id: order.extension_id,
        license_type: order.license_type,
        price_cents: cost_cents,
        status: "completed",
        is_test: false,
        license_key,
        provider_response: providerData,
        notes: `Venda da Loja • ${order.buyer_name} • Recebido R$ ${(Number(order.price_cents) / 100).toFixed(2)} (liberado após recarga)`,
      });
    } catch (e) { console.warn("orders insert failed", e); }

    return json({ ok: true, kind: "license_released" });
  } catch (e) {
    console.error("release-pending-order error", e);
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});

async function failAndRefund(admin: any, order: any, cost_cents: number, msg: string, raw?: any) {
  await admin.from("storefront_orders").update({
    status: "failed",
    error_message: msg,
    raw_response: raw,
  }).eq("id", order.id);
  if (cost_cents > 0) {
    await admin.rpc("credit_reseller_balance", {
      _reseller_id: order.reseller_id,
      _amount_cents: cost_cents,
      _kind: "order_refund",
      _description: `Estorno (release): ${order.id}`,
      _reference_id: order.id,
    });
  }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}