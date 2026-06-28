import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// Conta de testes do Jean Gomes (jeanpg.93). É a ÚNICA conta autorizada a usar
// esse endpoint — ele simula a confirmação de um PIX da MisticPay sem que o
// pagamento real exista, e dispara todo o fluxo normal do webhook (crédito de
// saldo, entrega de pack, notificação Telegram, etc).
const TEST_USER_ID = "beae9f73-5c2c-4878-bfc5-41e9e2faf15e";
const TEST_RESELLER_ID = "68fddcfb-5e1f-492c-be75-9a8a3d2a63fa";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

type Kind = "recharge" | "pack" | "activation" | "subscription" | "storefront";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveTxId(admin: any, kind: Kind, id: string): Promise<{ txId: string | null; resellerId: string | null }> {
  switch (kind) {
    case "recharge": {
      const { data } = await admin.from("recharge_intents")
        .select("provider_transaction_id, reseller_id").eq("id", id).maybeSingle();
      return { txId: data?.provider_transaction_id ?? null, resellerId: data?.reseller_id ?? null };
    }
    case "pack": {
      const { data } = await admin.from("reseller_pack_purchases")
        .select("provider_tx_id, reseller_id").eq("id", id).maybeSingle();
      return { txId: data?.provider_tx_id ?? null, resellerId: data?.reseller_id ?? null };
    }
    case "activation": {
      const { data } = await admin.from("activation_payments")
        .select("provider_transaction_id, reseller_id").eq("id", id).maybeSingle();
      return { txId: data?.provider_transaction_id ?? null, resellerId: data?.reseller_id ?? null };
    }
    case "subscription": {
      const { data } = await admin.from("reseller_subscription_charges")
        .select("provider_charge_id, reseller_id").eq("id", id).maybeSingle();
      return { txId: data?.provider_charge_id ?? null, resellerId: data?.reseller_id ?? null };
    }
    case "storefront": {
      const { data } = await admin.from("storefront_orders")
        .select("provider_transaction_id, reseller_id").eq("id", id).maybeSingle();
      return { txId: data?.provider_transaction_id ?? null, resellerId: data?.reseller_id ?? null };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // 1) Autentica o chamador via JWT (cabeçalho Authorization)
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "missing_auth" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "invalid_token" }, 401);

    // 2) Trava: SOMENTE Jean Gomes pode usar
    if (user.id !== TEST_USER_ID) {
      return json({ error: "forbidden", reason: "test_account_only" }, 403);
    }

    const body = await req.json().catch(() => ({} as any));
    const kind = String(body?.kind ?? "") as Kind;
    const id = String(body?.id ?? "");
    const allowed: Kind[] = ["recharge", "pack", "activation", "subscription", "storefront"];
    if (!allowed.includes(kind) || !id) {
      return json({ error: "bad_request", detail: "kind+id required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 3) Localiza o tx_id e valida que o registro é mesmo da conta de testes
    const { txId, resellerId } = await resolveTxId(admin, kind, id);
    if (!txId) return json({ error: "tx_not_found", detail: `${kind}#${id} sem transactionId`}, 404);
    if (resellerId !== TEST_RESELLER_ID) {
      return json({ error: "forbidden", reason: "record_not_owned_by_test_account" }, 403);
    }

    // 4) Dispara o misticpay-webhook com o cabeçalho de bypass de verificação
    const webhookUrl = `${SUPABASE_URL}/functions/v1/misticpay-webhook`;
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "x-test-bypass-token": SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        transactionId: txId,
        status: "COMPLETO",
        transactionType: "DEPOSITO",
        _simulated: true,
        _simulated_by: "dev-release-pix",
      }),
    });

    const text = await resp.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep raw */ }

    if (!resp.ok) {
      return json({ ok: false, status: resp.status, response: parsed }, 502);
    }
    return json({ ok: true, kind, id, txId, webhook: parsed });
  } catch (e) {
    console.error("dev-release-pix error", e);
    return json({ error: "internal_error", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});