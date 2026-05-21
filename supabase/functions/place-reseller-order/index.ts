import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];
const DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // valida revendedor
    const { data: reseller } = await svc.from("resellers")
      .select("id,is_active").eq("user_id", user.id).maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "Apenas revendedores ativos" }, 403);

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
      const { data: overrideRow } = await svc.from("reseller_extension_prices")
        .select("price_cents,is_active")
        .eq("reseller_id", reseller.id)
        .eq("license_type", license_type)
        .or(extension_id ? `extension_id.eq.${extension_id},extension_id.is.null` : 'extension_id.is.null')
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
    }).select().single();
    if (ordErr || !order) return json({ error: "Falha ao criar pedido" }, 500);

    // debita saldo (apenas se não for teste)
    if (!is_test) {
      const { data: ok, error: debErr } = await svc.rpc("debit_reseller_balance", {
        _reseller_id: reseller.id,
        _amount_cents: price_cents,
        _kind: "order_debit",
        _description: `Pedido ${license_type}`,
        _reference_id: order.id,
      });
      if (debErr) {
        await svc.from("orders").update({ status: "failed", error_message: debErr.message }).eq("id", order.id);
        return json({ error: debErr.message }, 500);
      }
      if (!ok) {
        await svc.from("orders").update({ status: "failed", error_message: "Saldo insuficiente" }).eq("id", order.id);
        return json({ error: "Saldo insuficiente. Adicione saldo na plataforma." }, 402);
      }
    }

    // chama provedor
    const { data: cfg } = await svc.from("provider_settings")
      .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? DEFAULT_BASE;

    const refund = async (reason: string, providerResp?: unknown) => {
      if (!is_test && price_cents > 0) {
        await svc.rpc("credit_reseller_balance", {
          _reseller_id: reseller.id,
          _amount_cents: price_cents,
          _kind: "order_refund",
          _description: `Reembolso pedido ${order.id}`,
          _reference_id: order.id,
        });
      }
      await svc.from("orders").update({
        status: is_test ? "failed" : "refunded",
        error_message: reason,
        provider_response: providerResp ?? null,
      }).eq("id", order.id);
    };

    if (!apiKey) {
      await refund("Provedor não configurado");
      return json({ error: "Provedor não configurado pelo gerente" }, 500);
    }

    let providerData: any = null;
    try {
      const endpoint = is_test ? `${base}/generate-trial` : `${base}/generate-license`;
      const payload: Record<string, unknown> = is_test
        ? { display_name: final_display_name, minutes: 30, seconds: 0, ...(method ? { method, extension: method } : {}) }
        : { ...mapTypeToProviderBody(license_type), display_name: final_display_name };
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
      if (!r.ok) {
        await refund(`Provedor retornou ${r.status}`, providerData);
        return json({ error: "Falha no provedor", details: providerData }, 502);
      }
    } catch (e) {
      await refund(e instanceof Error ? e.message : "Erro no provedor");
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    const license_key =
      providerData?.key ?? providerData?.license_key ?? providerData?.license ?? null;

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
    }).eq("id", order.id);

    // soma gasto para o sistema de níveis (apenas pedidos pagos)
    if (!is_test && price_cents > 0) {
      await svc.rpc("add_reseller_spent", {
        _reseller_id: reseller.id,
        _amount_cents: price_cents,
      });
    }

    // Dispara WhatsApp via Evolution API central (best-effort)
    let whatsapp_sent = false;
    let whatsapp_error: string | null = null;
    if (license_key && whatsapp) {
      try {
        const EVO_URL = (Deno.env.get("EVOLUTION_BASE_URL") ?? "").replace(/\/+$/, "");
        const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
        const { data: integ } = await svc
          .from("reseller_integrations")
          .select("connection_status, instance_name")
          .eq("reseller_id", reseller.id)
          .maybeSingle();
        const { data: tplRow } = await svc
          .from("app_settings").select("value").eq("key", "evolution_message_template").maybeSingle();
        const tpl = (typeof tplRow?.value === "string" ? tplRow.value : (tplRow?.value as any)) ||
          "Olá {nome}! ✅ Sua licença {tipo} foi gerada.\n\n🔑 Chave: {chave}\n\nGuarde com cuidado.";

        if (EVO_URL && EVO_KEY && integ?.connection_status === "connected" && integ.instance_name) {
          const message = String(tpl)
            .replaceAll("{nome}", final_display_name)
            .replaceAll("{chave}", license_key)
            .replaceAll("{tipo}", license_type);
          const number = whatsapp.startsWith("55") ? whatsapp : `55${whatsapp}`;
          const evoResp = await fetch(
            `${EVO_URL}/message/sendText/${encodeURIComponent(integ.instance_name)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVO_KEY },
              body: JSON.stringify({ number, text: message }),
            },
          );
          if (evoResp.ok) {
            whatsapp_sent = true;
            await svc.rpc("increment_evolution_messages_sent", { _reseller_id: reseller.id });
          } else {
            whatsapp_error = `Evolution retornou ${evoResp.status}`;
          }
          await evoResp.text().catch(() => {});
        }
      } catch (e) {
        whatsapp_error = e instanceof Error ? e.message : "Erro Evolution";
        console.error("[evolution send]", e);
      }
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
      whatsapp_sent,
      whatsapp_error,
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
