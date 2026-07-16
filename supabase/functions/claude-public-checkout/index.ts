// Público (sem JWT) — cria/reaproveita cliente Claude do revendedor, gera PIX
// no MisticPay do próprio revendedor e devolve QR + copia-e-cola.
// O misticpay-webhook confirma o pagamento e emite a chave via debit + provedor.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { maintenanceGuard } from "../_shared/maintenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MISTIC_BASE = "https://api.misticpay.com/api";

const PLAN_LABELS: Record<string, string> = {
  "pro_30d": "Pro — 30 dias",
  "5x_7d": "5x — 7 dias",
  "5x_30d": "5x — 30 dias",
  "20x_30d": "20x — 30 dias",
  "api_500k_30d": "API 500K · 30 dias",
  "api_25m_30d": "API 2,5M · 30 dias",
  "api_10m_30d": "API 10M · 30 dias",
};
const PLAN_CODES = new Set(Object.keys(PLAN_LABELS));

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function randomPassword(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

function computeSalePrice(cost: number, mode: string, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    {{
      const _maintClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const _maintResp = await maintenanceGuard(_maintClient, corsHeaders);
      if (_maintResp) return _maintResp;
    }}
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));

    const slug = String(body?.reseller_slug ?? "").trim().toLowerCase();
    const resellerIdIn = String(body?.reseller_id ?? "").trim();
    const planCode = String(body?.plan_code ?? "").trim();
    const name = String(body?.name ?? "").trim().slice(0, 120);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const whatsapp = body?.whatsapp ? String(body.whatsapp).replace(/\D+/g, "").slice(0, 15) : null;
    const payerDocument = String(body?.payer_document ?? "").replace(/\D/g, "") || "00000000000";

    if (!PLAN_CODES.has(planCode)) return json({ error: "invalid_plan_code" }, 400);
    if (name.length < 2) return json({ error: "name_required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);

    // Resolve revendedor
    let resellerQuery = admin.from("resellers").select("id, display_name, slug, is_active, claude_enabled");
    resellerQuery = slug ? resellerQuery.eq("slug", slug) : resellerQuery.eq("id", resellerIdIn);
    const { data: reseller } = await resellerQuery.maybeSingle();
    if (!reseller || !(reseller as any).is_active) return json({ error: "reseller_not_found" }, 404);
    if (!(reseller as any).claude_enabled) return json({ error: "claude_not_enabled" }, 403);
    const resellerId = (reseller as any).id as string;

    // Preço
    const [{ data: def }, { data: ov }] = await Promise.all([
      admin.from("claude_plan_prices").select("cost_cents, sale_price_cents, is_active").eq("plan_code", planCode).maybeSingle(),
      admin.from("claude_reseller_price_overrides").select("markup_mode, markup_value_cents, is_active").eq("reseller_id", resellerId).eq("plan_code", planCode).maybeSingle(),
    ]);
    if (!def?.is_active) return json({ error: "plan_not_active" }, 400);
    let saleCents = (def as any).sale_price_cents as number;
    if (ov && (ov as any).is_active) saleCents = computeSalePrice((def as any).cost_cents, (ov as any).markup_mode, (ov as any).markup_value_cents);
    if (saleCents <= 0) return json({ error: "invalid_price" }, 400);

    // MisticPay do revendedor
    const { data: integ } = await admin
      .from("reseller_integrations")
      .select("misticpay_client_id, misticpay_client_secret")
      .eq("reseller_id", resellerId)
      .maybeSingle();
    const ci = (integ as any)?.misticpay_client_id;
    const cs = (integ as any)?.misticpay_client_secret;
    if (!ci || !cs) return json({ error: "reseller_misticpay_not_configured" }, 400);

    // Cliente Claude (cria auth user se novo)
    let generatedPassword: string | null = null;
    const { data: existingCustomer } = await admin
      .from("claude_customers")
      .select("id, auth_user_id")
      .eq("reseller_id", resellerId)
      .eq("email", email)
      .maybeSingle();

    let customerId = (existingCustomer as any)?.id as string | undefined;
    let authUserId = (existingCustomer as any)?.auth_user_id as string | null | undefined;

    if (!authUserId) {
      // SECURITY: nunca vincular esse pedido a um usuário existente no auth.users
      // apenas por e-mail — isso permite account takeover (o atacante conhece o
      // e-mail da vítima e passa a criar pedidos/cobranças vinculados à conta dela).
      // Sempre cria um novo usuário auth. Se o e-mail já existir, o próprio
      // Supabase Auth retorna erro e o cliente deve fazer login primeiro.
      generatedPassword = randomPassword(14);
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { name, claude_customer: true, reseller_id: resellerId },
      });
      if (cErr || !created?.user) {
        const msg = String(cErr?.message ?? "").toLowerCase();
        if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          return json({
            error: "email_already_registered",
            detail: "Este e-mail já possui conta. Faça login antes de comprar para vincular o pedido à sua conta.",
          }, 409);
        }
        return json({ error: "auth_create_failed", detail: cErr?.message }, 500);
      }
      authUserId = created.user.id;
    }

    if (!customerId) {
      const { data: ins, error: iErr } = await admin
        .from("claude_customers")
        .insert({
          reseller_id: resellerId,
          auth_user_id: authUserId,
          name,
          email,
          whatsapp,
          must_change_password: !!generatedPassword,
        })
        .select("id")
        .single();
      if (iErr) return json({ error: "customer_create_failed", detail: iErr.message }, 500);
      customerId = ins.id;
    } else if (!(existingCustomer as any)?.auth_user_id && authUserId) {
      await admin.from("claude_customers").update({ auth_user_id: authUserId }).eq("id", customerId);
    }

    // Reaproveita PIX ainda vivo
    const nowIso = new Date().toISOString();
    const { data: existingOrder } = await admin
      .from("claude_orders")
      .select("*")
      .eq("customer_id", customerId)
      .eq("plan_code", planCode)
      .eq("status", "awaiting_payment")
      .gt("pix_expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingOrder) {
      return json({
        ok: true,
        reused: true,
        order_id: (existingOrder as any).id,
        customer_id: customerId,
        generated_password: null,
        qr_code_base64: (existingOrder as any).qr_code_base64,
        copy_paste: (existingOrder as any).copy_paste,
        pix_expires_at: (existingOrder as any).pix_expires_at,
        sale_price_cents: (existingOrder as any).sale_price_cents,
      });
    }

    // Cria pedido
    const { data: order, error: oErr } = await admin
      .from("claude_orders")
      .insert({
        reseller_id: resellerId,
        customer_id: customerId,
        customer_email: email,
        customer_name: name,
        customer_whatsapp: whatsapp,
        plan_code: planCode,
        cost_cents: (def as any).cost_cents,
        sale_price_cents: saleCents,
        profit_cents: saleCents - (def as any).cost_cents,
        status: "awaiting_payment",
        is_renewal: false,
      })
      .select()
      .single();
    if (oErr || !order) return json({ error: oErr?.message ?? "order_insert_failed" }, 500);

    const webhookUrl = `${SUPABASE_URL}/functions/v1/misticpay-webhook`;
    const mpResp = await fetch(`${MISTIC_BASE}/transactions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ci, cs },
      body: JSON.stringify({
        amount: saleCents / 100,
        payerName: name,
        payerDocument,
        transactionId: (order as any).id,
        description: `Claude ${PLAN_LABELS[planCode]}`,
        projectWebhook: webhookUrl,
      }),
    });
    const mpJson = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("claude_orders").update({
        status: "failed",
        error_message: `misticpay_${mpResp.status}`,
        provider_response: mpJson,
      }).eq("id", (order as any).id);
      return json({ error: mpJson?.message ?? "misticpay_error", details: mpJson }, 502);
    }

    const d = mpJson.data ?? {};
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await admin
      .from("claude_orders")
      .update({
        provider_transaction_id: String(d.transactionId ?? (order as any).id),
        qr_code_base64: d.qrCodeBase64 ?? null,
        copy_paste: d.copyPaste ?? null,
        pix_expires_at: expiresAt,
        provider_response: mpJson,
      })
      .eq("id", (order as any).id);

    return json({
      ok: true,
      order_id: (order as any).id,
      customer_id: customerId,
      generated_password: generatedPassword,
      qr_code_base64: d.qrCodeBase64 ?? null,
      copy_paste: d.copyPaste ?? null,
      pix_expires_at: expiresAt,
      sale_price_cents: saleCents,
    });
  } catch (e) {
    console.error("[claude-public-checkout]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});