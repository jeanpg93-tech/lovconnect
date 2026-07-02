// Cria cobrança Pix MisticPay para o revendedor comprar um pacote de créditos.
// Após pagamento confirmado pelo webhook (misticpay-webhook), os créditos são liberados.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MISTIC_BASE = "https://api.misticpay.com/api";

const PROVIDER_DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const LOVAX_DEFAULT_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

const safeJson = async (r: Response) => { try { return await r.json(); } catch { return null; } };

async function getFlowRemaining(admin: any): Promise<number> {
  try {
    const { data: cfg } = await admin
      .from("provider_settings").select("api_key, base_url")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? PROVIDER_DEFAULT_BASE;
    if (!apiKey) return 0;
    const r = await fetch(`${base}/status`, {
      method: "POST",
      headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
    });
    if (!r.ok) return 0;
    const data: any = await safeJson(r);
    const used = Number(data?.used ?? 0);
    const max = Number(data?.max ?? data?.limit ?? 0);
    if (!max || max <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, max - used);
  } catch { return 0; }
}

async function getLovaxRemaining(admin: any): Promise<number> {
  try {
    const { data } = await admin.from("app_settings").select("key, value").in("key", ["lovax_api_token", "lovax_base_url"]);
    const apiKey = (data?.find((r: any) => r.key === "lovax_api_token") as any)?.value;
    const base = ((data?.find((r: any) => r.key === "lovax_base_url") as any)?.value) || LOVAX_DEFAULT_BASE;
    if (!apiKey) return 0;
    const r = await fetch(base, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "balance", payload: {} }),
    });
    if (!r.ok) return 0;
    const d: any = await safeJson(r);
    if (!d?.success) return 0;
    const b = d.balance;
    if (b && typeof b === "object") return Math.max(0, Number(b.keys_available ?? 0));
    if (typeof b === "number") return Math.max(0, b);
    return 0;
  } catch { return 0; }
}

async function computeRealAvailable(admin: any): Promise<number> {
  const [flow, lovax, commitRes] = await Promise.all([
    getFlowRemaining(admin),
    getLovaxRemaining(admin),
    admin.rpc("get_pack_commitments"),
  ]);
  const committedRow = Array.isArray(commitRes?.data) ? commitRes.data[0] : commitRes?.data;
  const committed = Number(committedRow?.committed_credits ?? 0);
  const total = flow + lovax;
  return Number.isFinite(total) ? Math.max(0, total - committed) : Number.POSITIVE_INFINITY;
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getManagerMisticCreds(admin: any): Promise<{ ci: string | null; cs: string | null }> {
  let ci = Deno.env.get("MISTICPAY_CLIENT_ID") ?? null;
  let cs = Deno.env.get("MISTICPAY_CLIENT_SECRET") ?? null;
  if (ci && cs) return { ci, cs };
  try {
    const { data } = await admin.from("app_settings")
      .select("key, value")
      .in("key", ["misticpay_client_id", "misticpay_client_secret"]);
    for (const row of (data ?? []) as any[]) {
      const v = typeof row.value === "string" ? row.value : (row.value?.value ?? row.value);
      if (row.key === "misticpay_client_id" && !ci) ci = v ?? null;
      if (row.key === "misticpay_client_secret" && !cs) cs = v ?? null;
    }
  } catch {}
  return { ci, cs };
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
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const pack_id = String(body.pack_id ?? "");
    if (!pack_id) return json({ error: "pack_id obrigatório" }, 400);

    // Gate global: gerente pode desligar vendas de Packs para todos os revendedores
    const { data: globalToggle } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", "packs_sales_enabled_globally")
      .maybeSingle();
    if ((globalToggle?.value as any) === false) {
      return json({ error: "Vendas de Packs temporariamente indisponíveis" }, 403);
    }

    // Valida revendedor
    const { data: reseller } = await admin
      .from("resellers")
      .select("id, display_name, user_id, billing_mode")
      .eq("user_id", userId)
      .maybeSingle();
    if (!reseller) return json({ error: "Revendedor não encontrado" }, 404);
    if ((reseller as any).billing_mode !== "pack") {
      return json({ error: "Modo Pack não habilitado para este revendedor" }, 403);
    }

    // Carrega pacote
    const { data: pack } = await admin
      .from("license_packs")
      .select("id, name, credits, price_cents, is_active")
      .eq("id", pack_id)
      .maybeSingle();
    if (!pack || !(pack as any).is_active) return json({ error: "Pacote indisponível" }, 404);

    // Valida estoque real (estoque dos provedores − créditos já comprometidos em packs)
    const realAvailable = await computeRealAvailable(admin);
    if (Number((pack as any).credits ?? 0) > realAvailable) {
      return json({ error: "Pacote temporariamente indisponível" }, 409);
    }

    const { data: prof } = await admin
      .from("profiles").select("display_name, email")
      .eq("id", (reseller as any).user_id).maybeSingle();
    const payerName = prof?.display_name ?? (reseller as any).display_name ?? "Revendedor";
    const payerDoc = String(body.payer_document ?? "00000000000").replace(/\D/g, "");

    // Cria registro de compra pendente
    const { data: purchase, error: insErr } = await admin
      .from("reseller_pack_purchases")
      .insert({
        reseller_id: (reseller as any).id,
        pack_id: (pack as any).id,
        pack_name: (pack as any).name,
        credits: (pack as any).credits,
        price_cents: (pack as any).price_cents,
        status: "pending",
        provider: "misticpay",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (insErr || !purchase) return json({ error: insErr?.message ?? "insert error" }, 500);

    const { ci, cs } = await getManagerMisticCreds(admin);
    if (!ci || !cs) {
      await admin.from("reseller_pack_purchases")
        .update({ status: "cancelled" })
        .eq("id", (purchase as any).id);
      return json({ error: "MisticPay do gerente não configurado" }, 500);
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/misticpay-webhook`;
    const mpResp = await fetch(`${MISTIC_BASE}/transactions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ci, cs },
      body: JSON.stringify({
        amount: (pack as any).price_cents / 100,
        payerName,
        payerDocument: payerDoc,
        transactionId: (purchase as any).id,
        description: `Pack ${(pack as any).name} (${(pack as any).credits} créditos) — ${(reseller as any).display_name ?? ""}`.trim(),
        projectWebhook: webhookUrl,
      }),
    });
    const mpJson = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("reseller_pack_purchases").update({ status: "cancelled" }).eq("id", (purchase as any).id);
      return json({ error: mpJson?.message ?? "Erro MisticPay", details: mpJson }, 502);
    }

    const d = mpJson.data ?? {};
    await admin.from("reseller_pack_purchases").update({
      provider_tx_id: String(d.transactionId ?? ""),
      pix_qr_code: d.qrCodeBase64 ?? null,
      pix_copy_paste: d.copyPaste ?? null,
    }).eq("id", (purchase as any).id);

    return json({
      purchase_id: (purchase as any).id,
      provider_transaction_id: d.transactionId,
      qr_code_base64: d.qrCodeBase64,
      copy_paste: d.copyPaste,
      amount_cents: (pack as any).price_cents,
      credits: (pack as any).credits,
      pack_name: (pack as any).name,
    });
  } catch (e: any) {
    console.error("pack-create-purchase error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});