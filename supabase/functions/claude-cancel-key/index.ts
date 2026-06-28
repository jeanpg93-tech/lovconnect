import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

// Conta de testes Jean Gomes — ÚNICA com acesso inicial ao fluxo de cancelamento.
const TEST_USER_ID = 'beae9f73-5c2c-4878-bfc5-41e9e2faf15e';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);
    const userId = userData.user.id;

    // Gate inicial: somente Jean Gomes pode acionar (Fase 1 controlada).
    if (userId !== TEST_USER_ID) return json({ error: 'feature_locked' }, 403);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? '').trim();
    if (!orderId) return json({ error: 'missing_order_id' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: reseller } = await admin
      .from('resellers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!reseller) return json({ error: 'reseller_not_found' }, 404);

    const { data: order, error: oErr } = await admin
      .from('claude_orders')
      .select('*')
      .eq('id', orderId)
      .eq('reseller_id', reseller.id)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) return json({ error: 'order_not_found' }, 404);
    if (order.status !== 'issued') return json({ error: 'invalid_status', status: order.status }, 409);
    if (!order.provider_key_id) return json({ error: 'missing_provider_key_id' }, 422);
    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

    // Chama fornecedor — usa MINHA api key (revendedor nunca fala direto).
    let providerStatus = 0;
    let providerResp: any = null;
    try {
      const r = await fetch(
        `${CLAUDE_BASE_URL}/api/rsl/keys/${encodeURIComponent(order.provider_key_id)}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CLAUDE_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      );
      providerStatus = r.status;
      const txt = await r.text();
      try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
    } catch (e) {
      providerStatus = 0;
      providerResp = { network_error: String((e as Error)?.message ?? e) };
    }

    const now = new Date().toISOString();
    const prevAttempts = Array.isArray(order.cancel_attempts) ? order.cancel_attempts : [];
    const attempt = {
      at: now,
      status_code: providerStatus,
      ok: providerStatus >= 200 && providerStatus < 300,
      response: providerResp,
    };

    if (providerStatus < 200 || providerStatus >= 300) {
      await admin.from('claude_orders').update({
        status: 'cancel_failed',
        cancel_attempts: [...prevAttempts, attempt],
      }).eq('id', order.id);
      return json({
        error: 'provider_cancel_failed',
        status: providerStatus,
        body: providerResp,
      }, 502);
    }

    // Estorna saldo do revendedor (custo do revendedor, não preço final).
    const refundCents = Number(order.cost_cents) || 0;
    if (refundCents > 0) {
      const { error: cErr } = await admin.rpc('credit_reseller_balance', {
        _reseller_id: reseller.id,
        _amount_cents: refundCents,
        _kind: 'claude_key_refund',
        _description: `Cancelamento chave Claude ${order.plan_code}`,
        _reference_id: order.id,
      });
      if (cErr) {
        await admin.from('claude_orders').update({
          cancel_attempts: [...prevAttempts, attempt, {
            at: new Date().toISOString(),
            ok: false,
            refund_error: cErr.message,
          }],
        }).eq('id', order.id);
        return json({ error: 'refund_failed', detail: cErr.message }, 500);
      }
    }

    await admin.from('claude_orders').update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_attempts: [...prevAttempts, attempt],
    }).eq('id', order.id);

    return json({
      ok: true,
      order_id: order.id,
      refund_cents: refundCents,
      provider_response: providerResp,
    });
  } catch (e) {
    console.error('[claude-cancel-key] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});