import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');
const PROJECT_REF = (Deno.env.get('SUPABASE_URL') ?? '').match(/https?:\/\/([^.]+)\./)?.[1] ?? '';
const ADMIN_USER_ID = 'beae9f73-5c2c-4878-bfc5-41e9e2faf15e';

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: 'unauthorized' }, 401);
  if (u.user.id !== ADMIN_USER_ID) return json({ error: 'forbidden' }, 403);

  if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

  const webhookUrl = `https://${PROJECT_REF}.supabase.co/functions/v1/claude-provider-webhook`;
  const events = ['key.created', 'key.redeemed', 'key.cancelled', 'key.expired', 'tokens.limit_reached'];

  const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/webhooks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLAUDE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ url: webhookUrl, events }),
  });
  const txt = await r.text();
  let body: any; try { body = JSON.parse(txt); } catch { body = { raw: txt }; }

  return json({
    ok: r.ok,
    status: r.status,
    webhook_url: webhookUrl,
    provider_response: body,
    next_step: r.ok
      ? "Copie o 'webhookKey' (whsec_…) da resposta e salve no secret CLAUDE_PROVIDER_WEBHOOK_SECRET."
      : "Falha ao registrar — verifique a resposta do fornecedor.",
  }, r.ok ? 200 : 502);
});