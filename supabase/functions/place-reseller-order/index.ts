import { createClient } from "jsr:@supabase/supabase-js@2";
import { maintenanceGuard } from "../_shared/maintenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];
const DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const DEFAULT_LOVAX_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

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

function typeToLovaxDays(type: string): number {
  switch (type) {
    case "pro_1d": return 1;
    case "pro_7d": return 7;
    case "pro_15d": return 15;
    case "pro_30d": return 30;
    case "lifetime": return 36500;
    default: return 30;
  }
}

function mapLicenseTypeToDuration(type: string): string {
  switch (type) {
    case "pro_1d": return "1 Dia";
    case "pro_7d": return "7 Dias";
    case "pro_15d": return "15 Dias";
    case "pro_30d": return "30 Dias";
    case "lifetime": return "Vitalício";
    case "trial": return "Teste (15 min)";
    default: return type.includes("trial") ? "Teste (15 min)" : "30 Dias";
  }
}

async function triggerWhatsAppNotify(supabaseUrl: string, serviceKey: string, payload: any) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/system-whatsapp-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ mode: "auto", ...payload }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) console.warn("system-whatsapp-notify failed", res.status, data);
  } catch (e) {
    console.warn("system-whatsapp-notify invoke failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    {
      const _maintClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const _maintResp = await maintenanceGuard(_maintClient, corsHeaders);
      if (_maintResp) return _maintResp;
    }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(supabaseUrl, serviceKey);

    // valida revendedor
    const { data: reseller } = await svc.from("resellers")
      .select("id,is_active,activation_status,is_demo,billing_mode,subscription_blocked,subscription_sales_disabled,pack_sales_disabled,delivery_source").eq("user_id", user.id).maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "Apenas revendedores ativos" }, 403);
    if (reseller.activation_status && reseller.activation_status !== "active") {
      return json({ error: "Painel não ativado. Conclua o pagamento de R$ 200 para liberar.", reason: "activation_required" }, 403);
    }

    // Bloqueios de venda (mensalista bloqueado ou vendas pausadas pelo gerente)
    {
      const r: any = reseller;
      if (r.billing_mode === "subscription" && r.subscription_blocked) {
        return json({ error: "Painel bloqueado por cobrança em aberto. Pague para liberar.", reason: "subscription_blocked" }, 403);
      }
      if (r.billing_mode === "subscription" && r.subscription_sales_disabled) {
        await svc.from("blocked_sale_attempts").insert({
          reseller_id: reseller.id,
          attempt_type: "subscription",
          endpoint: "place-reseller-order",
          reason: "sales_disabled",
          metadata: {},
        });
        return json({ error: "Vendas pausadas pelo gerente. Entre em contato com o suporte.", reason: "sales_disabled" }, 403);
      }
      if (r.billing_mode === "pack" && r.pack_sales_disabled) {
        await svc.from("blocked_sale_attempts").insert({
          reseller_id: reseller.id,
          attempt_type: "pack",
          endpoint: "place-reseller-order",
          reason: "sales_disabled",
          metadata: {},
        });
        return json({ error: "Vendas pausadas pelo gerente. Entre em contato com o suporte.", reason: "sales_disabled" }, 403);
      }
    }

    // DEMO GUARD — conta demo nunca chama provedor nem debita saldo
    if ((reseller as any).is_demo) {
      const demoKey = `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      return json({
        ok: true,
        demo: true,
        license_key: demoKey,
        message: "Demo: licença simulada (nenhuma chamada real ao provedor).",
      });
    }

    // Bloqueia geração quando houver vendas da loja aguardando saldo
    {
      const { data: hasPending } = await svc.rpc("has_pending_storefront_orders", {
        _reseller_id: reseller.id,
      });
      if (hasPending) {
        return json({
          error: "Você tem vendas da loja aguardando saldo. Regularize seu saldo antes de gerar novas licenças.",
          code: "PENDING_BALANCE",
        }, 409);
      }
    }

    const body = await req.json().catch(() => ({}));
    const extension_id = body.extension_id ? String(body.extension_id) : null;
    const is_test = body.is_test === true;
    const method = typeof body.method === "string" ? body.method.toLowerCase() : "";
    // licenças teste sempre forçam type "trial" no nosso registro
    const license_type = is_test
      ? (method ? `${method}_trial` : "trial")
      : String(body.license_type ?? "");
    const client_id = body.client_id ? String(body.client_id) : null;
    const display_name = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) : "";
    const whatsapp_raw = typeof body.whatsapp === "string" ? body.whatsapp : "";
    const whatsapp = whatsapp_raw.replace(/\D+/g, "").slice(0, 15);

    if (!is_test && !ALLOWED_TYPES.includes(license_type)) {
      return json({ error: "Tipo de licença inválido" }, 400);
    }
    if (display_name.length < 2) {
      return json({ error: "Informe o nome exibido na licença" }, 400);
    }
    // WhatsApp obrigatório apenas em compras pagas (teste é opcional)
    if (!is_test && (whatsapp.length < 10 || whatsapp.length > 13)) {
      return json({ error: "Informe um WhatsApp válido (com DDD)" }, 400);
    }
    if (is_test && whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) {
      return json({ error: "WhatsApp inválido (deixe em branco ou informe DDD + número)" }, 400);
    }

    // Limite de licenças teste por revendedor a cada 24h
    // Override individual no revendedor tem prioridade sobre o limite do nível
    if (is_test) {
      const { data: resellerRow } = await svc
        .from("resellers")
        .select("test_keys_per_day_override")
        .eq("id", reseller.id)
        .maybeSingle();

      let dailyLimit: number;
      if (resellerRow?.test_keys_per_day_override != null) {
        dailyLimit = Number(resellerRow.test_keys_per_day_override);
      } else {
        const { data: tierRows } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
        const tier = Array.isArray(tierRows) ? tierRows[0] : tierRows;
        dailyLimit = Number(tier?.test_keys_per_day ?? 10);
      }

      if (dailyLimit <= 0) {
        return json({
          error: "Seu nível atual não permite gerar chaves teste. Faça upgrade de nível para liberar.",
        }, 403);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const since = today.toISOString();
      
      const { count } = await svc
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("reseller_id", reseller.id)
        .eq("is_test", true)
        .gte("created_at", since);
      if ((count ?? 0) >= dailyLimit) {
        return json({
          error: `Limite de ${dailyLimit} licença(s) teste por dia atingido para o seu nível. Tente novamente em algumas horas ou faça upgrade.`,
        }, 429);
      }
    }

    // validação de extensão removida - todas as ativas são permitidas

    // valida cliente (se enviado, precisa pertencer ao revendedor)
    if (client_id) {
      const { data: prof } = await svc.from("profiles")
        .select("id,reseller_id").eq("id", client_id).maybeSingle();
      if (!prof || prof.reseller_id !== reseller.id) {
        return json({ error: "Cliente não pertence a você" }, 403);
      }
    }

    // preço: licenças teste são grátis; senão override por revendedor/extensão tem prioridade
    let base_price_cents = 0;
    let min_price_cents = 0;
    let discount_pct = 0;
    let price_cents = 0;
    if (!is_test) {
      // 1) Override individual por revendedor (Partners) tem prioridade máxima
      let tier_price_override = 0;
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
        // Pacote global (sem extensão): aplica o MENOR override de Partners
        // ativo do revendedor para esse license_type, se existir.
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
      // 2) Fallback: override por nível (compat. tier_extension_prices)
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

      if (tier_price_override > 0) {
        // Preço fixo do nível: ignora desconto% e piso global
        price_cents = tier_price_override;
        base_price_cents = tier_price_override;
        discount_pct = 0;
      } else {
      // Busca preço customizado do revendedor (global ou por extensão)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const safeExtId = extension_id && UUID_RE.test(extension_id) ? extension_id : null;
      if (extension_id && !safeExtId) {
        return json({ error: "extension_id inválido" }, 400);
      }
      const { data: overrideRow } = await svc.from("reseller_extension_prices")
        .select("price_cents,is_active")
        .eq("reseller_id", reseller.id)
        .eq("license_type", license_type)
        .or(safeExtId ? `extension_id.eq.${safeExtId},extension_id.is.null` : 'extension_id.is.null')
        .eq("is_active", true)
        .order("extension_id", { ascending: false }); // Prioriza o que tem extension_id preenchido

      if (overrideRow && overrideRow.length > 0 && overrideRow[0].price_cents > 0) {
        base_price_cents = overrideRow[0].price_cents;
      }
      if (base_price_cents === 0) {
        const { data: planRow } = await svc.from("pricing_plans")
          .select("price_cents,is_active,min_price_cents")
          .eq("license_type", license_type)
          .maybeSingle();
        if (!planRow || !planRow.is_active || planRow.price_cents <= 0) {
          return json({ error: "Preço não definido pelo gerente para essa licença" }, 400);
        }
        base_price_cents = planRow.price_cents;
        min_price_cents = Number(planRow.min_price_cents ?? 0);
      } else {
        // override por extensão também respeita o piso global do plano
        const { data: planRow } = await svc.from("pricing_plans")
          .select("min_price_cents")
          .eq("license_type", license_type)
          .maybeSingle();
        min_price_cents = Number(planRow?.min_price_cents ?? 0);
      }
      if (base_price_cents <= 0) return json({ error: "Preço inválido" }, 400);

      // aplica desconto do nível e respeita preço mínimo
      const { data: tier } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
      discount_pct = Number(tier?.discount_percent ?? 0);
      const discounted = Math.round(base_price_cents * (1 - discount_pct / 100));
      price_cents = Math.max(0, min_price_cents, discounted);
      } // fim else (sem override de tier)
    }

    // Desconto promocional sobre o custo final (extensão)
    let promotion_id: string | null = null;
    let promotion_discount_cents = 0;
    if (price_cents > 0) {
      try {
        const { data: pd } = await svc.rpc("compute_promotion_discount", {
          _base_cents: price_cents,
          _kind: "extension",
        });
        const row: any = Array.isArray(pd) ? pd[0] : pd;
        if (row) {
          price_cents = Number(row.final_cents ?? price_cents);
          promotion_id = row.promotion_id ?? null;
          promotion_discount_cents = Number(row.discount_cents ?? 0);
        }
      } catch (e) {
        console.warn("compute_promotion_discount failed", e);
      }
    }

    // upsert do contato do revendedor (apenas se whatsapp informado)
    let customer_id: string | null = null;
    let final_display_name = display_name;
    if (whatsapp) {
      const { data: existing } = await svc
        .from("reseller_customers")
        .select("id, display_name")
        .eq("reseller_id", reseller.id)
        .eq("whatsapp", whatsapp)
        .maybeSingle();
      if (existing) {
        customer_id = existing.id;
        final_display_name = existing.display_name;
      } else {
        const { data: created } = await svc
          .from("reseller_customers")
          .insert({ reseller_id: reseller.id, whatsapp, display_name })
          .select("id, display_name")
          .single();
        if (created) {
          customer_id = created.id;
          final_display_name = created.display_name;
        }
      }
    }

    // cria pedido pendente
    const { data: order, error: ordErr } = await svc.from("orders").insert({
      reseller_id: reseller.id,
      client_id,
      customer_id,
      extension_id,
      license_type,
      price_cents,
      status: "pending",
      is_test,
      promotion_id,
      promotion_discount_cents,
    }).select().single();
    if (ordErr || !order) return json({ error: "Falha ao criar pedido" }, 500);

    // debita saldo (apenas se não for teste)
    const deliveryFromPack =
      (reseller as any).billing_mode === "pack" &&
      (reseller as any).delivery_source === "pack";
    let usedPack = false;
    let fallbackFromPack = false;
    if (!is_test) {
      if (deliveryFromPack) {
        const { data: consumed, error: consumeErr } = await svc.rpc(
          "pack_try_consume_sale_credit",
          {
            _reseller_id: reseller.id,
            _order_id: order.id,
            _description: `Pedido ${license_type}`,
          },
        );
        if (consumeErr) {
          await svc.from("orders").update({ status: "failed", error_message: consumeErr.message }).eq("id", order.id);
          return json({ error: consumeErr.message }, 500);
        }
        if (typeof consumed === "number" && consumed >= 0) {
          usedPack = true;
        } else {
          fallbackFromPack = true;
        }
      }
      if (!usedPack) {
        const debitRpc = fallbackFromPack
          ? "debit_reseller_balance_pack_fallback"
          : "debit_reseller_balance_promo";
        const { data: ok, error: debErr } = await svc.rpc(debitRpc, {
          _reseller_id: reseller.id,
          _amount_cents: price_cents,
          _kind: "order_debit",
          _description: fallbackFromPack
            ? `Pedido ${license_type} (fallback pacote esgotado)`
            : `Pedido ${license_type}`,
          _reference_id: order.id,
          _promotion_id: promotion_id,
        });
        if (debErr) {
          await svc.from("orders").update({ status: "failed", error_message: debErr.message }).eq("id", order.id);
          return json({ error: debErr.message }, 500);
        }
        if (!ok) {
          await svc.from("orders").update({
            status: "failed",
            error_message: fallbackFromPack
              ? "Pacote esgotado e saldo insuficiente para o fallback."
              : "Saldo insuficiente",
          }).eq("id", order.id);
          return json({
            error: fallbackFromPack
              ? "Pacote esgotado e saldo insuficiente para o fallback."
              : "Saldo insuficiente. Adicione saldo na plataforma.",
          }, 402);
        }
      }
    }

    // chama provedor — respeita método ativo (Flow/Lovax) e manutenção
    const { data: deliverySettings } = await svc
      .from("app_settings")
      .select("key,value")
      .in("key", ["licencas.delivery.maintenance"]);
    const maintenanceVal = (deliverySettings ?? []).find((r: any) => r.key === "licencas.delivery.maintenance")?.value as any;
    // Lovax é o único método ativo. Flow descontinuado.
    const activeMethod: "lovax" = "lovax";
    const maintenance = maintenanceVal?.enabled === true;

    const refund = async (reason: string, providerResp?: unknown) => {
      if (!is_test && !usedPack && price_cents > 0) {
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: reseller.id,
          _amount_cents: price_cents,
          _kind: "order_refund",
          _description: `Reembolso pedido ${order.id}`,
          _reference_id: order.id,
        });
      }
      if (!is_test && usedPack) {
        await svc.rpc("pack_refund_credit", {
          _reseller_id: reseller.id,
          _order_id: order.id,
          _description: `Reembolso pedido ${order.id}: ${reason}`,
        }).then((r: any) => r.error && console.warn("pack_refund_credit failed", r.error));
      }
      await svc.from("orders").update({
        status: is_test ? "failed" : "refunded",
        error_message: reason,
        provider_response: providerResp ?? null,
      }).eq("id", order.id);
    };

    if (maintenance) {
      await refund("Entrega de licenças em manutenção");
      return json({ error: "Entrega de licenças em manutenção. Tente novamente em instantes." }, 503);
    }

    let providerData: any = null;
    try {
      {
        const { data: settings } = await svc
          .from("app_settings")
          .select("key,value")
          .in("key", ["lovax_api_token", "lovax_base_url"]);
        const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
        const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined)
          || DEFAULT_LOVAX_BASE;
        if (!tk) {
          await refund("MétodoLovax não configurado pelo gerente");
          return json({ error: "MétodoLovax não configurado pelo gerente" }, 500);
        }
        const trialName = (final_display_name && final_display_name.length >= 2)
          ? final_display_name
          : "Cliente Teste";
        const payload: Record<string, unknown> = is_test
          ? { customer_name: trialName, days: 0, hours: 0, minutes: 15, max_devices: 1 }
          : {
              customer_name: final_display_name,
              days: typeToLovaxDays(license_type),
              hours: 0,
              minutes: 0,
              max_devices: 1,
            };
        const r = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({ action: is_test ? "generate_trial" : "generate_license", payload }),
        });
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
        if (!r.ok || !providerData?.success) {
          await refund(providerData?.error ?? `Lovax retornou ${r.status}`, providerData);
          return json({ error: "Falha no MétodoLovax", details: providerData }, 502);
        }
      }
    } catch (e) {
      await refund(e instanceof Error ? e.message : "Erro no provedor");
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    const license_key =
      providerData?.license?.license_key ??
      providerData?.license_key ??
      providerData?.key ??
      providerData?.license ??
      null;

    // se houve client_id E extensão associada, registra para o cliente (só pedidos pagos)
    if (!is_test && client_id && extension_id) {
      await svc.from("client_extensions").insert({
        client_id,
        extension_id,
        reseller_id: reseller.id,
        status: "active",
      });
    }

    await svc.from("orders").update({
      status: "completed",
      license_key,
      provider_response: providerData,
      notes: JSON.stringify({
        billing_mode: (reseller as any).billing_mode ?? "normal",
        delivery_source: deliveryFromPack
          ? (usedPack ? "pack" : "wallet_fallback")
          : "wallet",
        fallback_from_pack: fallbackFromPack,
      }),
    }).eq("id", order.id);

    // soma gasto para o sistema de níveis (apenas pedidos pagos)
    if (!is_test && price_cents > 0) {
      await svc.rpc("add_reseller_spent", {
        _reseller_id: reseller.id,
        _amount_cents: price_cents,
      });
    }

    // Disparo WhatsApp para o revendedor (Notificação de Venda)
    if (!is_test && license_key) {
      const event_key = usedPack ? "reseller_sale_pack" : (method === "api" ? "reseller_sale_api" : "reseller_sale_manual");
      
      let licencas_restantes = "";
      if (usedPack) {
        const { data: packBal } = await svc.from("reseller_pack_balances")
          .select("credits").eq("reseller_id", reseller.id).maybeSingle();
        licencas_restantes = String(packBal?.credits ?? "0");
      }

      await triggerWhatsAppNotify(supabaseUrl, serviceKey, {
        event_key,
        reseller_id: reseller.id,
        vars: {
          pedido_id: order.id.slice(0, 8).toUpperCase(),
          cliente_nome: final_display_name,
          cliente_whatsapp: whatsapp ? `+${whatsapp}` : "N/A",
          licenca: license_key,
          custo: (price_cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          licencas_restantes,
          canal: method === "api" ? "API" : "Manual",
          prazo: mapLicenseTypeToDuration(license_type),
        },
      });
    }

    // Disparo WhatsApp para o CLIENTE (fire-and-forget)
    if (license_key && whatsapp) {
      fetch(`${supabaseUrl}/functions/v1/evolution-send-sale`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          reseller_id: reseller.id,
          kind: "license",
          to: whatsapp,
          vars: {
            nome: final_display_name,
            chave: license_key,
            tipo: license_type,
            valor_cents: String(price_cents),
          },
        }),
      }).catch((e) => console.warn("evolution-send-sale failed", e));
    }

    return json({
      ok: true,
      order_id: order.id,
      customer_id,
      display_name: final_display_name,
      name_was_replaced: final_display_name !== display_name,
      license_key,
      provider: providerData,
      discount_percent: discount_pct,
    });
  } catch (e) {
    console.error("[place-reseller-order]", e);
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
