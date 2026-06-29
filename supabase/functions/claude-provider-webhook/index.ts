import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('CLAUDE_PROVIDER_WEBHOOK_SECRET') ?? '';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await req.text();
  const signature = req.headers.get('x-webhook-signature') ?? req.headers.get('x-signature') ?? '';
  let signatureOk = false;
  if (WEBHOOK_SECRET) {
    try {
      const expected = await hmacHex(WEBHOOK_SECRET, raw);
      signatureOk = !!signature && safeEqual(signature.toLowerCase(), expected.toLowerCase());
    } catch { signatureOk = false; }
  }
  if (!signatureOk) return json({ error: 'invalid_signature' }, 401);

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const event = String(payload?.event ?? payload?.type ?? '').toLowerCase();
  const data = payload?.data ?? payload;
  const providerKeyId = String(data?.keyId ?? data?.key_id ?? data?.id ?? '').trim() || null;
  const providerEventId = String(payload?.id ?? payload?.eventId ?? `${event}:${providerKeyId}:${data?.occurredAt ?? data?.timestamp ?? Date.now()}`);

  // Dedupe via provider_event_id
  const { data: existing } = await admin
    .from('claude_provider_webhook_events')
    .select('id, processed_at')
    .eq('provider_event_id', providerEventId)
    .maybeSingle();
  if (existing?.processed_at) return json({ ok: true, deduped: true });

  // Match order
  let orderId: string | null = null;
  if (providerKeyId) {
    const { data: ord } = await admin
      .from('claude_orders')
      .select('id, status')
      .eq('provider_key_id', providerKeyId)
      .maybeSingle();
    orderId = ord?.id ?? null;

    if (orderId) {
      const now = new Date().toISOString();
      const patch: Record<string, any> = {};
      switch (event) {
        case 'key.redeemed':
          patch.status = 'redeemed';
          patch.redeemed_at = data?.redeemedAt ?? now;
          if (data?.email && !ord?.status) patch.customer_email = data.email;
          break;
        case 'key.cancelled':
          if (ord?.status !== 'cancelled') {
            patch.status = 'cancelled';
            patch.cancelled_at = data?.cancelledAt ?? now;
          }
          break;
        case 'key.expired':
          patch.status = 'expired';
          patch.expired_at = data?.expiredAt ?? now;
          break;
        case 'tokens.limit_reached':
          patch.tokens_exhausted_at = data?.reachedAt ?? now;
          break;
        case 'key.created':
          // já registrado localmente — no-op
          break;
      }
      if (Object.keys(patch).length) {
        await admin.from('claude_orders').update(patch).eq('id', orderId);
      }
    }
  }

  await admin.from('claude_provider_webhook_events').upsert({
    provider_event_id: providerEventId,
    event,
    provider_key_id: providerKeyId,
    order_id: orderId,
    payload,
    signature_ok: true,
    processed_at: new Date().toISOString(),
  }, { onConflict: 'provider_event_id' });

  return json({ ok: true, event, order_id: orderId });
});