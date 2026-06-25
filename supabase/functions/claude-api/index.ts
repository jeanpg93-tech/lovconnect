import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

    // Only gerente can pull provider balance (sensitive)
    const { data: isManager } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'gerente',
    });
    if (!isManager) return jsonResponse({ error: 'forbidden' }, 403);

    if (!CLAUDE_BASE_URL) {
      return jsonResponse({ error: 'CLAUDE_RESELLER_API_BASE_URL not configured' }, 500);
    }

    const upstream = await fetch(`${CLAUDE_BASE_URL}/api/rsl/me`, {
      headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: 'application/json' },
    });
    const body = await upstream.text();
    let parsed: any = null;
    try { parsed = JSON.parse(body); } catch { parsed = { raw: body }; }

    if (!upstream.ok) {
      return jsonResponse({ error: 'provider_error', status: upstream.status, body: parsed }, 502);
    }
    return jsonResponse(parsed, 200);
  } catch (e) {
    console.error('[claude-api] error', e);
    return jsonResponse({ error: String((e as Error)?.message ?? e) }, 500);
  }
});