import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const PROVIDER_BASE = "https://lojinhalovable.com/api/v1/revenda";

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

function brl(c: number) {
  return "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Cron-triggered balance check. No user input; only reads provider balances
  // and inserts an alert into telegram_outbox when below threshold.
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
  const criticalThreshold = Number(s.low_balance_critical_threshold_cents ?? 3000);
  const COOLDOWN_MS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  const prov = await fetchProviderBalanceCents(supabase);

  const updates: Record<string, any> = {};
  const messages: string[] = [];

  // Lojinha (Provedor) — 2 níveis: aviso e crítico
  if (prov != null) {
    const lastWarn = s.last_low_provider_alert_at ? new Date(s.last_low_provider_alert_at).getTime() : 0;
    const lastCrit = s.last_low_provider_critical_alert_at ? new Date(s.last_low_provider_critical_alert_at).getTime() : 0;

    if (prov < criticalThreshold) {
      // CRÍTICO
      if (!lastCrit || now - lastCrit > COOLDOWN_MS) {
        messages.push(
          `🚨 <b>Saldo CRÍTICO na Lojinha</b>\n` +
          `🏪 Saldo atual: <b>${brl(prov)}</b>\n` +
          `📉 Limite crítico: ${brl(criticalThreshold)}\n` +
          `⛔ Vendas maiores que o saldo NÃO serão entregues. Recarregue agora!`
        );
        updates.last_low_provider_critical_alert_at = new Date().toISOString();
      }
    } else if (prov < threshold) {
      // AVISO
      if (!lastWarn || now - lastWarn > COOLDOWN_MS) {
        messages.push(
          `🔻 <b>Saldo BAIXO na Lojinha</b>\n` +
          `🏪 Saldo atual: <b>${brl(prov)}</b>\n` +
          `📉 Limite de aviso: ${brl(threshold)}\n` +
          `⚠️ Recarregue para evitar que vendas maiores que o saldo falhem.`
        );
        updates.last_low_provider_alert_at = new Date().toISOString();
      }
      // saiu da zona crítica → reseta cooldown crítico
      if (lastCrit) updates.last_low_provider_critical_alert_at = null;
    } else {
      // saldo OK → reseta ambos
      if (lastWarn) updates.last_low_provider_alert_at = null;
      if (lastCrit) updates.last_low_provider_critical_alert_at = null;
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
    threshold_cents: threshold,
    critical_threshold_cents: criticalThreshold,
    alerts_sent: messages.length,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});