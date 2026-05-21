import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MISTIC_BASE = "https://api.misticpay.com/api";
const ALLOWED_TYPES = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const reseller_slug = String(body.reseller_slug ?? "").trim();
    const extension_id = body.extension_id ? String(body.extension_id) : null;
    const license_type = body.license_type ? String(body.license_type) : null;
    const recharge_id = body.recharge_id ? String(body.recharge_id) : null;

    const buyer_name = typeof body.buyer_name === "string" ? body.buyer_name.trim().slice(0, 100) : "";
    const whatsapp_raw = typeof body.buyer_whatsapp === "string" ? body.buyer_whatsapp : "";
    const buyer_whatsapp = whatsapp_raw.replace(/\D+/g, "").slice(0, 15);
    const payer_document = typeof body.payer_document === "string"
      ? body.payer_document.replace(/\D+/g, "")
      : "";

    if (!reseller_slug) return json({ error: "Loja inválida" }, 400);
    
    // Validation: must have either license_type or recharge_id
    if (!license_type && !recharge_id) {
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
      .select("id, display_name, is_active")
      .eq("slug", reseller_slug)
      .maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "Loja indisponível" }, 404);

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

    if (recharge_id) {
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
      if (extension_id) {
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
    const { data: order, error: oerr } = await admin
      .from("storefront_orders")
      .insert({
        reseller_id: reseller.id,
        extension_id,
        license_type: license_type ?? "credits",
        buyer_name,
        buyer_whatsapp,
        price_cents,
        product_type,
        credit_amount,
        provider: "misticpay",
        status: "pending",
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
        description: `Loja ${reseller.display_name ?? reseller_slug}`,
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
