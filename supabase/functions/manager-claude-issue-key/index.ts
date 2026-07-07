import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const PLAN_CODES = new Set(['pro_30d', '5x_7d', '5x_30d', '20x_30d', 'api_500k_30d', 'api_25m_30d', 'api_10m_30d']);
const PLAN_LABELS: Record<string, string> = {
  'pro_30d': 'Pro · 30 dias',
  '5x_7d':   '5x · 7 dias',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const { data: isManager } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'gerente',
    });
    if (!isManager) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const planCode = String(body?.plan_code ?? '').trim();
    if (!PLAN_CODES.has(planCode)) return json({ error: 'invalid_plan_code' }, 400);

    const customerName = typeof body?.customer_name === 'string' ? body.customer_name.trim().slice(0, 120) : '';
    const customerWhatsapp = typeof body?.customer_whatsapp === 'string' ? body.customer_whatsapp.replace(/\D+/g, '').slice(0, 15) : '';
    const customerEmail = typeof body?.customer_email === 'string' ? body.customer_email.trim().slice(0, 160) : '';
    if (customerName.length < 2) return json({ error: 'customer_name_required' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return json({ error: 'customer_email_required' }, 400);
    }

    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

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
    });
    const txt = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }

    if (r.status < 200 || r.status >= 300) {
      console.error('[manager-claude-issue-key] provider_error', { status: r.status, body: parsed, planCode });
      const providerMsg = String(parsed?.error ?? parsed?.message ?? '').toLowerCase();
      if (r.status === 409 || providerMsg.includes('já cadastr') || providerMsg.includes('ja cadastr') || providerMsg.includes('already')) {
        return json({
          error: 'email_already_registered',
          status: 409,
          message: 'Este e-mail já está cadastrado no provedor. Use outro e-mail (ex.: adicione +teste antes do @).',
          body: parsed,
        }, 409);
      }
      if (r.status === 402 || providerMsg.includes('saldo') || providerMsg.includes('insufficient')) {
        return json({
          error: 'insufficient_provider_balance',
          status: r.status,
          message: 'Saldo insuficiente no provedor para emitir esta chave.',
          body: parsed,
        }, 402);
      }
      if (r.status === 429) {
        return json({
          error: 'provider_rate_limited',
          status: 429,
          message: 'Limite do provedor atingido. Aguarde alguns segundos e tente novamente.',
          body: parsed,
        }, 429);
      }
      return json({ error: 'provider_error', status: r.status, body: parsed }, 502);
    }

    const code: string | undefined =
      parsed?.code ?? parsed?.key ?? parsed?.data?.code ?? parsed?.data?.key;
    const providerKeyId: string | undefined =
      parsed?.id ?? parsed?.key_id ?? parsed?.data?.id;
    const providerApiKey: string | undefined =
      parsed?.apiKey ?? parsed?.api_key ?? parsed?.data?.apiKey ?? parsed?.data?.api_key;
    const providerUserId: string | undefined =
      parsed?.userId ?? parsed?.user_id ?? parsed?.data?.userId ?? parsed?.data?.user_id;

    if (!code) return json({ error: 'provider_no_code', body: parsed }, 502);

    // Persist manager issuance for permanent history
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let costCents = 0;
    try {
      const { data: priceRow } = await admin
        .from('claude_plan_prices')
        .select('cost_cents')
        .eq('plan_code', planCode)
        .maybeSingle();
      costCents = Number(priceRow?.cost_cents ?? 0);
    } catch { /* noop */ }

    let orderId: string | null = null;
    let createdAt: string | null = null;
    try {
      const { data: inserted, error: insErr } = await admin
        .from('claude_orders')
        .insert({
          manager_user_id: userData.user.id,
          is_manager_manual: true,
          plan_code: planCode,
          cost_cents: costCents,
          sale_price_cents: 0,
          profit_cents: 0,
          status: 'issued',
          code,
          provider_key_id: providerKeyId ?? null,
          provider_api_key: providerApiKey ?? null,
          provider_user_id: providerUserId ?? null,
          provider_response: parsed,
          customer_name: customerName,
          customer_whatsapp: customerWhatsapp || null,
          customer_email: customerEmail || null,
          customer_identifier: customerEmail || customerWhatsapp || customerName,
        })
        .select('id, created_at')
        .single();
      if (insErr) console.error('[manager-claude-issue-key] persist_error', insErr);
      else { orderId = inserted?.id ?? null; createdAt = (inserted as any)?.created_at ?? null; }
    } catch (persistErr) {
      console.error('[manager-claude-issue-key] persist_exception', persistErr);
    }

    // Notifica gerente via Telegram (emissão manual pelo painel do gerente)
    try {
      const planLabel = PLAN_LABELS[planCode] ?? planCode;
      const costBRL = 'R$ ' + (Number(costCents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const txt =
        `🤖 <b>Venda Claude (Gerente · manual)</b>\n` +
        `📦 Plano: ${planLabel}\n` +
        (code ? `🔑 Chave: <code>${code}</code>\n` : '') +
        (providerKeyId ? `🆔 Provider Key ID: <code>${providerKeyId}</code>\n` : '') +
        (providerUserId ? `👥 User ID: <code>${providerUserId}</code>\n` : '') +
        `👤 Cliente: ${customerName}` +
        (customerWhatsapp ? ` (${customerWhatsapp})` : '') +
        (customerEmail ? `\n📧 ${customerEmail}` : '') +
        `\n💵 Custo: ${costBRL}` +
        `\n💳 Pagamento: Emissão manual (sem débito de revendedor)`;
      await admin.rpc('telegram_enqueue', { _text: txt });
    } catch (e) {
      console.warn('telegram_enqueue (manager claude issue) failed', e);
    }

    return json({
      id: orderId,
      code,
      created_at: createdAt,
      provider_key_id: providerKeyId,
      api_key: providerApiKey ?? null,
      user_id: providerUserId ?? null,
      provider_base_url: providerApiKey ? 'https://claude-ss.shardweb.app/' : null,
      plan_code: planCode,
      customer: { name: customerName, whatsapp: customerWhatsapp, email: customerEmail || null },
    });
  } catch (e) {
    console.error('[manager-claude-issue-key] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});