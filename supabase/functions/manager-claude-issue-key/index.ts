import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const PLAN_CODES = new Set(['pro_30d', '5x_30d', '20x_30d']);

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

    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

    const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/keys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLAUDE_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ kind: planCode }),
    });
    const txt = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt }; }

    if (r.status < 200 || r.status >= 300) {
      return json({ error: 'provider_error', status: r.status, body: parsed }, 502);
    }

    const code: string | undefined =
      parsed?.code ?? parsed?.key ?? parsed?.data?.code ?? parsed?.data?.key;
    const providerKeyId: string | undefined =
      parsed?.id ?? parsed?.key_id ?? parsed?.data?.id;

    if (!code) return json({ error: 'provider_no_code', body: parsed }, 502);

    return json({ code, provider_key_id: providerKeyId, plan_code: planCode });
  } catch (e) {
    console.error('[manager-claude-issue-key] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});