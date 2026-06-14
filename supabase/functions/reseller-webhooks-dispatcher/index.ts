// Reseller Webhooks Dispatcher
// Lê reseller_api_webhook_deliveries pendentes (delivered_at IS NULL, attempt < 6)
// e envia HTTP POST com assinatura HMAC-SHA256.
// Retry exponencial: 1m, 5m, 15m, 1h, 6h.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const MAX_ATTEMPTS = 6;
const BATCH = 50;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  const authorized = auth === `Bearer ${SERVICE_ROLE}` || auth === `Bearer ${ANON_KEY}` || apikey === ANON_KEY;
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pega entregas pendentes elegíveis (criadas há tempo suficiente para a tentativa atual)
  const { data: pending, error } = await svc
    .from("reseller_api_webhook_deliveries")
    .select("id, reseller_id, api_key_id, event, payload, target_url, attempt, created_at")
    .is("delivered_at", null)
    .lt("attempt", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const d of pending ?? []) {
    // Verifica se já passou o delay para esta tentativa
    const delayIdx = Math.max(0, (d.attempt as number) - 1);
    const requiredDelay = RETRY_DELAYS_MS[Math.min(delayIdx, RETRY_DELAYS_MS.length - 1)];
    const ageMs = now - new Date(d.created_at).getTime();
    if (d.attempt > 1 && ageMs < requiredDelay) {
      skipped++;
      continue;
    }

    // Pega o secret da api_key
    const { data: keyRow } = await svc
      .from("reseller_api_keys")
      .select("webhook_secret")
      .eq("id", d.api_key_id)
      .maybeSingle();

    const secret = (keyRow?.webhook_secret ?? "").toString();
    const bodyStr = JSON.stringify(d.payload);
    const signature = secret ? await hmacSha256Hex(secret, bodyStr) : "";

    let respStatus = 0;
    let respBody = "";
    try {
      const r = await fetch(d.target_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Delivery": d.id,
          "X-Webhook-Event": d.event,
          "X-Webhook-Attempt": String(d.attempt),
          "User-Agent": "ResellerWebhooks/1.0",
        },
        body: bodyStr,
        signal: AbortSignal.timeout(10_000),
      });
      respStatus = r.status;
      respBody = (await r.text().catch(() => "")).slice(0, 1000);
    } catch (e) {
      respStatus = 0;
      respBody = `network: ${(e as Error).message}`.slice(0, 1000);
    }

    const isOk = respStatus >= 200 && respStatus < 300;
    await svc
      .from("reseller_api_webhook_deliveries")
      .update({
        attempt: (d.attempt as number) + 1,
        response_status: respStatus,
        response_body: respBody,
        delivered_at: isOk ? new Date().toISOString() : null,
      })
      .eq("id", d.id);

    if (isOk) sent++;
    else failed++;
  }

  return new Response(
    JSON.stringify({ ok: true, processed: pending?.length ?? 0, sent, failed, skipped }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
