import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
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

    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

    const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/users`, {
      headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: 'application/json' },
    });
    const txt = await r.text();
    let parsed: any;
    try { parsed = JSON.parse(txt); } catch { parsed = null; }
    if (!r.ok) return json({ error: 'provider_error', status: r.status, body: parsed }, 502);

    const users: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : [];
    const compact = users.map((u) => ({
      email: String(u?.email ?? '').trim().toLowerCase(),
      kind: u?.kind ?? null,
      status: u?.status ?? null,
      accountExpiresAt: u?.accountExpiresAt ?? null,
      redeemedAt: u?.redeemedAt ?? null,
      tokensConsumed: u?.usage?.tokensConsumed ?? null,
      tokenLimit: u?.usage?.tokenLimit ?? null,
      tokensInWindow: u?.usage?.tokensInWindow ?? null,
      tokenWindowHours: u?.usage?.tokenWindowHours ?? null,
      percentRemaining: u?.usage?.percentRemaining ?? null,
      weeklyTokenLimit: u?.usage?.weeklyTokenLimit ?? null,
      weeklyTokensInWindow: u?.usage?.weeklyTokensInWindow ?? null,
    }));

    return json({ ok: true, users: compact });
  } catch (e) {
    console.error('[manager-claude-provider-users] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});