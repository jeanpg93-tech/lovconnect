// Emite conta de teste GRATUITA do Claude (15 min OU 50 mensagens).
// Uso: painel do gerente ou revendedor autenticado. Não debita saldo.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

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

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200);
    const customerName = body?.customer_name ? String(body.customer_name).trim().slice(0, 120) : null;
    const customerWhatsapp = body?.customer_whatsapp ? String(body.customer_whatsapp).replace(/\D+/g, '').slice(0, 15) : null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'email_required', message: 'Informe um e-mail válido.' }, 400);
    }

    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Descobre se é gerente
    const { data: isManager } = await admin.rpc('has_role', { _user_id: userId, _role: 'gerente' });

    // Se não é gerente, precisa ser revendedor com Claude habilitado
    let resellerId: string | null = null;
    let managerManual = false;
    if (!isManager) {
      const { data: reseller } = await admin
        .from('resellers')
        .select('id, claude_enabled')
        .eq('user_id', userId)
        .maybeSingle();
      if (!reseller) return json({ error: 'reseller_not_found' }, 404);
      if (!reseller.claude_enabled) return json({ error: 'claude_not_enabled' }, 403);
      resellerId = reseller.id;
    } else {
      managerManual = true;
    }

    // Chama provedor
    let providerResp: any = null;
    let providerStatus = 0;
    try {
      const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CLAUDE_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      providerStatus = r.status;
      const txt = await r.text();
      try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
    } catch (e) {
      return json({ error: 'provider_network_error', detail: (e as Error).message }, 502);
    }

    if (providerStatus < 200 || providerStatus >= 300) {
      if (providerStatus === 403) return json({ error: 'trial_disabled_by_admin', message: 'Recurso de teste não habilitado pelo admin do provedor. Solicite a liberação.' }, 403);
      if (providerStatus === 409) return json({ error: 'email_already_has_account', message: 'Este e-mail já possui uma conta no provedor.' }, 409);
      if (providerStatus === 429) return json({ error: 'provider_daily_limit_reached', message: 'Limite diário de 20 testes atingido no provedor. Fale com o admin para liberar mais.' }, 429);
      return json({ error: 'provider_error', status: providerStatus, body: providerResp }, 502);
    }

    const code: string | undefined =
      providerResp?.code ?? providerResp?.key ?? providerResp?.data?.code ?? providerResp?.data?.key;
    const providerKeyId: string | undefined =
      providerResp?.id ?? providerResp?.key_id ?? providerResp?.data?.id;
    const providerApiKey: string | undefined =
      providerResp?.apiKey ?? providerResp?.api_key ?? providerResp?.data?.apiKey ?? providerResp?.data?.api_key;
    const providerUserId: string | undefined =
      providerResp?.userId ?? providerResp?.user_id ?? providerResp?.data?.userId ?? providerResp?.data?.user_id;

    // Registro em claude_orders (sem custo)
    const { data: inserted } = await admin.from('claude_orders').insert({
      reseller_id: resellerId,
      manager_user_id: managerManual ? userId : null,
      is_manager_manual: managerManual,
      is_trial: true,
      trial_duration_minutes: 15,
      trial_messages_limit: 50,
      plan_code: 'trial_15m_50msg',
      cost_cents: 0,
      sale_price_cents: 0,
      profit_cents: 0,
      status: 'issued',
      code,
      provider_key_id: providerKeyId,
      provider_api_key: providerApiKey ?? null,
      provider_user_id: providerUserId ?? null,
      provider_response: providerResp,
      customer_email: email,
      customer_name: customerName,
      customer_whatsapp: customerWhatsapp,
      customer_identifier: email,
      code_revealed_at: new Date().toISOString(),
    }).select('id, created_at').single();

    // Telegram
    try {
      const txt =
        `🧪 <b>Teste Claude (15 min / 50 msgs)</b>\n` +
        `👤 Cliente: ${customerName ?? '—'}${customerWhatsapp ? ` (${customerWhatsapp})` : ''}\n` +
        `📧 ${email}\n` +
        `👥 User ID: <code>${providerUserId ?? '—'}</code>\n` +
        `🎯 Origem: ${managerManual ? 'Gerente (manual)' : 'Revendedor (painel)'}`;
      await admin.rpc('telegram_enqueue', { _text: txt });
    } catch (_) { /* noop */ }

    return json({
      order_id: inserted?.id ?? null,
      email,
      code,
      api_key: providerApiKey ?? null,
      user_id: providerUserId ?? null,
      provider_base_url: providerApiKey ? 'https://claude-ss.ia.br/' : null,
      trial: { duration_minutes: 15, messages_limit: 50 },
      note: 'Teste grátis — expira em 15 minutos OU 50 mensagens (o que vier primeiro). Não debita saldo.',
    });
  } catch (e) {
    console.error('[claude-issue-trial] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});