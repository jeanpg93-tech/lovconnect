import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MISTIC_BASE = "https://api.misticpay.com/api";
const ALLOWED_TYPES = ["1d", "7d", "30d", "90d", "365d", "pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];
// MétodoFlow tem teto de 60 dias no provedor — bloqueia 90d/365d quando a loja entrega via Flow.
const FLOW_DISALLOWED_TYPES = new Set(["90d", "365d"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const reseller_slug = String(body.reseller_slug ?? "").trim();
    const extension_id = body.extension_id ? String(body.extension_id) : null;
    const license_type = body.license_type ? String(body.license_type) : null;
    const recharge_id = body.recharge_id ? String(body.recharge_id) : null;
    const recharge_plan_id = body.recharge_plan_id ? String(body.recharge_plan_id) : null;

    const buyer_name = typeof body.buyer_name === "string" ? body.buyer_name.trim().slice(0, 100) : "";
    const whatsapp_raw = typeof body.buyer_whatsapp === "string" ? body.buyer_whatsapp : "";
    const buyer_whatsapp = whatsapp_raw.replace(/\D+/g, "").slice(0, 15);
    const payer_document = typeof body.payer_document === "string"
      ? body.payer_document.replace(/\D+/g, "")
      : "";

    if (!reseller_slug) return json({ error: "Loja inválida" }, 400);
    
    // Validation: must have either license_type or recharge_id
    if (!license_type && !recharge_id && !recharge_plan_id) {
      return json({ error: "Selecione um produto" }, 400);
    }

    if (license_type && !ALLOWED_TYPES.includes(license_type)) {
      return json({ error: "Tipo de licença inválido" }, 400);
    }

    if (buyer_name.length < 2) return json({ error: "Informe seu nome" }, 400);
    if (buyer_whatsapp.length < 10) return json({ error: "WhatsApp inválido" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // resolve reseller
    const { data: reseller } = await admin
      .from("resellers")
      .select("id, display_name, is_active, activation_status, recharge_plans_enabled")
      .eq("slug", reseller_slug)
      .maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "Loja indisponível" }, 404);
    if (reseller.activation_status && reseller.activation_status !== "active") {
      return json({ error: "Loja indisponível" }, 404);
    }

    // storefront config
    const { data: store } = await admin
      .from("reseller_storefronts")
      .select("*")
      .eq("reseller_id", reseller.id)
      .maybeSingle();
    if (!store || !store.is_enabled) return json({ error: "Loja desativada" }, 404);

    // resolve price and product details
    let price_cents = 0;
    let product_type = "extension";
    let credit_amount = null;
    let resolved_plan: any = null;
    let plan_cost_cents = 0;

    if (recharge_plan_id) {
      // ===== Venda de Plano de Recarga (3.000 créditos / 30 dias etc) =====
      // Feature gate: liberada globalmente ou apenas para revendedores marcados
      const { data: gFlag } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "recharge_plans_enabled_globally")
        .maybeSingle();
      const globallyEnabled = (gFlag?.value as any) === true;
      if (!globallyEnabled && !(reseller as any).recharge_plans_enabled) {
        return json({ error: "Plano de recarga ainda não liberado para esta loja" }, 403);
      }
      // Manutenção global de vendas do Plano 3K
      const { data: pauseRow } = await admin
        .from("app_settings")
        .select("value")
        .eq("key", "plano3k_sales_paused")
        .maybeSingle();
      const pause = (pauseRow?.value as any) || {};
      if (pause.enabled === true) {
        return json({
          error: pause.message || "Vendas do plano temporariamente em manutenção.",
        }, 503);
      }
      const { data: plan } = await admin
        .from("recharge_plans")
        .select("*")
        .eq("id", recharge_plan_id)
        .maybeSingle();
      if (!plan || !plan.is_active) {
        return json({ error: "Plano indisponível" }, 400);
      }
      if (!plan.bot_owner_email) {
        return json({ error: "Plano sem configuração de bot — fale com o suporte" }, 400);
      }
      const { data: rp } = await admin
        .from("reseller_recharge_plan_prices")
        .select("sale_price_cents, is_active, show_on_storefront")
        .eq("reseller_id", reseller.id)
        .eq("plan_id", recharge_plan_id)
        .maybeSingle();
      if (!rp || !rp.is_active || !rp.show_on_storefront) {
        return json({ error: "Este plano não está disponível nessa loja" }, 400);
      }
      if (!rp.sale_price_cents || rp.sale_price_cents <= 0) {
        return json({ error: "Preço de venda do plano não definido" }, 400);
      }
      price_cents = Number(rp.sale_price_cents);
      plan_cost_cents = Number(plan.base_cost_cents);
      product_type = "recharge_plan";
      resolved_plan = plan;
    } else if (recharge_id) {
      // It's a credit recharge
      const { data: rec, error: recErr } = await admin
        .from("reseller_credit_prices")
        .select("price_cents, credits_amount, is_active")
        .eq("id", recharge_id)
        .eq("reseller_id", reseller.id)
        .maybeSingle();
      
      if (recErr || !rec || !rec.is_active) {
        return json({ error: "Pacote de créditos inválido ou inativo" }, 400);
      }
      
      price_cents = rec.price_cents;
      product_type = "credits";
      credit_amount = rec.credits_amount;
    } else if (license_type) {
      // It's a license purchase
      const method = (store as any).extension_method === "lovax" ? "lovax" : "flow";
      if (method === "flow" && FLOW_DISALLOWED_TYPES.has(license_type)) {
        return json({
          error: "Pacote indisponível para MétodoFlow. Disponíveis: 1d, 7d, 30d, vitalício.",
        }, 400);
      }
      const { data: methodPrice } = await admin
        .from("reseller_license_prices")
        .select("price_cents")
        .eq("reseller_id", reseller.id)
        .eq("method", method)
        .eq("pack_id", license_type)
        .gt("price_cents", 0)
        .maybeSingle();
      if (methodPrice?.price_cents) {
        price_cents = methodPrice.price_cents;
      } else if (extension_id) {
        // legado: vitrine por extensão
        if (!(store.visible_extension_ids as string[] | null)?.includes(extension_id)) {
          return json({ error: "Produto indisponível" }, 400);
        }
        const customKey = `${extension_id}:${license_type}`;
        const customMap = (store.custom_prices ?? {}) as Record<string, number>;
        if (Number.isInteger(customMap[customKey]) && customMap[customKey] > 0) {
          price_cents = customMap[customKey];
        }
        if (!price_cents) {
          const { data: rep } = await admin
            .from("reseller_extension_prices")
            .select("price_cents,is_active")
            .eq("reseller_id", reseller.id)
            .eq("extension_id", extension_id)
            .eq("license_type", license_type)
            .maybeSingle();
          if (rep?.is_active && rep.price_cents > 0) price_cents = rep.price_cents;
        }
      } else {
        // pacote global cadastrado pelo revendedor (sem extensão)
        const { data: rep } = await admin
          .from("reseller_extension_prices")
          .select("price_cents,is_active")
          .eq("reseller_id", reseller.id)
          .is("extension_id", null)
          .eq("license_type", license_type)
          .maybeSingle();
        if (rep?.is_active && rep.price_cents > 0) price_cents = rep.price_cents;
      }
    }

    if (!price_cents) return json({ error: "Preço não definido para esse produto" }, 400);

    // ============================================================
    // VALIDAÇÃO DE PRECIFICAÇÃO (proteção contra venda com prejuízo / margem zero / custo indefinido)
    // Calcula o CUSTO desse produto para o revendedor e compara com o preço de venda (price_cents).
    // ============================================================
    let cost_cents = 0;
    if (product_type === "recharge_plan") {
      cost_cents = plan_cost_cents;
    } else if (product_type === "credits") {
      // créditos: usa a RPC oficial que considera override individual + tier + Partner→Ouro
      const { data: planRow } = await admin
        .from("credit_pricing_plans")
        .select("id")
        .eq("credits_amount", credit_amount)
        .eq("is_active", true)
        .maybeSingle();
      if (planRow?.id) {
        const { data: c } = await admin.rpc("get_credit_pack_cost", {
          _reseller_id: reseller.id,
          _plan_id: planRow.id,
        });
        cost_cents = Number(c ?? 0);
      }
    } else if (license_type) {
      // Fonte única: tier_license_prices via RPC (com fallback Ouro).
      const { data: c } = await admin.rpc("get_license_pack_cost", {
        _reseller_id: reseller.id,
        _duration_code: license_type,
      });
      cost_cents = Number(c ?? 0);
    }

    if (cost_cents <= 0) {
      return json({
        error: "Este produto está temporariamente indisponível. O custo ainda não foi definido pelo administrador.",
        reason: "cost_missing",
      }, 400);
    }
    if (price_cents < cost_cents) {
      return json({
        error: "Este produto está temporariamente indisponível. O preço de venda está abaixo do custo.",
        reason: "sale_below_cost",
      }, 400);
    }
    if (price_cents === cost_cents) {
      return json({
        error: "Este produto está temporariamente indisponível. O preço de venda não cobre a margem mínima.",
        reason: "margin_zero",
      }, 400);
    }

    // reseller MisticPay credentials are required
    const { data: integ } = await admin
      .from("reseller_integrations")
      .select("misticpay_enabled, misticpay_client_id, misticpay_client_secret")
      .eq("reseller_id", reseller.id)
      .maybeSingle();
    if (!integ?.misticpay_enabled || !integ.misticpay_client_id || !integ.misticpay_client_secret) {
      return json({ error: "Loja sem PIX configurado" }, 400);
    }

    // create order row
    // PIX da MisticPay expira em ~30 min — guardamos a data limite para a rotina de expiração marcar como 'expirado'.
    const expiresAtIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { data: order, error: oerr } = await admin
      .from("storefront_orders")
      .insert({
        reseller_id: reseller.id,
        extension_id,
        license_type: license_type ?? (product_type === "recharge_plan" ? "recharge_plan" : "credits"),
        buyer_name,
        buyer_whatsapp,
        price_cents,
        product_type,
        credit_amount,
        provider: "misticpay",
        status: "pending",
        expires_at: expiresAtIso,
        recharge_plan_id: recharge_plan_id,
        cost_cents: product_type === "recharge_plan" ? plan_cost_cents : null,
      })
      .select()
      .single();
    if (oerr || !order) return json({ error: oerr?.message ?? "Falha ao criar pedido" }, 500);

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supaUrl}/functions/v1/misticpay-webhook`;

    const mpResp = await fetch(`${MISTIC_BASE}/transactions/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ci: integ.misticpay_client_id,
        cs: integ.misticpay_client_secret,
      },
      body: JSON.stringify({
        amount: price_cents / 100,
        payerName: buyer_name,
        payerDocument: payer_document || "00000000000",
        transactionId: order.id,
        description: product_type === "recharge_plan"
          ? `Plano ${resolved_plan?.name ?? "Recarga"} — ${reseller.display_name ?? reseller_slug}`
          : `Loja ${reseller.display_name ?? reseller_slug}`,
        projectWebhook: webhookUrl,
      }),
    });
    const mpJson = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("storefront_orders").update({
        status: "failed",
        raw_response: mpJson,
        error_message: mpJson?.message ?? `MisticPay ${mpResp.status}`,
      }).eq("id", order.id);
      return json({ error: mpJson?.message ?? "Erro no PIX", details: mpJson }, 502);
    }
    const d = mpJson.data ?? {};
    await admin.from("storefront_orders").update({
      provider_transaction_id: String(d.transactionId ?? ""),
      qr_code_base64: d.qrCodeBase64 ?? null,
      copy_paste: d.copyPaste ?? null,
      raw_response: mpJson,
    }).eq("id", order.id);

    return json({
      id: order.id,
      order_id: order.id,
      short_code: (order as any).short_code ?? null,
      product_type,
      credit_amount,
      qr_code_base64: d.qrCodeBase64,
      copy_paste: d.copyPaste,
      amount_cents: price_cents,
      expires_at: expiresAtIso,
    });
  } catch (e) {
    console.error("storefront-create-order", e);
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
