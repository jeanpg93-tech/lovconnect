// Geração de chave para revendedor "Pack" (créditos avulsos).
// - Usa o método de entrega ativo (flow/lovax) automaticamente.
// - Consome 1 crédito do saldo de pacote (atômico via RPC).
// - Trial NÃO consome crédito.
// - Sem débito de saldo R$, sem promoção.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_FLOW_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const DEFAULT_LOVAX_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

const ALLOWED_TYPES = new Set(["trial", "1d", "7d", "30d", "lifetime"]);
const FLOW_ALLOWED = new Set(["trial", "1d", "7d", "30d", "lifetime"]);

const onlyDigits = (s: string) => (s ?? "").toString().replace(/\D+/g, "");

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function packToDays(t: string): number {
  switch (t) {
    case "1d": return 1;
    case "7d": return 7;
    case "30d": return 30;
    case "lifetime": return 36500;
    default: return 30;
  }
}

function mapLicenseTypeToDuration(type: string, packType: string): string {
  if (packType === "lifetime" || type.includes("lifetime")) return "Vitalício";
  switch (packType) {
    case "1d": return "1 Dia";
    case "7d": return "7 Dias";
    case "15d": return "15 Dias";
    case "30d": return "30 Dias";
    default: return packType;
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const type = String(body.type ?? "").toLowerCase();
    const display_name = String(body.display_name ?? "").trim();
    const whatsapp = onlyDigits(body.whatsapp ?? "");
    const isTrial = type === "trial";

    if (!ALLOWED_TYPES.has(type)) return json({ error: "Tipo inválido" }, 400);
    if (!isTrial) {
      if (display_name.length < 2) return json({ error: "Nome obrigatório" }, 400);
      if (!whatsapp || whatsapp.length < 10 || whatsapp.length > 13) {
        return json({ error: "WhatsApp inválido (com DDD)" }, 400);
      }
    }

    // Carrega revendedor
    const { data: reseller } = await svc
      .from("resellers")
      .select("id,activation_status,billing_mode,pack_sales_disabled,test_keys_per_day_override")
      .eq("user_id", userId).maybeSingle();
    if (!reseller) return json({ error: "Revendedor não encontrado" }, 404);
    if ((reseller as any).billing_mode !== "pack") {
      return json({ error: "Esta tela é exclusiva para revendedores Pack" }, 403);
    }
    if ((reseller as any).activation_status && (reseller as any).activation_status !== "active") {
      return json({ error: "Painel ainda não ativado." }, 403);
    }
    if ((reseller as any).pack_sales_disabled) {
      await svc.from("blocked_sale_attempts").insert({
        reseller_id: reseller.id,
        attempt_type: "pack",
        endpoint: "pack-generate-key",
        reason: "sales_disabled",
        metadata: { pack_id: type, display_name: isTrial ? null : display_name, whatsapp: whatsapp || null },
      });
      return json({ error: "Vendas pausadas pelo gerente. Entre em contato com o suporte.", reason: "sales_disabled" }, 403);
    }
    const reseller_id = reseller.id as string;

    // Captura IP/UA da requisição (para auditoria de chaves teste geradas pelo painel)
    const client_ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim())
      || req.headers.get("x-real-ip")
      || null;
    const user_agent = req.headers.get("user-agent")?.slice(0, 500) || null;

    // Para trial: aplica limite diário (override do revendedor ou 35 padrão para Pack).
    if (isTrial) {
      let dailyLimit = 35;
      if ((reseller as any).test_keys_per_day_override != null) {
        dailyLimit = Number((reseller as any).test_keys_per_day_override);
      }
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await svc
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("reseller_id", reseller_id)
        .eq("is_test", true)
        .gte("created_at", since);
      if ((count ?? 0) >= dailyLimit) {
        return json({
          error: `Limite diário de chaves teste atingido (${dailyLimit}/24h).`,
          code: "trial_daily_limit",
        }, 429);
      }
    }

    // Verifica saldo de créditos (trial não exige saldo)
    if (!isTrial) {
      const { data: bal } = await svc
        .from("reseller_pack_balances")
        .select("credits")
        .eq("reseller_id", reseller_id)
        .maybeSingle();
      const credits = (bal as any)?.credits ?? 0;
      if (credits < 1) {
        return json({ error: "Sem licenças disponíveis. Compre um pacote.", code: "no_credits" }, 402);
      }
    }

    // Lê método ativo + manutenção
    const { data: settingsRows } = await svc
      .from("app_settings")
      .select("key,value")
      .in("key", ["licencas.delivery.method", "licencas.delivery.maintenance"]);
    const methodVal = (settingsRows ?? []).find((r: any) => r.key === "licencas.delivery.method")?.value as any;
    const maintenanceVal = (settingsRows ?? []).find((r: any) => r.key === "licencas.delivery.maintenance")?.value as any;
    const activeMethod: "flow" | "lovax" =
      methodVal?.method === "lovax" ? "lovax" : "flow";
    if (maintenanceVal?.enabled === true) {
      return json({ error: "Entrega de licenças em manutenção. Tente novamente em instantes.", code: "delivery_maintenance" }, 503);
    }
    if (activeMethod === "flow" && !FLOW_ALLOWED.has(type)) {
      return json({ error: "Pacote indisponível para o método ativo." }, 400);
    }

    // Cria pedido pendente
    const license_type = isTrial ? "trial" : `${activeMethod}_${type === "lifetime" ? "lifetime" : "pro_" + type}`;
    const notesObj = {
      method: activeMethod,
      pack_id: type,
      display_name: isTrial ? null : display_name,
      whatsapp: whatsapp || null,
      billing_mode: "pack",
    };
    const { data: order, error: orderErr } = await svc
      .from("orders")
      .insert({
        reseller_id,
        client_id: null,
        license_type,
        price_cents: 0,
        status: "pending",
        product_type: "extension",
        is_test: isTrial,
        notes: JSON.stringify(notesObj),
        client_ip,
        user_agent,
      })
      .select("id")
      .single();
    if (orderErr || !order) return json({ error: orderErr?.message ?? "Falha ao criar pedido" }, 500);

    const markFailed = async (reason: string, providerResp?: unknown) => {
      await svc.from("orders").update({
        status: "failed",
        error_message: reason,
        provider_response: providerResp ?? null,
      }).eq("id", order.id);
    };

    // Chama provedor
    let providerData: any = null;
    let license_key: string | null = null;
    try {
      if (activeMethod === "lovax") {
        const { data: settings } = await svc
          .from("app_settings")
          .select("key,value")
          .in("key", ["lovax_api_token", "lovax_base_url"]);
        const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
        const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined) || DEFAULT_LOVAX_BASE;
        if (!tk) {
          await markFailed("MétodoLovax não configurado pelo gerente");
          return json({ error: "MétodoLovax não configurado pelo gerente" }, 500);
        }
        const payload: Record<string, unknown> = isTrial
          ? { days: 0, hours: 0, minutes: 15, max_devices: 1 }
          : { customer_name: display_name, days: packToDays(type), hours: 0, minutes: 0, max_devices: 1 };
        const r = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate_license", payload }),
        });
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
        if (!r.ok || !providerData?.success) {
          await markFailed(providerData?.error ?? `Lovax retornou ${r.status}`, providerData);
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
          await markFailed("MétodoFlow não configurado pelo gerente");
          return json({ error: "MétodoFlow não configurado pelo gerente" }, 500);
        }
        const path = isTrial ? "/generate-trial" : "/generate-license";
        const bodyOut: Record<string, unknown> = isTrial
          ? {}
          : { display_name, ...(type === "lifetime" ? { lifetime: true } : { days: packToDays(type) }) };
        const r = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(bodyOut),
        });
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
        if (!r.ok) {
          await markFailed(`MétodoFlow retornou ${r.status}`, providerData);
          return json({ error: "Falha no MétodoFlow", details: providerData }, 502);
        }
        license_key = providerData?.key ?? providerData?.license_key ?? providerData?.license ?? null;
      }
    } catch (e) {
      await markFailed(e instanceof Error ? e.message : "Erro no provedor");
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    if (!license_key) {
      await markFailed("Provedor não retornou chave de licença", providerData);
      return json({ error: "Provedor não retornou chave de licença" }, 502);
    }

    // Consome 1 crédito (atômico). Se falhar aqui, marca pedido como completo mesmo assim
    // pra não perder a chave já gerada — mas registra warning.
    let remainingCredits: number | null = null;
    if (!isTrial) {
      const { data: consumed, error: consumeErr } = await svc.rpc("pack_consume_credit", {
        _reseller_id: reseller_id,
        _order_id: order.id,
        _description: `Chave ${license_type}`,
      });
      if (consumeErr) {
        console.error("pack_consume_credit failed", consumeErr);
      } else {
        remainingCredits = typeof consumed === "number" ? consumed : null;
      }
    }

    await svc.from("orders").update({
      status: "completed",
      license_key,
      provider_response: providerData,
      // Suprime a notificação genérica "Venda de Licença" (R$ 0,00) disparada
      // pelo trigger trg_orders_notify_sale, já que abaixo enviamos a notificação
      // específica "Pack — Licença gerada" com todos os detalhes do pack.
      telegram_sale_notified_at: new Date().toISOString(),
    }).eq("id", order.id);

    // Notifica gerente
    try {
      const { data: rInfo } = await svc
        .from("resellers")
        .select("display_name")
        .eq("id", reseller_id)
        .maybeSingle();
      const resellerName = (rInfo as any)?.display_name ?? "—";
      const pacote = isTrial
        ? "Trial"
        : type === "lifetime"
          ? "Vitalícia"
          : `PRO ${type}`;
      const txt =
        `📦 <b>Pack — Licença gerada</b>\n` +
        `👨‍💼 Revendedor: ${resellerName}\n` +
        `📦 Pacote: ${pacote} (${activeMethod.toUpperCase()})\n` +
        `🔑 Chave: <code>${license_key}</code>` +
        (isTrial ? "" : `\n👤 Cliente: ${display_name}` + (whatsapp ? ` (${whatsapp})` : "")) +
        (isTrial
          ? `\n💳 Pagamento: Trial (sem débito)`
          : `\n💳 Pagamento: 1 licença` + (remainingCredits !== null ? ` (restam ${remainingCredits})` : ""));
      await svc.rpc("telegram_enqueue", { _text: txt });
    } catch (e) {
      console.warn("telegram_enqueue (pack license) failed", e);
    }

    if (license_key && whatsapp && !isTrial) {
      fetch(`${supabaseUrl}/functions/v1/evolution-send-sale`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
        },
        body: JSON.stringify({
          reseller_id,
          kind: "license",
          to: whatsapp,
          vars: {
            nome: display_name,
            chave: license_key,
            tipo: license_type,
            valor_cents: "0",
          },
        }),
      }).catch((e) => console.warn("evolution-send-sale failed", e));
    }

    // Notifica o REVENDEDOR via WhatsApp (system-whatsapp-notify) sobre a venda do Pack
    if (!isTrial && license_key) {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      await triggerWhatsAppNotify(supabaseUrl, serviceKey, {
        event_key: "reseller_sale_pack",
        reseller_id,
        vars: {
          pedido_id: order.id.slice(0, 8).toUpperCase(),
          cliente_nome: display_name,
          cliente_whatsapp: whatsapp ? `+${whatsapp}` : "N/A",
          licenca: license_key,
          custo: "0,00",
          licencas_restantes: remainingCredits !== null ? String(remainingCredits) : "",
          canal: "Manual (Pack)",
          prazo: mapLicenseTypeToDuration(license_type, type),
        },
      });
    }

    return json({
      ok: true,
      order_id: order.id,
      license_key,
      type,
      method: activeMethod,
      display_name: isTrial ? null : display_name,
      credits_remaining: remainingCredits,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});