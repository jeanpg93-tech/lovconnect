// Cron: compara os preços do provedor (/api/rsl/me → data.prices) com os
// custos cadastrados em claude_plan_prices.cost_cents e envia alerta no
// Telegram se houver divergência. Sem gravar preço automaticamente — só
// notifica o gerente para revisar.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLAUDE_API_KEY = Deno.env.get("CLAUDE_RESELLER_API_KEY")!;
const CLAUDE_BASE_URL = (Deno.env.get("CLAUDE_RESELLER_API_BASE_URL") ?? "").replace(/\/$/, "");

const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12h entre alertas para a mesma divergência

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const brl = (c: number) =>
  "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toCents(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Heurística: se veio > 1000 e inteiro, provavelmente já é centavos; senão é reais
  if (Number.isInteger(n) && n >= 1000) return Math.round(n);
  return Math.round(n * 100);
}

async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status !== 429 && r.status < 500) return r;
      if (i === tries - 1) return r;
      const retryAfter = Number(r.headers.get("retry-after") ?? "");
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : 500 * Math.pow(2, i);
      last = r;
      await new Promise((res) => setTimeout(res, waitMs));
      continue;
    } catch (e) {
      last = e;
    }
    await new Promise((res) => setTimeout(res, 500 * Math.pow(2, i)));
  }
  if (last instanceof Response) return last;
  throw last;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!CLAUDE_BASE_URL) return json({ error: "provider_not_configured" }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const r = await fetchWithRetry(`${CLAUDE_BASE_URL}/api/rsl/me`, {
      headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: "application/json" },
    });
    const txt = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch { /* noop */ }
    if (!r.ok) return json({ error: "provider_error", status: r.status, body: parsed }, 502);

    const prices: Record<string, unknown> = parsed?.data?.prices ?? parsed?.prices ?? {};
    if (!prices || typeof prices !== "object") {
      return json({ ok: true, skipped: "no_prices_field" });
    }

    const { data: local } = await admin
      .from("claude_plan_prices")
      .select("plan_code, cost_cents");
    const localMap = new Map<string, number>(
      (local ?? []).map((r: any) => [String(r.plan_code), Number(r.cost_cents) || 0]),
    );

    type Diff = { plan_code: string; local_cents: number | null; provider_cents: number };
    const diffs: Diff[] = [];
    for (const [plan, raw] of Object.entries(prices)) {
      const providerCents = toCents(raw);
      if (providerCents == null) continue;
      const localCents = localMap.get(plan) ?? null;
      if (localCents == null || localCents !== providerCents) {
        diffs.push({ plan_code: plan, local_cents: localCents, provider_cents: providerCents });
      }
    }

    if (!diffs.length) return json({ ok: true, in_sync: true, checked: Object.keys(prices).length });

    // Cooldown baseado em hash das divergências
    const sig = diffs
      .map((d) => `${d.plan_code}:${d.local_cents ?? "null"}->${d.provider_cents}`)
      .sort()
      .join("|");

    const SETTINGS_KEY = "claude_price_sync_state";
    const { data: prev } = await admin
      .from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    const prevSig = (prev?.value as any)?.sig;
    const prevAt = (prev?.value as any)?.last_alert_at
      ? new Date((prev!.value as any).last_alert_at).getTime()
      : 0;
    const now = Date.now();
    const shouldAlert = sig !== prevSig || now - prevAt > COOLDOWN_MS;

    if (shouldAlert) {
      const lines = diffs.map((d) => {
        const localStr = d.local_cents == null ? "<i>não cadastrado</i>" : brl(d.local_cents);
        return `• <code>${d.plan_code}</code>: ${localStr} → <b>${brl(d.provider_cents)}</b>`;
      });
      const text =
        `⚠️ <b>Divergência de custos Claude (fornecedor)</b>\n` +
        `Provedor retornou preços diferentes do cadastrado em <code>claude_plan_prices</code>:\n\n` +
        lines.join("\n") +
        `\n\nRevise na página do gerente e ajuste se necessário.`;
      await admin.from("telegram_outbox").insert({ text });

      await admin.from("app_settings").upsert({
        key: SETTINGS_KEY,
        value: { sig, last_alert_at: new Date().toISOString(), diffs },
      }, { onConflict: "key" });
    }

    return json({ ok: true, in_sync: false, diffs, alerted: shouldAlert });
  } catch (e) {
    console.error("[claude-price-sync] error", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});