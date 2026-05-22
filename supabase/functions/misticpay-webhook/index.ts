import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const DEFAULT_PROVIDER_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

async function triggerReleasePending(orderIds: string[]) {
  for (const id of orderIds) {
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/release-pending-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ order_id: id }),
      });
    } catch (e) {
      console.warn("release-pending-order invoke failed", id, e);
    }
  }
}

/**
 * Cria o pedido de recargas no provedor externo (mesma API usada pelo painel manual),
 * registra em reseller_credit_purchases e devolve o provider_pedido_id para o link do cliente.
 */
async function createProviderCreditOrder(admin: any, storeOrder: any, costCents: number) {
  const { data: master } = await admin
    .from("app_settings").select("value").eq("key", "lovable_credits_master").maybeSingle();
  const apiKey = (master?.value?.api_key as string | undefined) ?? null;
  if (!apiKey) {
    return { ok: false as const, error: "Provedor de créditos não configurado" };
  }

  let providerData: any = null;
  try {
    const r = await fetch("https://lojinhalovable.com/api/v1/revenda/pedidos", {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ creditos: storeOrder.credit_amount, tipo_entrega: "workspace_proprio" }),
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
  if (!providerPedidoId) {
    return { ok: false as const, error: "Provedor não retornou pedidoId", providerData };
  }

  try {
    await admin.from("reseller_credit_purchases").insert({
      reseller_id: storeOrder.reseller_id,
      credits: storeOrder.credit_amount,
      price_cents: costCents,
      cost_cents: costCents || null,
      status: payload?.status ?? "processando",
      tipo_entrega: "workspace_proprio",
      provider_pedido_id: providerPedidoId,
      provider_response: providerData,
      customer_name: storeOrder.buyer_name ?? null,
      customer_whatsapp: storeOrder.buyer_whatsapp ?? null,
    });
  } catch (e) {
    console.warn("reseller_credit_purchases insert failed", e);
  }

  return { ok: true as const, providerPedidoId, providerData };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json().catch(() => ({}));
    console.log("misticpay-webhook payload", JSON.stringify(payload));

    const txId = String(payload?.transactionId ?? "");
    const status = String(payload?.status ?? "").toUpperCase();
    const type = String(payload?.transactionType ?? "").toUpperCase();
    if (!txId) return json({ ok: false, reason: "missing transactionId" }, 200);

    if (type && type !== "DEPOSITO") {
      return json({ ok: true, ignored: "non-deposit" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Try recharge intent first
    const { data: intent } = await admin
      .from("recharge_intents")
      .select("*")
      .eq("provider_transaction_id", txId)
      .maybeSingle();

    if (intent) {
      if (intent.status === "paid") return json({ ok: true, already: true });

      if (status === "COMPLETO") {
        const total = Number(intent.amount_cents) + Number(intent.bonus_cents ?? 0);
        // Busca o nível atual para descrever explicitamente o bônus aplicado
        let tierLabel = "";
        if (intent.bonus_cents && Number(intent.bonus_cents) > 0) {
          try {
            const { data: rtier } = await admin.rpc("get_reseller_tier", {
              _reseller_id: intent.reseller_id,
            });
            const rtierRow: any = Array.isArray(rtier) ? rtier[0] : rtier;
            const pct = Math.round(
              (Number(intent.bonus_cents) / Number(intent.amount_cents)) * 100,
            );
            const name = rtierRow?.name ? ` ${rtierRow.name}` : "";
            tierLabel = ` — bônus${name} ${pct}% (+R$ ${(Number(intent.bonus_cents) / 100).toFixed(2)})`;
          } catch (_e) {
            tierLabel = ` (+ bônus R$ ${(Number(intent.bonus_cents) / 100).toFixed(2)})`;
          }
        }
        const { error: credErr } = await admin.rpc("credit_reseller_balance", {
          _reseller_id: intent.reseller_id,
          _amount_cents: total,
          _kind: "recharge",
          _description: `Recarga MisticPay${tierLabel}`,
          _reference_id: intent.id,
        });
        if (credErr) {
          console.error("credit error", credErr);
          return json({ ok: false, error: credErr.message }, 500);
        }
        // Soma o valor da recarga (sem bônus) ao total gasto p/ progresso de nível
        await admin.rpc("add_reseller_spent", {
          _reseller_id: intent.reseller_id,
          _amount_cents: Number(intent.amount_cents),
        });

        // Comissão de indicação (se houver indicador)
        try {
          const { data: ref } = await admin
            .from("reseller_referrals")
            .select("id, referrer_reseller_id")
            .eq("referred_reseller_id", intent.reseller_id)
            .maybeSingle();
          if (ref?.referrer_reseller_id) {
            const { data: tier } = await admin.rpc("get_reseller_tier", {
              _reseller_id: ref.referrer_reseller_id,
            });
            const tierRow: any = Array.isArray(tier) ? tier[0] : tier;
            const pct = Number(tierRow?.referral_commission_percent ?? 0);
            if (pct > 0) {
              const commission = Math.floor((Number(intent.amount_cents) * pct) / 100);
              if (commission > 0) {
                await admin.rpc("credit_reseller_balance", {
                  _reseller_id: ref.referrer_reseller_id,
                  _amount_cents: commission,
                  _kind: "referral_commission",
                  _description: `Comissão de indicação (${pct}% sobre R$ ${(Number(intent.amount_cents) / 100).toFixed(2)})`,
                  _reference_id: intent.id,
                });
                await admin.rpc("add_referral_commission", {
                  _referral_id: ref.id,
                  _amount_cents: commission,
                });
              }
            }
          }
        } catch (e) {
          console.warn("referral commission failed", e);
        }

        await admin.from("recharge_intents").update({
          status: "paid",
          paid_at: new Date().toISOString(),
          raw_response: payload,
        }).eq("id", intent.id);

        // Após creditar saldo, tenta liberar vendas em espera
        try {
          const { data: released } = await admin.rpc("try_release_pending_orders", {
            _reseller_id: intent.reseller_id,
          });
          const ids = Array.isArray(released) ? released.filter(Boolean) : [];
          if (ids.length > 0) {
            // Não await para não travar webhook
            triggerReleasePending(ids as string[]);
          }
        } catch (e) {
          console.warn("try_release_pending_orders failed", e);
        }

        return json({ ok: true, kind: "recharge" });
      }

      if (status === "FALHA" || status === "CANCELADO") {
        await admin.from("recharge_intents").update({
          status: "failed",
          raw_response: payload,
        }).eq("id", intent.id);
        return json({ ok: true });
      }
      return json({ ok: true, status });
    }

    // Otherwise try storefront order
    const { data: storeOrder } = await admin
      .from("storefront_orders")
      .select("*")
      .eq("provider_transaction_id", txId)
      .maybeSingle();

    if (!storeOrder) {
      // Try direct sale (checkout from manager)
      const { data: directSale } = await admin
        .from("direct_sales")
        .select("*")
        .eq("provider_transaction_id", txId)
        .maybeSingle();

      if (directSale) {
        if (directSale.status === "paid") return json({ ok: true, already: true });
        
        // MisticPay status check - common values are "COMPLETO", "PAID", or "SUCCESS"
        const isPaid = status === "COMPLETO" || status === "PAID" || status === "SUCCESS";
        
        if (isPaid) {
          await admin.from("direct_sales").update({
            status: "paid",
            updated_at: new Date().toISOString(),
            raw_response: payload
          }).eq("id", directSale.id);
          
          console.log(`[webhook] Venda direta ${directSale.id} marcada como paga`);
          return json({ ok: true, kind: "direct_sale" });
        }

        if (status === "FALHA" || status === "CANCELADO" || status === "FAILED") {
          await admin.from("direct_sales").update({ status: "failed" }).eq("id", directSale.id);
          return json({ ok: true });
        }
        return json({ ok: true, status });
      }

      console.warn("no intent/order/sale for tx", txId);
      return json({ ok: false, reason: "not found" }, 200);
    }

    if (storeOrder.status === "completed" || storeOrder.status === "paid") {
      return json({ ok: true, already: true });
    }

    if (status === "FALHA" || status === "CANCELADO") {
      await admin.from("storefront_orders").update({
        status: "failed",
        raw_response: payload,
      }).eq("id", storeOrder.id);
      return json({ ok: true });
    }

    if (status !== "COMPLETO") {
      return json({ ok: true, status });
    }

    if (storeOrder.product_type === "credits" || storeOrder.product_type === "recharge" || storeOrder.license_type === "credits") {
      // Marca como pago (recebemos o PIX), agora tenta cobrar custo do revendedor
      await admin.from("storefront_orders").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        raw_response: payload,
      }).eq("id", storeOrder.id);

      // Calcula custo do pacote para o revendedor
      let credits_cost = 0;
      try {
        const credits = Number(storeOrder.credit_amount ?? 0);
        if (credits > 0) {
          const { data: plan } = await admin
            .from("credit_pricing_plans")
            .select("id")
            .eq("credits_amount", credits)
            .eq("is_active", true)
            .maybeSingle();
          if (plan?.id) {
            const { data: c } = await admin.rpc("get_credit_pack_cost", {
              _reseller_id: storeOrder.reseller_id,
              _plan_id: plan.id,
            });
            credits_cost = Number(c ?? 0);
          }
        }
      } catch (e) {
        console.warn("get_credit_pack_cost failed", e);
      }

      if (credits_cost > 0) {
        const { data: debitOk } = await admin.rpc("debit_reseller_balance", {
          _reseller_id: storeOrder.reseller_id,
          _amount_cents: credits_cost,
          _kind: "order_debit",
          _description: `Venda Loja: ${storeOrder.credit_amount ?? 0} créditos`,
          _reference_id: storeOrder.id,
        });

        if (!debitOk) {
          // Sem saldo → aguarda recarga
          await admin.from("storefront_orders").update({
            status: "awaiting_balance",
            cost_cents: credits_cost,
          }).eq("id", storeOrder.id);

          await admin.from("pending_storefront_charges").insert({
            order_id: storeOrder.id,
            reseller_id: storeOrder.reseller_id,
            cost_cents: credits_cost,
            product_type: "credits",
          });

          return json({ ok: true, kind: "storefront_credits_awaiting_balance" });
        }

        await admin.rpc("add_reseller_spent", {
          _reseller_id: storeOrder.reseller_id,
          _amount_cents: credits_cost,
        });
      }

      await admin.from("storefront_orders").update({
        status: "completed",
        cost_cents: credits_cost,
      }).eq("id", storeOrder.id);

      try {
        await admin.from("orders").insert({
          reseller_id: storeOrder.reseller_id,
          client_id: null,
          customer_id: null,
          extension_id: null,
          license_type: "credits",
          product_type: "credits",
          credit_amount: storeOrder.credit_amount,
          price_cents: credits_cost,
          status: "completed",
          is_test: false,
          provider_response: payload,
          notes: `Venda da Loja • ${storeOrder.buyer_name} • ${storeOrder.credit_amount ?? 0} créditos • Recebido R$ ${(Number(storeOrder.price_cents) / 100).toFixed(2)}`,
        });
      } catch (e) {
        console.warn("orders insert (storefront credits) failed", e);
      }

      return json({ ok: true, kind: "storefront_credits" });
    }

    // Mark paid then provision
    await admin.from("storefront_orders").update({
      status: "paid",
      paid_at: new Date().toISOString(),
      raw_response: payload,
    }).eq("id", storeOrder.id);

    // Resolve método da loja (flow|lovax)
    const { data: storeCfg } = await admin
      .from("reseller_storefronts")
      .select("extension_method")
      .eq("reseller_id", storeOrder.reseller_id)
      .maybeSingle();
    const method: "flow" | "lovax" =
      (storeCfg as any)?.extension_method === "lovax" ? "lovax" : "flow";

    // CUSTO DO REVENDEDOR — mesma lógica do place-reseller-order:
    // 1) reseller_extension_price_overrides (Partners) — prioridade máxima
    // 2) tier_extension_prices (preço fixo do nível) — ignora desconto% e piso global
    // 3) reseller_extension_prices (override por extensão) + desconto do nível + piso global
    // 4) pricing_plans.price_cents + desconto do nível + piso global
    let cost_cents = 0;
    {
      let tier_price_override = 0;

      if (storeOrder.extension_id) {
        const { data: partnerRow } = await admin
          .from("reseller_extension_price_overrides")
          .select("price_cents,is_active")
          .eq("reseller_id", storeOrder.reseller_id)
          .eq("extension_id", storeOrder.extension_id)
          .eq("license_type", storeOrder.license_type)
          .maybeSingle();
        if (partnerRow && partnerRow.is_active && partnerRow.price_cents >= 0) {
          tier_price_override = Number(partnerRow.price_cents);
        }
      } else {
        // Pacote global da loja (extension_id NULL): aplica o MENOR override
        // de Partners ativo do revendedor para esse license_type, se existir.
        const { data: partnerRows } = await admin
          .from("reseller_extension_price_overrides")
          .select("price_cents,is_active")
          .eq("reseller_id", storeOrder.reseller_id)
          .eq("license_type", storeOrder.license_type)
          .eq("is_active", true);
        if (partnerRows && partnerRows.length > 0) {
          const min = Math.min(...partnerRows.map((r: any) => Number(r.price_cents)).filter((n: number) => n >= 0));
          if (Number.isFinite(min)) tier_price_override = min;
        }
      }

      const { data: tierRow } = await admin.rpc("get_reseller_tier", {
        _reseller_id: storeOrder.reseller_id,
      });
      const tier: any = Array.isArray(tierRow) ? tierRow[0] : tierRow;

      if (tier?.id && !storeOrder.extension_id) {
        // Cascata: override individual (Partner) -> licencas.valores[tier]
        //          -> fallback Partner→Ouro -> método irmão (flow<->lovax custo igual)
        const [{ data: rlcoRow }, { data: setting }, { data: tiersAll }] = await Promise.all([
          admin.from("reseller_license_cost_overrides")
            .select("price_cents,is_active")
            .eq("reseller_id", storeOrder.reseller_id)
            .eq("pack_id", storeOrder.license_type)
            .eq("is_active", true)
            .maybeSingle(),
          admin.from("app_settings").select("value").eq("key", "licencas.valores").maybeSingle(),
          admin.from("reseller_tiers").select("id,slug,name,is_hidden").eq("is_active", true),
        ]);
        if (rlcoRow?.price_cents && rlcoRow.price_cents > 0) {
          tier_price_override = Number(rlcoRow.price_cents);
        } else {
          const valores = (setting?.value ?? {}) as Record<string, any>;
          const otherMethod = method === "flow" ? "lovax" : "flow";
          const ouro = (tiersAll ?? []).find((t: any) => (t.slug || "").toLowerCase() === "ouro")
            ?? (tiersAll ?? []).find((t: any) => (t.name || "").toLowerCase().includes("ouro"));
          let brl = Number(valores?.[method]?.[storeOrder.license_type]?.[tier.id] ?? 0);
          if (brl <= 0) brl = Number(valores?.[otherMethod]?.[storeOrder.license_type]?.[tier.id] ?? 0);
          const isPartnerLike =
            tier?.is_hidden ||
            String(tier?.slug || "").toLowerCase() === "partner" ||
            String(tier?.name || "").toLowerCase().includes("partner");
          if (brl <= 0 && isPartnerLike && ouro?.id) {
            brl = Number(valores?.[method]?.[storeOrder.license_type]?.[ouro.id] ?? 0);
            if (brl <= 0) brl = Number(valores?.[otherMethod]?.[storeOrder.license_type]?.[ouro.id] ?? 0);
          }
          if (brl > 0) tier_price_override = Math.round(brl * 100);
        }
      }

      if (tier_price_override === 0 && tier?.id && storeOrder.extension_id) {
        const { data: tep } = await admin
          .from("tier_extension_prices")
          .select("price_cents,is_active")
          .eq("tier_id", tier.id)
          .eq("extension_id", storeOrder.extension_id)
          .eq("license_type", storeOrder.license_type)
          .maybeSingle();
        if (tep && tep.is_active && tep.price_cents >= 0) {
          tier_price_override = Number(tep.price_cents);
        }
      }

      if (tier_price_override > 0) {
        cost_cents = tier_price_override;
      } else {
        let base_price_cents = 0;
        let min_price_cents = 0;

        // Busca preço customizado do revendedor (global ou por extensão)
        const { data: overrideRow } = await admin.from("reseller_extension_prices")
          .select("price_cents,is_active")
          .eq("reseller_id", storeOrder.reseller_id)
          .eq("license_type", storeOrder.license_type)
          .or(storeOrder.extension_id ? `extension_id.eq.${storeOrder.extension_id},extension_id.is.null` : 'extension_id.is.null')
          .eq("is_active", true)
          .order("extension_id", { ascending: false });

        if (overrideRow && overrideRow.length > 0 && overrideRow[0].price_cents > 0) {
          base_price_cents = Number(overrideRow[0].price_cents);
        }

        const { data: planRow } = await admin
          .from("pricing_plans")
          .select("price_cents,min_price_cents")
          .eq("license_type", storeOrder.license_type)
          .maybeSingle();

        if (base_price_cents === 0 && planRow) {
          base_price_cents = Number(planRow.price_cents ?? 0);
        }
        min_price_cents = Number(planRow?.min_price_cents ?? 0);

        if (base_price_cents > 0) {
          const discountPct = Number(tier?.discount_percent ?? 0);
          const discounted = Math.round(base_price_cents * (1 - discountPct / 100));
          cost_cents = Math.max(0, min_price_cents, discounted);
        }
      }
    }

    if (cost_cents > 0) {
      const { data: debitOk } = await admin.rpc("debit_reseller_balance", {
        _reseller_id: storeOrder.reseller_id,
        _amount_cents: cost_cents,
        _kind: "order_debit",
        _description: `Venda Loja: ${storeOrder.license_type}`,
        _reference_id: storeOrder.id,
      });

      if (!debitOk) {
        // Sem saldo → coloca em espera, não chama provedor
        await admin.from("storefront_orders").update({
          status: "awaiting_balance",
          cost_cents,
        }).eq("id", storeOrder.id);

        await admin.from("pending_storefront_charges").insert({
          order_id: storeOrder.id,
          reseller_id: storeOrder.reseller_id,
          cost_cents,
          product_type: "license",
        });

        return json({ ok: true, kind: "storefront_order_awaiting_balance" });
      }

      await admin.rpc("add_reseller_spent", {
        _reseller_id: storeOrder.reseller_id,
        _amount_cents: cost_cents,
      });
    }

    let providerData: any = null;
    let license_key: string | null = null;
    try {
      if (method === "lovax") {
        const { data: settings } = await admin
          .from("app_settings")
          .select("key, value")
          .in("key", ["lovax_api_token", "lovax_base_url"]);
        const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
        const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined)
          || "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";
        if (!tk) {
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: "MétodoLovax não configurado",
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (Lovax não configurado): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          return json({ ok: false, error: "lovax not configured" }, 500);
        }
        const mapped = mapTypeToProviderBody(storeOrder.license_type);
        const r = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_license",
            payload: {
              customer_name: storeOrder.buyer_name,
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
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: providerData?.error ?? `Lovax retornou ${r.status}`,
            raw_response: providerData,
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (falha Lovax): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          return json({ ok: false, error: "lovax failed" }, 502);
        }
        license_key =
          providerData?.license?.license_key ?? providerData?.license_key ?? providerData?.key ?? null;
      } else {
        const { data: cfg } = await admin.from("provider_settings")
          .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
        const base = cfg?.base_url ?? DEFAULT_PROVIDER_BASE;
        if (!apiKey) {
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: "MétodoFlow não configurado",
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (Flow não configurado): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          return json({ ok: false, error: "no provider api key" }, 500);
        }
        const r = await fetch(`${base}/generate-license`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...mapTypeToProviderBody(storeOrder.license_type),
            display_name: storeOrder.buyer_name,
          }),
        });
        const txt = await r.text();
        try { providerData = JSON.parse(txt); } catch { providerData = { raw: txt }; }
        if (!r.ok) {
          await admin.from("storefront_orders").update({
            status: "failed",
            error_message: `MétodoFlow retornou ${r.status}`,
            raw_response: providerData,
          }).eq("id", storeOrder.id);
          if (cost_cents > 0) {
            await admin.rpc("credit_reseller_balance", {
              _reseller_id: storeOrder.reseller_id,
              _amount_cents: cost_cents,
              _kind: "order_refund",
              _description: `Estorno (falha Flow): ${storeOrder.id}`,
              _reference_id: storeOrder.id,
            });
          }
          return json({ ok: false, error: "provider failed" }, 502);
        }
        license_key = providerData?.key ?? providerData?.license_key ?? providerData?.license ?? null;
      }
    } catch (e) {
      await admin.from("storefront_orders").update({
        status: "failed",
        error_message: e instanceof Error ? e.message : "erro provedor",
      }).eq("id", storeOrder.id);
      return json({ ok: false, error: "provider error" }, 502);
    }

    await admin.from("storefront_orders").update({
      status: "completed",
      license_key,
    }).eq("id", storeOrder.id);

    // upsert customer for the reseller
    let customer_id: string | null = null;
    try {
      const { data: existing } = await admin
        .from("reseller_customers")
        .select("id")
        .eq("reseller_id", storeOrder.reseller_id)
        .eq("whatsapp", storeOrder.buyer_whatsapp)
        .maybeSingle();
      if (existing) {
        customer_id = existing.id;
      } else {
        const { data: created } = await admin.from("reseller_customers").insert({
          reseller_id: storeOrder.reseller_id,
          whatsapp: storeOrder.buyer_whatsapp,
          display_name: storeOrder.buyer_name,
        }).select("id").single();
        customer_id = created?.id ?? null;
      }
    } catch (e) {
      console.warn("customer upsert failed", e);
    }

    // Registra também em `orders` para aparecer no dashboard / licenças geradas
    try {
      await admin.from("orders").insert({
        reseller_id: storeOrder.reseller_id,
        client_id: null,
        customer_id,
        extension_id: storeOrder.extension_id,
        license_type: storeOrder.license_type,
        price_cents: cost_cents, // custo para o revendedor (mesma base do painel)
        status: "completed",
        is_test: false,
        license_key,
        provider_response: providerData,
        notes: `Venda da Loja • ${storeOrder.buyer_name} • Recebido R$ ${(Number(storeOrder.price_cents) / 100).toFixed(2)}`,
      });
    } catch (e) {
      console.warn("orders insert (storefront) failed", e);
    }

    return json({ ok: true, kind: "storefront_order" });
  } catch (e) {
    console.error("webhook error", e);
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
