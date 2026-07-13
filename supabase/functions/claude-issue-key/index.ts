import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const PLAN_CODES = new Set(['pro_30d', '5x_7d', '5x_30d', '20x_30d', 'api_500k_30d', 'api_25m_30d', 'api_10m_30d']);
const PLAN_LABELS: Record<string, string> = {
  'pro_30d':  'Pro · 30 dias',
  '5x_7d':    'Max 5X · 7 dias',
  '5x_30d':   'Max 5X · 30 dias',
  '20x_30d':  'Max 20X · 30 dias',
  'api_500k_30d': 'Pro · 30 dias',
  'api_25m_30d': 'Max 5X · 30 dias',
  'api_10m_30d': 'Max 20X · 30 dias',
};

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
    const customerName = body?.customer_name ? String(body.customer_name).trim().slice(0, 120) : null;
    const customerWhatsapp = body?.customer_whatsapp ? String(body.customer_whatsapp).replace(/\D+/g, '').slice(0, 15) : null;
    const customerEmail = body?.customer_email ? String(body.customer_email).trim().toLowerCase().slice(0, 200) : null;
    const requestId = body?.request_id ? String(body.request_id) : null;
    if (!PLAN_CODES.has(planCode)) return jsonResponse({ error: 'invalid_plan_code' }, 400);
    if (!customerName || customerName.length < 2) return jsonResponse({ error: 'customer_name_required' }, 400);

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
    // Custo cobrado do revendedor: baseado no nível (tier) do revendedor.
    // Fallback: reseller_cost_cents padrão; depois sale_price_cents.
    let resellerCostCents = (defaultPrice as any).reseller_cost_cents ?? defaultPrice.sale_price_cents;
    try {
      const { data: tierCost } = await admin.rpc('get_reseller_claude_cost', {
        _reseller_id: reseller.id,
        _plan_code: planCode,
      });
      if (typeof tierCost === 'number' && tierCost > 0) resellerCostCents = tierCost;
    } catch (_) { /* fallback to default */ }
    let saleCents = defaultPrice.sale_price_cents;
    if (override && override.is_active) {
      saleCents = computeSalePrice(costCents, override.markup_mode, override.markup_value_cents);
    }
    const profitCents = saleCents - resellerCostCents;

    // Pre-check balance. Se insuficiente, criamos o pedido com status
    // `awaiting_balance`: ele será processado automaticamente assim que o
    // revendedor recarregar o painel (hook em `misticpay-webhook` chama
    // `claude-release-awaiting`).
    const { data: balanceRow } = await admin
      .from('reseller_balances')
      .select('balance_cents')
      .eq('reseller_id', reseller.id)
      .maybeSingle();
    const balance = balanceRow?.balance_cents ?? 0;
    if (balance < resellerCostCents) {
      const { data: waiting, error: wErr } = await admin
        .from('claude_orders')
        .insert({
          reseller_id: reseller.id,
          plan_code: planCode,
          customer_identifier: customerIdentifier,
          customer_name: customerName,
          customer_whatsapp: customerWhatsapp,
          customer_email: customerEmail,
          cost_cents: costCents,
          sale_price_cents: saleCents,
          profit_cents: profitCents,
          status: 'awaiting_balance',
          request_id: requestId,
          error_message: 'awaiting_balance: saldo insuficiente no momento da venda',
        })
        .select()
        .single();
      if (wErr) throw wErr;
      return jsonResponse({
        error: 'insufficient_balance',
        status: 'awaiting_balance',
        message: 'Saldo insuficiente. O pedido ficou aguardando saldo e será liberado automaticamente assim que você recarregar o painel.',
        balance_cents: balance,
        required_cents: resellerCostCents,
        order: waiting,
      }, 402);
    }

    // Create pending order
    const { data: order, error: oErr } = await admin
      .from('claude_orders')
      .insert({
        reseller_id: reseller.id,
        plan_code: planCode,
        customer_identifier: customerIdentifier,
        customer_name: customerName,
        customer_whatsapp: customerWhatsapp,
        customer_email: customerEmail,
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
        body: JSON.stringify({
          kind: planCode,
          ...(customerEmail ? { email: customerEmail } : {}),
        }),
        signal: AbortSignal.timeout(15000),
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
      // 409 = e-mail já tem conta no provedor. Nenhum débito foi feito
      // (debit acontece só depois deste bloco), então basta retornar
      // uma mensagem amigável e o revendedor tenta outro e-mail.
      const providerMsg = String(providerResp?.error ?? providerResp?.message ?? '').toLowerCase();
      if (providerStatus === 409 || providerMsg.includes('já cadastr') || providerMsg.includes('ja cadastr') || providerMsg.includes('already')) {
        return jsonResponse({
          error: 'email_already_registered',
          status: 409,
          message: 'Este e-mail já possui uma conta no provedor. Use outro e-mail (ex.: adicione +teste antes do @).',
          body: providerResp,
        }, 409);
      }
      if (providerStatus === 402) {
        return jsonResponse({
          error: 'insufficient_provider_balance',
          status: 402,
          message: 'Saldo insuficiente no provedor. Aguarde alguns minutos e tente novamente ou fale com o gerente.',
          body: providerResp,
        }, 402);
      }
      if (providerStatus === 429) {
        return jsonResponse({
          error: 'provider_rate_limited',
          status: 429,
          message: 'Muitas emissões seguidas. Aguarde alguns segundos e tente novamente.',
          body: providerResp,
        }, 429);
      }
      return jsonResponse({ error: 'provider_error', status: providerStatus, body: providerResp }, 502);
    }

    const code: string | undefined =
      providerResp?.code ?? providerResp?.key ?? providerResp?.data?.code ?? providerResp?.data?.key;
    const providerKeyId: string | undefined =
      providerResp?.id ?? providerResp?.key_id ?? providerResp?.data?.id;
    const providerApiKey: string | undefined =
      providerResp?.apiKey ?? providerResp?.api_key ?? providerResp?.data?.apiKey ?? providerResp?.data?.api_key;
    const providerUserId: string | undefined =
      providerResp?.userId ?? providerResp?.user_id ?? providerResp?.data?.userId ?? providerResp?.data?.user_id;

    // SECURITY: debit atomically via RPC (row-lock + conditional decrement).
    // The RPC also inserts the balance_transactions row, preventing TOCTOU /
    // double-spend under concurrent requests.
    const { data: debited, error: debitErr } = await admin.rpc('debit_reseller_balance', {
      _reseller_id: reseller.id,
      _amount_cents: resellerCostCents,
      _kind: 'claude_key_issue',
      _description: `Emissão chave Claude ${planCode}`,
      _reference_id: order.id,
    });
    if (debitErr || debited !== true) {
      await admin.from('claude_orders').update({
        status: 'failed',
        provider_response: providerResp,
        error_message: `debit_failed: ${debitErr?.message ?? 'insufficient_balance'}`,
      }).eq('id', order.id);
      return jsonResponse({ error: debitErr ? 'debit_failed' : 'insufficient_balance' }, 402);
    }

    const { data: updated } = await admin
      .from('claude_orders')
      .update({
        status: 'issued',
        code,
        provider_key_id: providerKeyId,
        provider_api_key: providerApiKey ?? null,
        provider_user_id: providerUserId ?? null,
        provider_response: providerResp,
        code_revealed_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select()
      .single();

    // Notifica gerente via Telegram
    try {
      const fmtBRL = (c: number) =>
        'R$ ' + (Number(c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const debitBRL = fmtBRL(resellerCostCents);
      const planLabel = PLAN_LABELS[planCode] ?? planCode;
      const txt =
        `🤖 <b>Venda Claude</b>\n` +
        `👨‍💼 Revendedor: ${reseller.display_name ?? '—'}\n` +
        `📦 Plano: ${planLabel}\n` +
        (providerApiKey ? `🔑 API Key: <code>${providerApiKey}</code>\n` : '') +
        `👤 Cliente: ${customerName ?? '—'}` +
        (customerWhatsapp ? ` (${customerWhatsapp})` : '') +
        `\n💵 Debitado da carteira: ${debitBRL}\n` +
        `💳 Pagamento: Saldo da carteira`;
      await admin.rpc('telegram_enqueue', { _text: txt });
    } catch (e) {
      console.warn('telegram_enqueue (claude issue) failed', e);
    }

    // WhatsApp automático ao cliente final (best-effort, não bloqueia a resposta)
    if (customerWhatsapp && customerWhatsapp.length >= 10) {
      try {
        const { data: integ } = await admin
          .from('reseller_integrations')
          .select('evolution_enabled, connection_status')
          .eq('reseller_id', reseller.id)
          .maybeSingle();
        if (integ?.evolution_enabled && integ?.connection_status === 'connected') {
          fetch(`${SUPABASE_URL}/functions/v1/evolution-send-sale`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              reseller_id: reseller.id,
              kind: 'claude',
              to: customerWhatsapp,
              vars: {
                nome: customerName ?? '',
                plano: PLAN_LABELS[planCode] ?? planCode,
                codigo: code ?? '',
                chave: code ?? '',
                api_key: providerApiKey ?? '',
                base_url: providerApiKey ? 'https://claude-ss.shardweb.app/' : '',
                valor_cents: String(saleCents ?? 0),
              },
            }),
          }).catch((e) => console.warn('evolution-send-sale (claude) failed', e));
        }
      } catch (e) {
        console.warn('evolution-send-sale (claude) lookup failed', e);
      }
    }

    return jsonResponse({
      order_id: order.id,
      plan_code: planCode,
      sale_price_cents: saleCents,
      code, // one-time exposure
      provider_key_id: providerKeyId,
      api_key: providerApiKey ?? null,
      user_id: providerUserId ?? null,
      provider_base_url: providerApiKey ? 'https://claude-ss.shardweb.app/' : null,
      order: updated,
    });
  } catch (e) {
    console.error('[claude-issue-key] error', e);
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500);
  }
});