import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const PLAN_CODES = new Set(['5x_7d', '5x_30d', '20x_30d', 'pro_30d']);

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function computeSalePrice(cost: number, mode: string, value: number) {
  if (mode === 'percent') return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === 'fixed_add') return Math.max(0, cost + value);
  return Math.max(0, value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const planCode = String(body?.plan_code ?? '').trim();
    const customerIdentifier = body?.customer_identifier ? String(body.customer_identifier) : null;
    const requestId = body?.request_id ? String(body.request_id) : null;
    if (!PLAN_CODES.has(planCode)) return jsonResponse({ error: 'invalid_plan_code' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Reseller of current user
    const { data: reseller, error: rErr } = await admin
      .from('resellers')
      .select('id, claude_enabled, display_name')
      .eq('user_id', userId)
      .maybeSingle();
    if (rErr) throw rErr;
    if (!reseller) return jsonResponse({ error: 'reseller_not_found' }, 404);
    if (!reseller.claude_enabled) return jsonResponse({ error: 'claude_not_enabled' }, 403);

    // Idempotency
    if (requestId) {
      const { data: prior } = await admin
        .from('claude_orders')
        .select('*')
        .eq('reseller_id', reseller.id)
        .eq('request_id', requestId)
        .maybeSingle();
      if (prior) return jsonResponse({ order: prior, idempotent: true });
    }

    // Resolve sale price (override > default)
    const [{ data: defaultPrice }, { data: override }] = await Promise.all([
      admin.from('claude_plan_prices').select('*').eq('plan_code', planCode).maybeSingle(),
      admin
        .from('claude_reseller_price_overrides')
        .select('*')
        .eq('reseller_id', reseller.id)
        .eq('plan_code', planCode)
        .maybeSingle(),
    ]);

    if (!defaultPrice || !defaultPrice.is_active) {
      return jsonResponse({ error: 'plan_not_active' }, 400);
    }
    const costCents = defaultPrice.cost_cents;
    let saleCents = defaultPrice.sale_price_cents;
    if (override && override.is_active) {
      saleCents = computeSalePrice(costCents, override.markup_mode, override.markup_value_cents);
    }
    const profitCents = saleCents - costCents;

    // Check balance
    const { data: balanceRow } = await admin
      .from('reseller_balances')
      .select('balance_cents')
      .eq('reseller_id', reseller.id)
      .maybeSingle();
    const balance = balanceRow?.balance_cents ?? 0;
    if (balance < saleCents) {
      return jsonResponse({ error: 'insufficient_balance', balance_cents: balance, required_cents: saleCents }, 402);
    }

    // Create pending order
    const { data: order, error: oErr } = await admin
      .from('claude_orders')
      .insert({
        reseller_id: reseller.id,
        plan_code: planCode,
        customer_identifier: customerIdentifier,
        cost_cents: costCents,
        sale_price_cents: saleCents,
        profit_cents: profitCents,
        status: 'pending',
        request_id: requestId,
      })
      .select()
      .single();
    if (oErr) throw oErr;

    if (!CLAUDE_BASE_URL) {
      await admin.from('claude_orders').update({
        status: 'failed',
        error_message: 'CLAUDE_RESELLER_API_BASE_URL not configured',
      }).eq('id', order.id);
      return jsonResponse({ error: 'provider_not_configured' }, 500);
    }

    // Call provider
    let providerResp: any = null;
    let providerStatus = 0;
    try {
      const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/keys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CLAUDE_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ kind: planCode }),
      });
      providerStatus = r.status;
      const txt = await r.text();
      try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
    } catch (e) {
      await admin.from('claude_orders').update({
        status: 'failed',
        error_message: `network_error: ${(e as Error)?.message ?? e}`,
      }).eq('id', order.id);
      return jsonResponse({ error: 'provider_network_error' }, 502);
    }

    if (providerStatus < 200 || providerStatus >= 300) {
      await admin.from('claude_orders').update({
        status: 'failed',
        provider_response: providerResp,
        error_message: `provider_${providerStatus}`,
      }).eq('id', order.id);
      return jsonResponse({ error: 'provider_error', status: providerStatus, body: providerResp }, 502);
    }

    const code: string | undefined =
      providerResp?.code ?? providerResp?.key ?? providerResp?.data?.code ?? providerResp?.data?.key;
    const providerKeyId: string | undefined =
      providerResp?.id ?? providerResp?.key_id ?? providerResp?.data?.id;

    // Debit wallet
    const { error: debitErr } = await admin
      .from('reseller_balances')
      .update({ balance_cents: balance - saleCents })
      .eq('reseller_id', reseller.id);
    if (debitErr) {
      await admin.from('claude_orders').update({
        status: 'failed',
        provider_response: providerResp,
        error_message: `debit_failed: ${debitErr.message}`,
      }).eq('id', order.id);
      return jsonResponse({ error: 'debit_failed' }, 500);
    }

    await admin.from('balance_transactions').insert({
      reseller_id: reseller.id,
      amount_cents: -saleCents,
      transaction_type: 'claude_key_issue',
      description: `Emissão chave Claude ${planCode}`,
      metadata: { order_id: order.id, plan_code: planCode },
    }).then(() => {}, () => {}); // non-fatal

    const { data: updated } = await admin
      .from('claude_orders')
      .update({
        status: 'issued',
        code,
        provider_key_id: providerKeyId,
        provider_response: providerResp,
        code_revealed_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select()
      .single();

    return jsonResponse({
      order_id: order.id,
      plan_code: planCode,
      sale_price_cents: saleCents,
      code, // one-time exposure
      provider_key_id: providerKeyId,
      order: updated,
    });
  } catch (e) {
    console.error('[claude-issue-key] error', e);
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500);
  }
});