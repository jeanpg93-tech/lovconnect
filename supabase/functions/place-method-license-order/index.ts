import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ALLOWED_METHODS = ["flow", "lovax"];
const ALLOWED_PACKS = ["1d", "7d", "30d", "90d", "365d", "lifetime"];
// MétodoFlow tem teto de 60 dias no provedor — bloqueia 90d/365d.
const FLOW_ALLOWED_PACKS = new Set(["1d", "7d", "30d", "lifetime"]);

const onlyDigits = (s: string) => (s ?? "").toString().replace(/\D+/g, "");

const DEFAULT_FLOW_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const method = String(body.method ?? "").toLowerCase();
    const pack_id = String(body.pack_id ?? "").toLowerCase();
    const display_name = String(body.display_name ?? "").trim();
    const whatsapp = onlyDigits(body.whatsapp ?? "");
    const client_id = body.client_id ? String(body.client_id) : null;

    if (!ALLOWED_METHODS.includes(method)) return json({ error: "Método inválido" }, 400);
    if (!ALLOWED_PACKS.includes(pack_id)) return json({ error: "Pacote inválido" }, 400);
    if (method === "flow" && !FLOW_ALLOWED_PACKS.has(pack_id)) {
      return json({
        error: "Pacote indisponível para MétodoFlow. Disponíveis: 1d, 7d, 30d, vitalício.",
        permitidos: Array.from(FLOW_ALLOWED_PACKS),
      }, 400);
    }

    // Enforce: only the method enabled by the manager can be sold.
    {
      const { data: enabledRow } = await svc
        .from("app_settings")
        .select("value")
        .eq("key", "licencas.delivery.method")
        .maybeSingle();
      const enabled = String(((enabledRow?.value as any)?.method ?? "flow")).toLowerCase();
      if ((enabled === "flow" || enabled === "lovax") && enabled !== method) {
        return json({
          error: `O método "${method}" está desabilitado pelo gerente. Apenas "${enabled}" pode gerar licenças no momento.`,
          code: "method_disabled",
        }, 403);
      }
    }

    if (display_name.length < 2) return json({ error: "Nome obrigatório" }, 400);
    if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) {
      return json({ error: "WhatsApp inválido" }, 400);
    }

    const { data: reseller } = await svc
      .from("resellers")
      .select("id,activation_status,billing_mode,subscription_blocked,subscription_sales_disabled,pack_sales_disabled,is_demo,delivery_source")
      .eq("user_id", userId).maybeSingle();
    if (!reseller) return json({ error: "Revendedor não encontrado" }, 404);
    if ((reseller as any).activation_status && (reseller as any).activation_status !== "active") {
      return json({ error: "Painel não ativado. Conclua o pagamento de R$ 200 para liberar.", reason: "activation_required" }, 403);
    }
    const isSubscription = (reseller as any).billing_mode === "subscription";
    const isPack = (reseller as any).billing_mode === "pack";
    const deliveryFromPack = isPack && (reseller as any).delivery_source === "pack";
    if (isSubscription && (reseller as any).subscription_blocked) {
      return json({ error: "Painel bloqueado por cobrança em aberto. Pague para liberar.", reason: "subscription_blocked" }, 403);
    }
    if (isSubscription && (reseller as any).subscription_sales_disabled) {
      await svc.from("blocked_sale_attempts").insert({
        reseller_id: reseller.id,
        attempt_type: "subscription",
        endpoint: "place-method-license-order",
        reason: "sales_disabled",
        metadata: { method, pack_id, display_name, whatsapp: whatsapp || null },
      });
      return json({ error: "Vendas pausadas pelo gerente. Entre em contato com o suporte.", reason: "sales_disabled" }, 403);
    }
    if (isPack && (reseller as any).pack_sales_disabled) {
      await svc.from("blocked_sale_attempts").insert({
        reseller_id: reseller.id,
        attempt_type: "pack",
        endpoint: "place-method-license-order",
        reason: "sales_disabled",
        metadata: { method, pack_id, display_name, whatsapp: whatsapp || null },
      });
      return json({ error: "Vendas pausadas pelo gerente. Entre em contato com o suporte.", reason: "sales_disabled" }, 403);
    }
    const reseller_id = reseller.id as string;

    // DEMO GUARD — conta demo não chama provedor nem debita saldo
    if ((reseller as any).is_demo) {
      const demoKey = `DEMO-${method.toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      return json({
        ok: true,
        demo: true,
        method,
        pack_id,
        license_key: demoKey,
        message: "Demo: licença simulada (nenhuma chamada real ao provedor).",
      });
    }

    const { data: tierData } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller_id });
    const tier = Array.isArray(tierData) ? tierData[0] : tierData;
    if (!tier?.id) return json({ error: "Nível não definido" }, 400);

    // Fonte única de custo: tier_license_prices (com fallback Ouro embutido na RPC).
    const { data: costData } = await svc.rpc("get_license_pack_cost", {
      _reseller_id: reseller_id,
      _duration_code: pack_id,
    });
    let price_cents = Number(costData ?? 0);
    if (!isSubscription && (!price_cents || price_cents <= 0)) {
      return json({ error: "Preço não definido para esse pacote" }, 400);
    }

    // Desconto promocional (extensão)
    let promotion_id: string | null = null;
    let promotion_discount_cents = 0;
    if (!isSubscription) try {
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

    // Mensalista: custo zero, sem promoção
    if (isSubscription) {
      price_cents = 0;
      promotion_id = null;
      promotion_discount_cents = 0;
    }

    if (client_id) {
      const { data: prof } = await svc
        .from("profiles").select("id,reseller_id").eq("id", client_id).maybeSingle();
      if (!prof || prof.reseller_id !== reseller_id) {
        return json({ error: "Cliente inválido" }, 400);
      }
    }

    // Cobrança: Pacote (modo pack + delivery_source=pack) com fallback para Saldo.
    // Em demais casos, débito normal da carteira (comportamento existente).
    let usedPack = false;
    let fallbackFromPack = false;
    if (!isSubscription) {
      if (deliveryFromPack) {
        const { data: consumed, error: consumeErr } = await svc.rpc(
          "pack_try_consume_sale_credit",
          {
            _reseller_id: reseller_id,
            _order_id: null,
            _description: `Venda ${method.toUpperCase()} ${pack_id}`,
          },
        );
        if (consumeErr) return json({ error: consumeErr.message }, 500);
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
        const { data: debitOk, error: debitErr } = await svc.rpc(debitRpc, {
          _reseller_id: reseller_id,
          _amount_cents: price_cents,
          _kind: "license_purchase",
          _description: fallbackFromPack
            ? `Licença ${method.toUpperCase()} ${pack_id} (fallback pacote esgotado)`
            : `Licença ${method.toUpperCase()} ${pack_id}`,
          _reference_id: null,
          _promotion_id: promotion_id,
        });
        if (debitErr) return json({ error: debitErr.message }, 500);
        if (debitOk === false) {
          return json({
            error: fallbackFromPack
              ? "Pacote esgotado e saldo insuficiente para o fallback."
              : "Saldo insuficiente",
          }, 402);
        }
      }
    }

    const license_type = `${method}_${pack_id}`;
    const notesObj = {
      method,
      pack_id,
      display_name,
      whatsapp: whatsapp || null,
      billing_mode: isSubscription ? "subscription" : isPack ? "pack" : "normal",
      delivery_source: isPack ? (usedPack ? "pack" : (fallbackFromPack ? "wallet_fallback" : "wallet")) : null,
      fallback_from_pack: fallbackFromPack,
    };

    // cria pedido pendente
    const { data: order, error: orderErr } = await svc
      .from("orders")
      .insert({
        reseller_id,
        client_id,
        license_type,
        price_cents,
        status: "pending",
        product_type: "extension",
        notes: JSON.stringify(notesObj),
        promotion_id,
        promotion_discount_cents,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      if (!isSubscription && !usedPack) {
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: reseller_id,
          _amount_cents: price_cents,
          _kind: "refund",
          _description: `Estorno falha criar pedido ${method}/${pack_id}`,
          _reference_id: null,
        });
      }
      if (usedPack) {
        await svc.rpc("pack_refund_credit", {
          _reseller_id: reseller_id,
          _order_id: null,
          _description: `Estorno falha criar pedido ${method}/${pack_id}`,
        }).then((r: any) => r.error && console.warn("pack_refund_credit failed", r.error));
      }
      return json({ error: orderErr?.message ?? "Falha ao criar pedido" }, 500);
    }

    // Linka o consumo de pacote (ledger) ao pedido recém-criado.
    if (usedPack) {
      await svc
        .from("reseller_pack_ledger")
        .update({ order_id: order.id })
        .eq("reseller_id", reseller_id)
        .is("order_id", null)
        .eq("kind", "sale_consume")
        .order("created_at", { ascending: false })
        .limit(1);
    }

    const refund = async (reason: string, providerResp?: unknown) => {
      if (!isSubscription && !usedPack) {
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: reseller_id,
          _amount_cents: price_cents,
          _kind: "refund",
          _description: `Estorno ${method}/${pack_id}: ${reason}`,
          _reference_id: order.id,
        });
      }
      if (usedPack) {
        await svc.rpc("pack_refund_credit", {
          _reseller_id: reseller_id,
          _order_id: order.id,
          _description: `Estorno ${method}/${pack_id}: ${reason}`,
        }).then((r: any) => r.error && console.warn("pack_refund_credit failed", r.error));
      }
      await svc.from("orders").update({
        status: "refunded",
        error_message: reason,
        provider_response: providerResp ?? null,
      }).eq("id", order.id);
    };

    // chama o provedor correspondente ao método ativo
    let providerData: any = null;
    let license_key: string | null = null;
    try {
      if (method === "lovax") {
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
        const r = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_license",
            payload: {
              customer_name: display_name,
              days: packToLovaxDays(pack_id),
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
          return json({ error: "Falha no MétodoLovax", details: providerData }, 502);
        }
        license_key = providerData?.license?.license_key ?? providerData?.license_key ?? providerData?.key ?? null;
      } else {
        const { data: cfg } = await svc
          .from("provider_settings")
          .select("api_key,base_url")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
        const base = cfg?.base_url ?? DEFAULT_FLOW_BASE;
        if (!apiKey) {
          await refund("MétodoFlow não configurado pelo gerente");
          return json({ error: "MétodoFlow não configurado pelo gerente" }, 500);
        }
        const r = await fetch(`${base}/generate-license`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...packToFlowBody(pack_id),
            display_name,
          }),
        });
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
        if (!r.ok) {
          await refund(`MétodoFlow retornou ${r.status}`, providerData);
          return json({ error: "Falha no MétodoFlow", details: providerData }, 502);
        }
        license_key = providerData?.key ?? providerData?.license_key ?? providerData?.license ?? null;
      }
    } catch (e) {
      await refund(e instanceof Error ? e.message : "Erro no provedor");
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    if (!license_key) {
      await refund("Provedor não retornou chave de licença", providerData);
      return json({ error: "Provedor não retornou chave de licença" }, 502);
    }

    await svc.from("orders").update({
      status: "completed",
      license_key,
      provider_response: providerData,
    }).eq("id", order.id);

    // Disparo WhatsApp (fire-and-forget) — não bloqueia retorno
    if (license_key && whatsapp) {
      fetch(`${supabaseUrl}/functions/v1/evolution-send-sale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reseller_id,
          kind: "license",
          to: whatsapp,
          vars: {
            nome: display_name,
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
      license_key,
      method,
      pack_id,
      price_cents,
      display_name,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});