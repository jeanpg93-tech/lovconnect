// Painel: gestão de licenças (reset HWID, revogar, excluir).
// Usa o JWT do usuário logado (revendedor) para autenticar e repassa ao provedor.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const ALLOWED_ACTIONS = ["reset-hwid", "revoke-license", "delete-license"];

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const license_key = typeof body.license_key === "string" ? body.license_key.trim() : "";
  const order_id = typeof body.order_id === "string" ? body.order_id : "";

  if (!ALLOWED_ACTIONS.includes(action)) {
    return json({ error: "Ação inválida", allowed: ALLOWED_ACTIONS }, 400);
  }
  if (!license_key) return json({ error: "license_key obrigatório" }, 400);

  // Confirma que esse pedido pertence ao revendedor logado
  const { data: reseller } = await svc.from("resellers")
    .select("id, is_active").eq("user_id", userId).maybeSingle();
  if (!reseller || !reseller.is_active) return json({ error: "Reseller inativo" }, 403);

  let q = svc.from("orders")
    .select("id, reseller_id, license_key, status, is_legacy")
    .eq("license_key", license_key)
    .eq("reseller_id", reseller.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (order_id) q = svc.from("orders")
    .select("id, reseller_id, license_key, status, is_legacy")
    .eq("id", order_id)
    .eq("reseller_id", reseller.id)
    .limit(1);

  const { data: rows } = await q;
  const order = rows?.[0];
  if (!order) return json({ error: "Licença não encontrada" }, 404);
  const prevStatus = String((order as any).status ?? "").toLowerCase();
  if (order.license_key !== license_key) {
    return json({ error: "Licença não confere com o pedido" }, 400);
  }
  if (order.is_legacy) {
    return json({
      error: "Licença legado: foi gerada pelo provedor anterior e não pode mais ser gerenciada por aqui.",
    }, 409);
  }

  // Provedor
  const { data: cfg } = await svc.from("provider_settings")
    .select("api_key,base_url").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const provKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
  const base = cfg?.base_url ?? DEFAULT_BASE;
  if (!provKey) return json({ error: "Provedor não configurado" }, 502);

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
    return json({ error: "Erro ao chamar provedor", details: e instanceof Error ? e.message : null }, 502);
  }

  if (providerStatus < 200 || providerStatus >= 300) {
    const detailMsg =
      typeof providerData === "object" && providerData?.error
        ? String(providerData.error)
        : null;

    // 403/404 do provedor = a licença foi gerada por outra chave de API (provavelmente
    // antes da chave atual ter sido configurada). O upstream protege por dono.
    if (providerStatus === 403 || providerStatus === 404) {
      return json({
        error:
          "Esta licença foi gerada com uma chave de provedor diferente da configurada atualmente, " +
          "por isso não pode ser gerenciada por aqui. Apenas licenças criadas após a chave atual " +
          "ser configurada podem ser resetadas/revogadas/excluídas.",
        provider_status: providerStatus,
        provider_message: detailMsg,
      }, 409);
    }

    return json({
      error: detailMsg ?? "Provedor falhou",
      provider_status: providerStatus,
      details: providerData,
    }, providerStatus || 502);
  }

  if (action === "revoke-license") {
    await svc.from("orders").update({ status: "revoked" }).eq("id", order.id);
  } else if (action === "delete-license") {
    await svc.from("orders").update({ status: "deleted", license_key: null }).eq("id", order.id);
  }

  // Pack: devolve 1 crédito ao revendedor quando a chave é revogada/excluída.
  // Só refunda se o pedido estava 'completed' (para não refundar 2x se já
  // estiver revoked/deleted) e se o revendedor é Pack.
  let packRefunded = false;
  let packCreditsAfter: number | null = null;
  try {
    const { data: rInfoForRefund } = await svc
      .from("resellers")
      .select("billing_mode")
      .eq("id", reseller.id)
      .maybeSingle();
    const isPack = (rInfoForRefund as any)?.billing_mode === "pack";
    if (
      isPack &&
      (action === "revoke-license" || action === "delete-license") &&
      prevStatus === "completed"
    ) {
      const { data: refundRes, error: refundErr } = await svc.rpc("pack_refund_credit", {
        _reseller_id: reseller.id,
        _order_id: order.id,
        _description: action === "revoke-license"
          ? "Estorno: licença revogada"
          : "Estorno: licença excluída",
      });
      if (refundErr) {
        console.warn("pack_refund_credit failed", refundErr);
      } else {
        packRefunded = true;
        packCreditsAfter = typeof refundRes === "number" ? refundRes : null;
      }
    }
  } catch (e) {
    console.warn("pack refund block failed", e);
  }

  // Notifica gerente no Telegram (reset/revoke/delete)
  try {
    const { data: rInfo } = await svc
      .from("resellers")
      .select("display_name, billing_mode")
      .eq("id", reseller.id)
      .maybeSingle();
    const resellerName = (rInfo as any)?.display_name ?? "—";
    const isPack = (rInfo as any)?.billing_mode === "pack";
    const actionLabel =
      action === "reset-hwid" ? "HWID resetado" :
      action === "revoke-license" ? "Licença revogada" :
      "Licença excluída";
    const emoji =
      action === "reset-hwid" ? "♻️" :
      action === "revoke-license" ? "🚫" :
      "🗑️";
    const prefix = isPack ? "Pack — " : "";
    const txt =
      `${emoji} <b>${prefix}${actionLabel}</b>\n` +
      `👨‍💼 Revendedor: ${resellerName}\n` +
      `🔑 Chave: <code>${license_key}</code>\n` +
      `🆔 Pedido: <code>${order.id}</code>` +
      (packRefunded
        ? `\n💳 1 licença devolvida ao saldo` +
          (packCreditsAfter !== null ? ` (restam ${packCreditsAfter})` : "")
        : "");
    await svc.rpc("telegram_enqueue", { _text: txt });
  } catch (e) {
    console.warn("telegram_enqueue (license-action) failed", e);
  }

  return json({
    success: true,
    action,
    license_key,
    provider: providerData,
    pack_refunded: packRefunded,
    pack_credits_after: packCreditsAfter,
  });
});
