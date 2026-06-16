import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

// corsHeaders imported from SDK

const DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const FLOW_REMOTE_ACTIONS = new Set([
  "status",
  "usage",
  "usage-all",
  "pricing",
  "revoke-license",
  "delete-license",
]);

const LOVAX_DEFAULT_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

async function getActiveDeliveryMethod(serviceClient: any): Promise<"flow" | "lovax"> {
  const { data } = await serviceClient
    .from("app_settings")
    .select("value")
    .eq("key", "licencas.delivery.method")
    .maybeSingle();
  const m = (data?.value as any)?.method;
  return m === "lovax" ? "lovax" : "flow";
}

async function getLovaxCreds(serviceClient: any): Promise<{ apiKey: string; base: string } | null> {
  const { data } = await serviceClient
    .from("app_settings")
    .select("key, value")
    .in("key", ["lovax_api_token", "lovax_base_url"]);
  const tk = data?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
  const bs = (data?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined) || LOVAX_DEFAULT_BASE;
  if (!tk) return null;
  return { apiKey: tk, base: bs };
}

async function callLovaxResetHwid(serviceClient: any, license_key: string) {
  const creds = await getLovaxCreds(serviceClient);
  if (!creds) {
    return { ok: false, status: 400, data: { error: "MétodoLovax não configurado" } };
  }
  const r = await fetch(creds.base, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${creds.apiKey}`,
      "x-api-key": creds.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "reset_hwid", payload: { license_key } }),
  });
  const data = await safeJson(r);
  return { ok: r.ok && data?.success !== false, status: r.status, data };
}

// Mapeia tipos internos de licença para o body do novo provedor
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

  try {
    const authHeader = req.headers.get("Authorization");
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "status";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let user: any = null;
    const PUBLIC_ACTIONS = ["public-generate-trial", "create-pix", "public-reset-hwid"];
    if (!PUBLIC_ACTIONS.includes(action)) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
      user = { id: claimsData.claims.sub, email: claimsData.claims.email };

      const { data: roleRows } = await serviceClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["gerente", "revendedor"]);
      const roles = (roleRows ?? []).map((r: any) => r.role);
      if (roles.length === 0) return json({ error: "Forbidden" }, 403);
      const roleRow = { role: roles.includes("gerente") ? "gerente" : "revendedor" };

      // Revendedores só podem chamar reset-hwid
      if (roleRow.role !== "gerente" && action !== "reset-hwid") {
        return json({ error: "Forbidden — somente gerente" }, 403);
      }

      // Revendedor precisa estar ativo
      if (roleRow.role === "revendedor") {
        const { data: r } = await serviceClient
          .from("resellers")
          .select("is_active")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!r?.is_active) return json({ error: "Reseller inativo" }, 403);
      }
    }

    // ---- Settings management (DB-stored) ----
    if (action === "get-settings") {
      const { data } = await serviceClient
        .from("provider_settings")
        .select("id, base_url, webhook_url, api_key, updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return json({ configured: false });
      return json({
        configured: true,
        base_url: data.base_url,
        webhook_url: data.webhook_url,
        api_key_masked: maskKey(data.api_key),
        updated_at: data.updated_at,
      });
    }

    if (action === "save-settings" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
      const baseUrl = (typeof body.base_url === "string" && body.base_url.trim())
        ? body.base_url.trim().replace(/\/+$/, "")
        : DEFAULT_BASE;
      const webhookUrl = typeof body.webhook_url === "string" ? body.webhook_url.trim() : null;
      if (!apiKey || apiKey.length < 8) return json({ error: "API key inválida" }, 400);

      // Substitui o registro (mantemos só 1 ativo)
      await serviceClient.from("provider_settings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const { error: insErr } = await serviceClient.from("provider_settings").insert({
        api_key: apiKey,
        base_url: baseUrl,
        webhook_url: webhookUrl,
        updated_by: user.id,
      });
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ ok: true });
    }

    if (action === "delete-settings" && req.method === "POST") {
      await serviceClient.from("provider_settings").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      return json({ ok: true });
    }

    if (action === "get-gateway-config") {
      const ci = Deno.env.get("MISTICPAY_CLIENT_ID");
      const cs = Deno.env.get("MISTICPAY_CLIENT_SECRET");
      return json({ client_id: ci, client_secret: cs });
    }

    if (action === "save-gateway-config" && req.method === "POST") {
      // Nota: No Lovable Cloud, mudar Deno.env dinamicamente não persiste.
      // Em um cenário real, salvaríamos isso em uma tabela 'app_settings'.
      const body = await req.json().catch(() => ({}));
      const { client_id, client_secret } = body;
      
      if (!client_id || !client_secret) return json({ error: "Dados incompletos" }, 400);

      // Salva na tabela app_settings para persistência (chave-valor)
      const { error: err1 } = await serviceClient.from("app_settings").upsert({ 
        key: "misticpay_client_id", 
        value: client_id,
        updated_by: user.id
      });
      const { error: err2 } = await serviceClient.from("app_settings").upsert({ 
        key: "misticpay_client_secret", 
        value: client_secret,
        updated_by: user.id
      });

      if (err1 || err2) return json({ error: "Falha ao salvar no banco" }, 500);
      return json({ ok: true });
    }

    // ---- PUBLIC: create-pix (MisticPay) ----
    if (action === "create-pix" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { amount, name, email } = body;

      if (!amount || !name) return json({ error: "Dados incompletos" }, 400);

      const { data: dbKeys } = await serviceClient
        .from("app_settings")
        .select("key, value")
        .in("key", ["misticpay_client_id", "misticpay_client_secret"]);
      
      const ci = dbKeys?.find(k => k.key === "misticpay_client_id")?.value || Deno.env.get("MISTICPAY_CLIENT_ID");
      const cs = dbKeys?.find(k => k.key === "misticpay_client_secret")?.value || Deno.env.get("MISTICPAY_CLIENT_SECRET");

      if (!ci || !cs) return json({ error: "MisticPay não configurado" }, 400);

      try {
        const supaUrl = Deno.env.get("SUPABASE_URL")!;
        const webhookUrl = `${supaUrl}/functions/v1/misticpay-webhook`;
        const txId = crypto.randomUUID();

        const resp = await fetch("https://api.misticpay.com/api/transactions/create", {
          method: "POST",
          headers: { ci, cs, "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: Number(amount),
            payerName: name,
            payerDocument: "00000000000",
            transactionId: txId,
            description: `Venda Direta: ${body.planName || "Plano"}`,
            projectWebhook: webhookUrl,
          })
        });

        const txt = await resp.text();
        console.log(`[create-pix] ${resp.status}: ${txt.slice(0, 300)}`);

        let resData: any = {};
        try { resData = JSON.parse(txt); } catch { /* ignore */ }

        if (!resp.ok) {
          return json({ error: resData?.message || `Erro no gateway (${resp.status})` }, 502);
        }

        const d = resData.data ?? {};
        const providerTxId = String(d.transactionId || txId);

        // Salva a venda para conciliação automática via webhook
        await serviceClient.from("direct_sales").insert({
          name,
          email,
          phone: body.phone,
          amount_cents: Math.round(Number(amount) * 100),
          plan_name: body.planName,
          provider_transaction_id: providerTxId,
          raw_response: resData
        });

        return json({
          qrCode: d.qrCodeBase64 || d.qrcode_base64 || d.qrcode,
          copyPaste: d.copyPaste || d.qrcode_text || d.copy_paste,
          transactionId: providerTxId,
        });
      } catch (e) {
        console.error("[create-pix] error", e);
        return json({ error: "Falha na comunicação com MisticPay" }, 502);
      }
    }

    // MétodoFlow está temporariamente desativado. Enquanto o método ativo for
    // LovaX, não consultamos a URL antiga do Flow para evitar 500/DNS no painel.
    if (FLOW_REMOTE_ACTIONS.has(action)) {
      const { data: activeDelivery } = await serviceClient
        .from("app_settings")
        .select("value")
        .eq("key", "licencas.delivery.method")
        .maybeSingle();
      const activeMethod = (activeDelivery?.value as any)?.method;
      if (activeMethod === "lovax") {
        return json(disabledFlowResponse(action), 200);
      }
    }

    // ---- Recupera credenciais (DB primeiro, fallback para secret) ----
    const { data: cfg } = await serviceClient
      .from("provider_settings")
      .select("api_key, base_url")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? DEFAULT_BASE;
    if (!apiKey) {
      return json({ error: "Provedor não configurado. Salve sua API key em Configurações." }, 400);
    }

    if (req.method === "GET" || (req.method === "POST" && ["status", "usage", "usage-all", "pricing", "gateway-balance", "delete-license", "revoke-license", "reset-hwid"].includes(action))) {
      if (action === "gateway-balance") {
        const { data: dbKeys } = await serviceClient
          .from("app_settings")
          .select("key, value")
          .in("key", ["misticpay_client_id", "misticpay_client_secret"]);

        const dbCi = dbKeys?.find(k => k.key === "misticpay_client_id")?.value;
        const dbCs = dbKeys?.find(k => k.key === "misticpay_client_secret")?.value;

        const ci = dbCi || Deno.env.get("MISTICPAY_CLIENT_ID");
        const cs = dbCs || Deno.env.get("MISTICPAY_CLIENT_SECRET");

        if (!ci || !cs) return json({ error: "MisticPay não configurado no servidor" }, 400);

        const endpoints = ["/users/balance", "/users/info"];
        for (const p of endpoints) {
          try {
            const r = await fetch(`https://api.misticpay.com/api${p}`, {
              headers: { ci, cs, "Content-Type": "application/json" }
            });
            const txt = await r.text();
            console.log(`[gateway-balance] ${p} → ${r.status}: ${txt.slice(0, 200)}`);
            if (r.ok) {
              const data = JSON.parse(txt);
              const balance = data.data?.balance ?? data.data?.availableBalance ?? data.balance;
              if (balance !== undefined && balance !== null) return json({ balance: String(balance) });
            }
          } catch (e) { console.error(`Error fetching balance from ${p}`, e); }
        }
        return json({ error: "Não foi possível obter o saldo do gateway" }, 500);
      }

      // /status do novo provedor é POST — convertemos GET status/usage para chamadas POST
      if (action === "status") {
        const r = await fetch(`${base}/status`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
        });
        const data = await safeJson(r);
        if (!r.ok) {
          return json({ provider_error: data?.error ?? `HTTP ${r.status}`, status: r.status }, 200);
        }
        return json(data, 200);
      }

      if (action === "usage" || action === "usage-all") {
        const limit = Number(url.searchParams.get("limit") ?? (action === "usage-all" ? "1000" : "50"));
        const per_page = Math.min(500, Math.max(1, limit));
        const r = await fetch(`${base}/list-licenses`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "all", page: 1, per_page }),
        });
        const data = await safeJson(r);
        if (!r.ok) {
          console.error(`[usage] Provider error: ${r.status} for ${base}/list-licenses`, data);
          return json({ usage: [], provider_error: data?.error ?? `HTTP ${r.status}`, status: r.status }, 200);
        }
        
        const items = Array.isArray(data?.licenses) ? data.licenses : [];
        console.log(`[usage] Provider returned ${items.length} licenses. First item fields: ${items.length > 0 ? Object.keys(items[0]).join(", ") : "none"}`);
        if (items.length > 0) {
          console.log(`[usage] First license sample:`, JSON.stringify(items[0]));
        }

        const usage = items.map((l: any) => {
          const isTrial = l.status === "trial" || (typeof l.license_key === "string" && l.license_key.startsWith("TRIAL-"));
          const isExpired = l.status === "expired";
          const lifetime = !!l.lifetime;
          const expires_at = l.expires_at || l.expiration || l.expire_at || l.valid_until || l.expiresAt || null;
          const days = typeof l.days === "number" ? l.days : (typeof l.duration_days === "number" ? l.duration_days : null);

          // Deriva license_type granular quando possível
          let license_type: string;
          if (isTrial) license_type = "trial";
          else if (lifetime) license_type = "lifetime";
          else if (days === 1) license_type = "pro_1d";
          else if (days === 7) license_type = "pro_7d";
          else if (days === 15) license_type = "pro_15d";
          else if (days === 30) license_type = "pro_30d";
          else license_type = "active";

          return {
            license_type,
            license_key: l.license_key,
            status: l.status,
            created_at: l.created_at,
            expires_at,
            lifetime,
            days,
            is_expired: isExpired || (isTrial && l.status === "revoked"),
            display_name: l.display_name || l.name || l.client_name || l.customer_name || l.label || l.description,
            creator_email: l.creator_email || null
          };
        });
        return json({ usage, raw: data }, 200);
      }

      if (action === "pricing") {
        const r = await fetch(`${base}/pricing`, {
          method: "POST",
          headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
        });
        const data = await safeJson(r);
        if (!r.ok) {
          return json({ provider_error: data?.error ?? `HTTP ${r.status}`, status: r.status }, 200);
        }
        return json(data, 200);
      }

      if (action === "revoke-license") {
        const body = await req.json().catch(() => ({}));
        const { license_key } = body;
        if (!license_key) return json({ ok: false, error: "license_key obrigatório" }, 200);

        console.log(`[revoke-license] FORCED Requesting: ${license_key} to ${base}/revoke-license (master key)`);
        const r = await fetch(`${base}/revoke-license`, {
          method: "POST",
          headers: { 
            "x-api-token": apiKey, 
            "x-api-key": apiKey, 
            "Content-Type": "application/json",
            "x-force-admin": "true" 
          },
          body: JSON.stringify({ license_key }),
        });
        const data = await safeJson(r);
        console.log(`[revoke-license] Response ${r.status}:`, data);
        if (!r.ok) {
          return json({ ok: false, provider_error: data?.error ?? `HTTP ${r.status}`, status: r.status, license_key }, 200);
        }
        return json({ ok: true, ...data }, 200);
      }

      if (action === "delete-license") {
        const body = await req.json().catch(() => ({}));
        const { license_key } = body;
        if (!license_key) return json({ ok: false, error: "license_key obrigatório" }, 200);

        console.log(`[delete-license] FORCED Requesting: ${license_key} to ${base}/delete-license (master key)`);
        const r = await fetch(`${base}/delete-license`, {
          method: "POST",
          headers: { 
            "x-api-token": apiKey, 
            "x-api-key": apiKey, 
            "Content-Type": "application/json",
            "x-force-admin": "true" 
          },
          body: JSON.stringify({ license_key }),
        });
        const data = await safeJson(r);
        console.log(`[delete-license] Response ${r.status}:`, data);
        if (!r.ok) {
          return json({ ok: false, provider_error: data?.error ?? `HTTP ${r.status}`, status: r.status, license_key }, 200);
        }
        return json({ ok: true, ...data }, 200);
      }

      if (action === "reset-hwid") {
        const body = await req.json().catch(() => ({}));
        const { license_key } = body;
        if (!license_key) return json({ ok: false, error: "license_key obrigatório" }, 200);

        console.log(`[reset-hwid] Requesting for key: ${license_key} to ${base}/reset-hwid`);
        const r = await fetch(`${base}/reset-hwid`, {
          method: "POST",
          headers: { 
            "x-api-token": apiKey, 
            "x-api-key": apiKey, 
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ license_key }),
        });
        const data = await safeJson(r);
        console.log(`[reset-hwid] Provider Response ${r.status}:`, data);
        if (!r.ok) {
          return json({ ok: false, provider_error: data?.error || data?.message || `HTTP ${r.status}`, status: r.status, license_key }, 200);
        }
        return json({ ok: true, ...data }, 200);
      }

      return json({ error: "Ação inválida" }, 400);
    }

    if (req.method === "POST" && (action === "generate" || action === "generate-trial")) {
      const body = await req.json().catch(() => ({}));
      const isTrial = action === "generate-trial";
      const allowedTypes = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];
      if (!isTrial && (!body?.type || !allowedTypes.includes(body.type))) {
        return json({ error: "Tipo de licença inválido" }, 400);
      }

      const payload: Record<string, unknown> = isTrial
        ? { minutes: 15, seconds: 0 }
        : mapTypeToProviderBody(body.type);
      if (typeof body.display_name === "string" && body.display_name.trim()) {
        payload.display_name = body.display_name.trim().slice(0, 100);
      }

      const endpoint = isTrial ? "/generate-trial" : "/generate-license";
      const r = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, creator_email: user?.email }),
      });
      const data = await safeJson(r);
      // Normaliza chave para `key` (o painel antigo usava `key`/`license_key`)
      if (data && typeof data === "object" && data.license_key && !data.key) data.key = data.license_key;
      return json(data, r.status);
    }

    if (req.method === "POST" && action === "public-generate-trial") {
      const body = await req.json().catch(() => ({}));
      const { name, phone } = body;
      if (!name || !phone) return json({ error: "Nome e telefone são obrigatórios" }, 400);

      const phoneDigits = String(phone).replace(/\D+/g, "").slice(0, 20);
      if (!phoneDigits) return json({ error: "Telefone inválido" }, 400);

      const rawIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "0.0.0.0";
      const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
      const IPV6_RE = /^[0-9a-fA-F:]+$/;
      const ip = IPV4_RE.test(rawIp) || IPV6_RE.test(rawIp) ? rawIp : "0.0.0.0";

      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await serviceClient
        .from("trial_registrations")
        .select("id")
        .or(`phone.eq.${phoneDigits},ip_address.eq.${ip}`)
        .gte("created_at", today)
        .limit(1)
        .maybeSingle();

      if (existing) return json({ error: "Você já gerou uma licença de teste hoje. Limite de 1 por dia." }, 403);

      const r = await fetch(`${base}/generate-trial`, {
        method: "POST",
        headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name.slice(0, 100), minutes: 15, seconds: 0 }),
      });
      const data = await safeJson(r);
      console.log("[public-generate-trial] provider response:", JSON.stringify(data));

      if (!r.ok) return json({ error: data?.error ?? "Erro ao gerar trial no provedor" }, r.status);

      const key = data?.license_key ?? data?.key ?? null;

      const { error: insErr } = await serviceClient.from("trial_registrations").insert({
        name, phone, ip_address: ip, license_key: key
      });
      if (insErr) console.error("Error saving registration", insErr);

      return json({ ...data, key });
    }

    if (req.method === "POST" && action === "public-reset-hwid") {
      const body = await req.json().catch(() => ({}));
      const license_key = typeof body.license_key === "string" ? body.license_key.trim() : "";

      if (!license_key) return json({ error: "Chave de licença é obrigatória" }, 400);

      const r = await fetch(`${base}/reset-hwid`, {
        method: "POST",
        headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ license_key }),
      });

      const data = await safeJson(r);
      if (!r.ok) {
        return json({ error: data?.error ?? "Erro ao resetar device no provedor" }, r.status);
      }

      return json({ success: true, message: "Device desvinculado com sucesso!" });
    }

    return json({ error: "Método/ação não suportada" }, 400);
  } catch (e) {
    console.error("[provider-api] error", e);
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});

function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 8) return "•".repeat(k.length);
  return `${k.slice(0, 4)}${"•".repeat(Math.max(4, k.length - 8))}${k.slice(-4)}`;
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function disabledFlowResponse(action: string) {
  const provider_error = "MétodoFlow está desativado temporariamente. O método ativo é LovaX.";
  if (action === "usage" || action === "usage-all") return { usage: [], provider_error, disabled: true };
  if (action === "pricing") return { prices: [], provider_error, disabled: true };
  if (action === "status") return { used: 0, max: 0, remaining: 0, provider_error, disabled: true };
  return { ok: false, provider_error, disabled: true };
}
async function safeJson(r: Response) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
