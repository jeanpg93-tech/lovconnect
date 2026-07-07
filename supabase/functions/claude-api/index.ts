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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithBackoff(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === tries - 1) return response;
      const retryAfter = Number(response.headers.get('retry-after') ?? '');
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : 500 * Math.pow(2, attempt);
      await wait(waitMs);
    } catch (error) {
      lastError = error;
      if (attempt === tries - 1) throw error;
      await wait(500 * Math.pow(2, attempt));
    }
  }
  throw lastError;
}

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

    const upstream = await fetchWithBackoff(`${CLAUDE_BASE_URL}/api/rsl/me`, {
      headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
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