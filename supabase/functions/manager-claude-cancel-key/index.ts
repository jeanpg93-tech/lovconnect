import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const PLAN_LABELS: Record<string, string> = {
  'pro_30d': 'Pro · 30 dias',
  '5x_30d':  '5x · 30 dias',
  '20x_30d': '20x · 30 dias',
  'api_500k_30d': 'API 500K · 30 dias',
  'api_25m_30d': 'API 2,5M · 30 dias',
  'api_10m_30d': 'API 10M · 30 dias',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Cancela chave Claude emitida manualmente pelo gerente (is_manager_manual=true).
// Não há saldo de revendedor para estornar — apenas revoga no fornecedor.
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

    const { data: isManager } = await userClient.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'gerente',
    });
    if (!isManager) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? '').trim();
    const providerKeyOverride = String(body?.provider_key_id ?? '').trim();
    const codeOverride = String(body?.code ?? '').trim();
    if (!orderId && !providerKeyOverride && !codeOverride) {
      return json({ error: 'missing_order_id' }, 400);
    }
    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let order: any = null;
    if (orderId) {
      const { data } = await admin
        .from('claude_orders')
        .select('id, status, code, provider_key_id, cost_cents, plan_code, is_manager_manual, cancel_attempts, customer_name, customer_email, customer_whatsapp')
        .eq('id', orderId)
        .maybeSingle();
      order = data;
      if (!order) return json({ error: 'order_not_found' }, 404);
      if (!order.is_manager_manual) return json({ error: 'not_manager_order' }, 403);
      if (order.status === 'cancelled') {
        return json({ ok: true, order_id: order.id, refund_cents: Number(order.cost_cents) || 0, already_cancelled: true });
      }
    }

    const providerKeyRef =
      providerKeyOverride ||
      String(order?.provider_key_id ?? order?.code ?? codeOverride ?? '').trim();
    if (!providerKeyRef) return json({ error: 'missing_provider_key_id' }, 422);

    let providerStatus = 0;
    let providerResp: any = null;
    try {
      const r = await fetch(
        `${CLAUDE_BASE_URL}/api/rsl/keys/${encodeURIComponent(providerKeyRef)}/cancel`,
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
      return json({ error: 'provider_network_error', detail: String((e as Error)?.message ?? e) }, 502);
    }

    const now = new Date().toISOString();
    const prevAttempts = Array.isArray(order?.cancel_attempts) ? order.cancel_attempts : [];
    const attempt = {
      at: now,
      status_code: providerStatus,
      ok: providerStatus >= 200 && providerStatus < 300,
      response: providerResp,
      by: 'manager',
    };

    if (providerStatus < 200 || providerStatus >= 300) {
      // 404 = provedor não reconhece esta chave (ex.: chave manual/teste que
      // nunca entrou nas "compras" do provedor). Marcamos como cancelada
      // localmente para o gerente conseguir limpar o registro.
      if (providerStatus === 404) {
        if (order) {
          await admin.from('claude_orders').update({
            status: 'cancelled',
            cancelled_at: now,
            cancel_attempts: [...prevAttempts, attempt],
          }).eq('id', order.id);
        }
        return json({
          ok: true,
          order_id: order?.id ?? null,
          refund_cents: 0,
          not_in_provider: true,
          message: 'Chave não encontrada no provedor — marcada como cancelada apenas no sistema.',
        });
      }
      if (order) {
        await admin.from('claude_orders').update({
          status: providerStatus === 409 ? 'cancel_rejected' : 'cancel_failed',
          cancel_attempts: [...prevAttempts, attempt],
        }).eq('id', order.id);
      }
      if (providerStatus === 409) {
        return json({ error: 'already_redeemed', body: providerResp }, 409);
      }
      return json({ error: 'provider_cancel_failed', status: providerStatus, body: providerResp }, 502);
    }

    const refundCents = Number(providerResp?.refunded_amount_cents) || Number(order?.cost_cents) || 0;

    if (order) {
      await admin.from('claude_orders').update({
        status: 'cancelled',
        cancelled_at: now,
        cancel_attempts: [...prevAttempts, attempt],
        ...(providerResp?.accountBlocked ? { customer_account_blocked_at: now } : {}),
      }).eq('id', order.id);
    }

    // Notifica gerente via Telegram
    try {
      const planLabel = order?.plan_code ? (PLAN_LABELS[order.plan_code] ?? order.plan_code) : '—';
      const refundBRL = 'R$ ' + (Number(refundCents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const txt =
        `🚫 <b>Chave Claude cancelada (Gerente · manual)</b>\n` +
        `📦 Plano: ${planLabel}\n` +
        (order?.code ? `🔑 Chave: <code>${order.code}</code>\n` : '') +
        (order?.customer_name ? `👤 Cliente: ${order.customer_name}` : '') +
        (order?.customer_whatsapp ? ` (${order.customer_whatsapp})` : '') +
        (order?.customer_email ? `\n📧 ${order.customer_email}` : '') +
        `\n↩️ Estorno no fornecedor: ${refundBRL}`;
      await admin.rpc('telegram_enqueue', { _text: txt });
    } catch (e) {
      console.warn('telegram_enqueue (manager claude cancel) failed', e);
    }

    return json({
      ok: true,
      order_id: order?.id ?? null,
      refund_cents: refundCents,
      account_blocked: Boolean(providerResp?.accountBlocked),
      provider_response: providerResp,
    });
  } catch (e) {
    console.error('[manager-claude-cancel-key] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});