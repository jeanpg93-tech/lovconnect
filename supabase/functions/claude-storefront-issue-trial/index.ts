// Emite conta de teste GRATUITA do Claude a partir da loja pública (storefront).
// 15 minutos OU 50 mensagens (o que vier primeiro). Não debita saldo.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { maintenanceGuard } from "../_shared/maintenance.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function extractIp(req: Request): string {
  const raw =
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    '';
  const ip = raw.split(',')[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    {
      const _maintClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const _maintResp = await maintenanceGuard(_maintClient, corsHeaders);
      if (_maintResp) return _maintResp;
    }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.reseller_slug ?? body?.slug ?? '').trim().toLowerCase();
    const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200);
    const name = body?.name ? String(body.name).trim().slice(0, 120) : null;
    const whatsapp = body?.whatsapp ? String(body.whatsapp).replace(/\D+/g, '').slice(0, 15) : null;

    if (!slug) return json({ error: 'reseller_slug_required' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'email_required', message: 'Informe um e-mail válido.' }, 400);

    const ip = extractIp(req);
    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Anti-abuso persistente: 1 teste Claude por IP, e-mail ou WhatsApp a cada 24h
    {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const orFilter: string[] = [`name.eq.claude:${email}`];
      if (ip !== 'unknown') orFilter.push(`ip_address.eq.${ip}`);
      if (whatsapp) orFilter.push(`phone.eq.${whatsapp}`);
      const { data: dup } = await admin
        .from('trial_registrations')
        .select('id')
        .or(orFilter.join(','))
        .gte('created_at', since24h)
        .limit(1)
        .maybeSingle();
      if (dup) {
        return json({
          error: 'trial_rate_limited',
          message: 'Já foi gerado um teste com este e-mail, WhatsApp ou IP nas últimas 24h. Tente novamente mais tarde.',
        }, 429);
      }
    }

    const { data: reseller } = await admin
      .from('resellers')
      .select('id, is_active, claude_enabled, display_name')
      .eq('slug', slug)
      .maybeSingle();
    if (!reseller) return json({ error: 'reseller_not_found' }, 404);
    if (!reseller.is_active) return json({ error: 'reseller_inactive' }, 403);
    if (!reseller.claude_enabled) return json({ error: 'claude_not_enabled' }, 403);

    // Chama provedor
    let providerResp: any = null; let providerStatus = 0;
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
      if (providerStatus === 403) return json({ error: 'trial_disabled_by_admin', message: 'Testes grátis não estão liberados no momento. Fale com a loja.' }, 403);
      if (providerStatus === 409) return json({ error: 'email_already_has_account', message: 'Este e-mail já possui uma conta. Use outro e-mail.' }, 409);
      if (providerStatus === 429) return json({ error: 'provider_daily_limit_reached', message: 'Limite diário de testes atingido. Tente novamente amanhã.' }, 429);
      return json({ error: 'provider_error', status: providerStatus }, 502);
    }

    const code = providerResp?.code ?? providerResp?.key ?? null;
    const providerKeyId = providerResp?.id ?? providerResp?.key_id ?? null;
    const providerApiKey = providerResp?.apiKey ?? providerResp?.api_key ?? null;
    const providerUserId = providerResp?.userId ?? providerResp?.user_id ?? null;

    await admin.from('claude_orders').insert({
      reseller_id: reseller.id,
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
      provider_api_key: providerApiKey,
      provider_user_id: providerUserId,
      provider_response: providerResp,
      customer_email: email,
      customer_name: name,
      customer_whatsapp: whatsapp,
      customer_identifier: email,
      code_revealed_at: new Date().toISOString(),
      error_message: 'trial_storefront',
    } as any);

    // Registra anti-abuso (por IP / e-mail / whatsapp)
    if (code) {
      await admin.from('trial_registrations').insert({
        name: `claude:${email}`,
        phone: whatsapp || '',
        ip_address: ip,
        license_key: code,
      });
    }

    try {
      const txt =
        `🤖 <b>Teste Claude (Loja pública)</b>\n` +
        `🏬 Loja: ${reseller.display_name ?? slug}\n` +
        `📧 ${email}${name ? ` — ${name}` : ''}` +
        (whatsapp ? ` · 📱 ${whatsapp}` : '') + `\n` +
        `👥 User ID: <code>${providerUserId ?? '—'}</code>\n` +
        (code ? `🎟 ACT: <code>${code}</code>\n` : '') +
        (providerApiKey ? `🔑 Key: <code>${providerApiKey}</code>\n` : '') +
        `⏱ 15 min · 50 msgs · 📦 Claude API`;
      await admin.rpc('telegram_enqueue', { _text: txt });
    } catch (_) { /* noop */ }

    return json({
      ok: true,
      email,
      api_key: providerApiKey,
      user_id: providerUserId,
      provider_base_url: providerApiKey ? 'https://claude-ss.shardweb.app/' : null,
      trial: { duration_minutes: 15, messages_limit: 50 },
      note: 'Teste grátis — expira em 15 minutos OU 50 mensagens (o que vier primeiro).',
    });
  } catch (e) {
    console.error('[claude-storefront-issue-trial] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});