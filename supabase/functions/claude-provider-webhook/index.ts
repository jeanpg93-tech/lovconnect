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

function fmtCents(cents: number | null | undefined) {
  const n = Number(cents ?? 0) / 100;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function notifyManagerTelegram(admin: any, text: string, refKind: string, refId: string) {
  try {
    const { data: settings } = await admin
      .from('telegram_settings').select('chat_id').eq('id', 1).maybeSingle();
    if (!settings?.chat_id) return;
    const { data: existing } = await admin
      .from('telegram_outbox').select('id')
      .eq('reference_kind', refKind).eq('reference_id', refId).limit(1);
    if (existing && existing.length > 0) return;
    await admin.from('telegram_outbox').insert({
      text, reference_kind: refKind, reference_id: refId,
    });
  } catch (e) { console.warn('[claude-webhook] telegram notify failed', e); }
}

async function notifyResellerWhatsapp(resellerId: string | null, message: string) {
  if (!resellerId) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/system-whatsapp-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ mode: 'manual', reseller_ids: [resellerId], message }),
    });
  } catch (e) { console.warn('[claude-webhook] whatsapp notify failed', e); }
}

async function forwardToResellerWebhook(
  admin: any,
  resellerId: string | null,
  event: string,
  payload: Record<string, unknown>,
) {
  if (!resellerId) return;
  try {
    // Configuração dedicada de webhook do revendedor (fonte oficial)
    const { data: dedicated } = await admin
      .from('reseller_claude_api_keys')
      .select('webhook_url, webhook_secret')
      .eq('reseller_id', resellerId)
      .eq('label', '__webhook_config__')
      .not('webhook_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const cfg = dedicated?.webhook_url ? dedicated : (
      await admin
        .from('reseller_claude_api_keys')
        .select('webhook_url, webhook_secret')
        .eq('reseller_id', resellerId)
        .eq('is_active', true)
        .not('webhook_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data;
    if (!cfg?.webhook_url) return;
    const body = JSON.stringify({
      event,
      ...payload,
      sent_at: new Date().toISOString(),
    });
    const sig = cfg.webhook_secret
      ? `sha256=${await hmacHex(cfg.webhook_secret, body)}`
      : '';
    await fetch(cfg.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LovConnect-Webhook/1.0',
        ...(sig ? { 'X-Signature': sig } : {}),
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.warn('[claude-webhook] forward to reseller failed', e);
  }
}

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
  const rawSig = req.headers.get('x-webhook-signature') ?? req.headers.get('x-signature') ?? '';
  // Providers frequently prefix the digest with `sha256=`; accept both formats.
  const signature = rawSig.replace(/^sha256=/i, '').trim();
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

  // Dedupe atômico: tenta CLAIM da linha via INSERT com ON CONFLICT DO NOTHING.
  // Se outra execução concorrente já inseriu, esta retorna sem linhas e sai.
  const { data: claim } = await admin
    .from('claude_provider_webhook_events')
    .insert({
      provider_event_id: providerEventId,
      event,
      provider_key_id: providerKeyId,
      payload,
      signature_ok: true,
    })
    .select('id')
    .maybeSingle();
  if (!claim?.id) return json({ ok: true, deduped: true });

  // Match order
  let orderId: string | null = null;
  let orderRow: any = null;
  if (providerKeyId) {
    const { data: ord } = await admin
      .from('claude_orders')
      .select('id, status, reseller_id, customer_email, customer_name, plan_code, sale_price_cents')
      .eq('provider_key_id', providerKeyId)
      .maybeSingle();
    orderId = ord?.id ?? null;
    orderRow = ord ?? null;

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

      // ---------- Notificações ----------
      const { data: reseller } = orderRow?.reseller_id
        ? await admin.from('resellers').select('display_name').eq('id', orderRow.reseller_id).maybeSingle()
        : { data: null } as any;
      const resellerName = reseller?.display_name ?? '—';
      const clientLabel = orderRow?.customer_name ?? orderRow?.customer_email ?? '—';
      const planLabel = orderRow?.plan_code ?? '—';
      const priceLabel = fmtCents(orderRow?.sale_price_cents);

      switch (event) {
        case 'key.redeemed': {
          await notifyManagerTelegram(
            admin,
            `✅ <b>Claude — Chave resgatada</b>\n` +
            `👨‍💼 Revendedor: ${resellerName}\n` +
            `👤 Cliente: ${clientLabel}\n` +
            `📦 Plano: ${planLabel}\n` +
            `🆔 Pedido: <code>${orderId}</code>`,
            'claude_key_redeemed', orderId,
          );
          await notifyResellerWhatsapp(
            orderRow?.reseller_id,
            `✅ Seu cliente *${clientLabel}* acabou de ativar a chave Claude (${planLabel}).`,
          );
          await forwardToResellerWebhook(admin, orderRow?.reseller_id ?? null, 'claude.key.redeemed', {
            order_id: orderId,
            customer_email: orderRow?.customer_email ?? null,
            plan_code: orderRow?.plan_code ?? null,
          });
          break;
        }
        case 'tokens.limit_reached': {
          await notifyManagerTelegram(
            admin,
            `⚠️ <b>Claude — Tokens esgotados</b>\n` +
            `👨‍💼 Revendedor: ${resellerName}\n` +
            `👤 Cliente: ${clientLabel}\n` +
            `📦 Plano: ${planLabel} (${priceLabel})\n` +
            `🆔 Pedido: <code>${orderId}</code>`,
            'claude_tokens_exhausted', orderId,
          );
          await notifyResellerWhatsapp(
            orderRow?.reseller_id,
            `⚠️ Cliente *${clientLabel}* esgotou os tokens do plano Claude (${planLabel}). ` +
            `Oportunidade de renovação — ele já pode renovar pelo Portal.`,
          );
          await forwardToResellerWebhook(admin, orderRow?.reseller_id ?? null, 'claude.tokens.limit_reached', {
            order_id: orderId,
            customer_email: orderRow?.customer_email ?? null,
            plan_code: orderRow?.plan_code ?? null,
          });
          break;
        }
        case 'key.expired': {
          await notifyManagerTelegram(
            admin,
            `⏰ <b>Claude — Chave expirada</b>\n` +
            `👨‍💼 Revendedor: ${resellerName}\n` +
            `👤 Cliente: ${clientLabel}\n` +
            `📦 Plano: ${planLabel}\n` +
            `🆔 Pedido: <code>${orderId}</code>`,
            'claude_key_expired', orderId,
          );
          await notifyResellerWhatsapp(
            orderRow?.reseller_id,
            `⏰ A chave Claude do cliente *${clientLabel}* (${planLabel}) expirou. Ele já pode renovar pelo Portal.`,
          );
          await forwardToResellerWebhook(admin, orderRow?.reseller_id ?? null, 'claude.key.expired', {
            order_id: orderId,
            customer_email: orderRow?.customer_email ?? null,
            plan_code: orderRow?.plan_code ?? null,
          });
          break;
        }
        case 'key.cancelled': {
          await notifyManagerTelegram(
            admin,
            `🚫 <b>Claude — Chave cancelada</b>\n` +
            `👨‍💼 Revendedor: ${resellerName}\n` +
            `👤 Cliente: ${clientLabel}\n` +
            `📦 Plano: ${planLabel}\n` +
            `🆔 Pedido: <code>${orderId}</code>`,
            'claude_key_cancelled', orderId,
          );
          await forwardToResellerWebhook(admin, orderRow?.reseller_id ?? null, 'claude.key.cancelled', {
            order_id: orderId,
            customer_email: orderRow?.customer_email ?? null,
            plan_code: orderRow?.plan_code ?? null,
          });
          break;
        }
      }
    }
  }

  await admin.from('claude_provider_webhook_events').update({
    order_id: orderId,
    processed_at: new Date().toISOString(),
  }).eq('provider_event_id', providerEventId);

  return json({ ok: true, event, order_id: orderId });
});