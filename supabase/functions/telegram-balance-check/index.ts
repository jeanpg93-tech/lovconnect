import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const PROVIDER_BASE = "https://lojinhalovable.com/api/v1/revenda";
const MISTIC_BASE = "https://api.misticpay.com/api";

async function fetchProviderBalanceCents(client: any): Promise<number | null> {
  try {
    const { data: master } = await client
      .from("app_settings").select("value").eq("key", "lovable_credits_master").maybeSingle();
    const apiKey: string | undefined = master?.value?.api_key;
    if (!apiKey) return null;
    const r = await fetch(`${PROVIDER_BASE}/saldo`, {
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const reais = d?.data?.saldoReais ?? d?.saldoReais;
    const cents = d?.data?.saldoCentavos ?? d?.saldoCentavos;
    if (cents != null) return Math.round(Number(cents));
    if (reais != null) return Math.round(Number(reais) * 100);
    return null;
  } catch (e) {
    console.error("provider balance fetch failed", e);
    return null;
  }
}

async function fetchGatewayBalanceCents(client: any): Promise<number | null> {
  try {
    const { data: keys } = await client
      .from("app_settings").select("key, value")
      .in("key", ["misticpay_client_id", "misticpay_client_secret"]);
    const ci = keys?.find((k: any) => k.key === "misticpay_client_id")?.value
      ?? Deno.env.get("MISTICPAY_CLIENT_ID");
    const cs = keys?.find((k: any) => k.key === "misticpay_client_secret")?.value
      ?? Deno.env.get("MISTICPAY_CLIENT_SECRET");
    if (!ci || !cs) return null;
    for (const p of ["/users/balance", "/users/info"]) {
      const r = await fetch(`${MISTIC_BASE}${p}`, {
        headers: { ci, cs, "Content-Type": "application/json" },
      });
      if (!r.ok) continue;
      const d = await r.json();
      const bal = d?.data?.balance ?? d?.data?.availableBalance ?? d?.balance;
      if (bal != null) return Math.round(Number(bal) * 100);
    }
    return null;
  } catch (e) {
    console.error("gateway balance fetch failed", e);
    return null;
  }
}

function brl(c: number) {
  return "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: s } = await supabase.from("telegram_settings").select("*").eq("id", 1).maybeSingle();
  if (!s || !s.chat_id || !s.notify_low_balance) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const threshold = Number(s.low_balance_threshold_cents ?? 5000);
  const COOLDOWN_MS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  const [prov, gw] = await Promise.all([
    fetchProviderBalanceCents(supabase),
    fetchGatewayBalanceCents(supabase),
  ]);

  const updates: Record<string, any> = {};
  const messages: string[] = [];

  // Provider
  if (prov != null) {
    const last = s.last_low_provider_alert_at ? new Date(s.last_low_provider_alert_at).getTime() : 0;
    if (prov < threshold) {
      if (!last || now - last > COOLDOWN_MS) {
        messages.push(
          `🔻 <b>Saldo BAIXO no Provedor</b>\n` +
          `💼 Saldo atual: <b>${brl(prov)}</b>\n` +
          `📉 Limite: ${brl(threshold)}\n` +
          `⚠️ Recarregue para evitar interrupção nas entregas de licenças/créditos.`
        );
        updates.last_low_provider_alert_at = new Date().toISOString();
      }
    } else if (last) {
      updates.last_low_provider_alert_at = null;
    }
  }

  // Gateway (Loja/MisticPay)
  if (gw != null) {
    const last = s.last_low_gateway_alert_at ? new Date(s.last_low_gateway_alert_at).getTime() : 0;
    if (gw < threshold) {
      if (!last || now - last > COOLDOWN_MS) {
        messages.push(
          `🔻 <b>Saldo BAIXO na Lojinha (Gateway PIX)</b>\n` +
          `🏪 Saldo MisticPay: <b>${brl(gw)}</b>\n` +
          `📉 Limite: ${brl(threshold)}\n` +
          `⚠️ Faça um saque/transferência ou revise antes que afete operações.`
        );
        updates.last_low_gateway_alert_at = new Date().toISOString();
      }
    } else if (last) {
      updates.last_low_gateway_alert_at = null;
    }
  }

  for (const text of messages) {
    await supabase.from("telegram_outbox").insert({ text });
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("telegram_settings").update(updates).eq("id", 1);
  }

  return new Response(JSON.stringify({
    ok: true,
    provider_cents: prov,
    gateway_cents: gw,
    threshold_cents: threshold,
    alerts_sent: messages.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});