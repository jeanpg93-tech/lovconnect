import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

const json = (data: unknown, status = 200) =>
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

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let scope: string = 'manual';
    try {
      if (req.method === 'POST') {
        const body = await req.clone().json().catch(() => ({}));
        if (body && typeof body === 'object' && body.scope) scope = String(body.scope);
      }
    } catch { /* noop */ }
    let ordersQuery = admin
      .from('claude_orders')
      .select('id, code, customer_email, provider_key_id, provider_user_id, status, redeemed_at, expired_at, is_manager_manual')
      .not('code', 'is', null)
      .order('created_at', { ascending: false })
      .limit(scope === 'all' ? 1000 : 300);
    if (scope !== 'all') ordersQuery = ordersQuery.eq('is_manager_manual', true);
    const { data: orders } = await ordersQuery;

    const r = await fetchWithBackoff(`${CLAUDE_BASE_URL}/api/rsl/users`, {
      headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const txt = await r.text();
    let parsed: any;
    try { parsed = JSON.parse(txt); } catch { parsed = null; }
    if (!r.ok) return json({ error: 'provider_error', status: r.status, body: parsed }, 502);

    const users: any[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : [];
    const compact = users.map((u) => {
      const usage = u?.usage ?? {};
      return {
      id: u?.id ?? u?.userId ?? u?.user_id ?? null,
      keyId: u?.keyId ?? u?.key_id ?? u?.providerKeyId ?? u?.provider_key_id ?? null,
      code: u?.code ?? u?.key ?? null,
      email: String(u?.email ?? '').trim().toLowerCase(),
      kind: u?.kind ?? null,
      status: u?.status ?? null,
      accountExpiresAt: u?.accountExpiresAt ?? null,
      redeemedAt: u?.redeemedAt ?? null,
      tokensConsumed: usage?.tokensConsumed ?? null,
      tokenLimit: usage?.tokenLimit ?? null,
      tokensInWindow: usage?.tokensInWindow ?? null,
      tokenWindowHours: usage?.tokenWindowHours ?? null,
      percentRemaining: usage?.percentRemaining ?? null,
      weeklyTokenLimit: usage?.weeklyTokenLimit ?? null,
      weeklyTokensInWindow: usage?.weeklyTokensInWindow ?? null,
    };
    });

    const byEmail = new Map<string, any>();
    const byUserId = new Map<string, any>();
    const byKeyId = new Map<string, any>();
    const byCode = new Map<string, any>();
    for (const u of compact) {
      if (u.email) byEmail.set(String(u.email).toLowerCase(), u);
      if (u.id) byUserId.set(String(u.id), u);
      if (u.keyId) byKeyId.set(String(u.keyId), u);
      if (u.code) byCode.set(String(u.code), u);
    }

    const usageByOrderId: Record<string, unknown> = {};
    const statusPatches: Array<{ id: string; patch: Record<string, any> }> = [];
    const nowIso = new Date().toISOString();
    for (const o of orders ?? []) {
      const email = String(o.customer_email ?? '').trim().toLowerCase();
      const providerUserId = String(o.provider_user_id ?? '').trim();
      const providerKeyId = String(o.provider_key_id ?? '').trim();
      const code = String(o.code ?? '').trim();
      const match =
        (providerUserId && byUserId.get(providerUserId)) ||
        (providerKeyId && byKeyId.get(providerKeyId)) ||
        (email && byEmail.get(email)) ||
        (code && byCode.get(code)) ||
        null;
      if (!match) continue;
      usageByOrderId[o.id] = match;

      // Sincroniza status a partir do provedor (apenas para chaves manuais do gerente;
      // para revendedores, o webhook é a fonte de verdade)
      if (!(o as any).is_manager_manual) continue;
      if ((o as any).status === 'cancelled') continue;
      const patch: Record<string, any> = {};
      const providerStatus = String((match as any).status ?? '').toLowerCase();
      const expiresAt = (match as any).accountExpiresAt ? new Date((match as any).accountExpiresAt) : null;
      const isExpiredByDate = expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now();
      const tokensUsed = Number((match as any).tokensConsumed ?? (match as any).tokensInWindow ?? 0) > 0;

      if (providerStatus === 'expired' || isExpiredByDate) {
        if ((o as any).status !== 'expired') {
          patch.status = 'expired';
          patch.expired_at = (o as any).expired_at ?? (match as any).accountExpiresAt ?? nowIso;
        }
      } else if (providerStatus === 'cancelled') {
        patch.status = 'cancelled';
        patch.cancelled_at = nowIso;
      } else if (tokensUsed || (match as any).redeemedAt) {
        if ((o as any).status === 'issued') {
          patch.status = 'redeemed';
          patch.redeemed_at = (o as any).redeemed_at ?? (match as any).redeemedAt ?? nowIso;
        }
      }
      if (Object.keys(patch).length) statusPatches.push({ id: o.id, patch });
    }

    // Aplica atualizações de status em paralelo
    if (statusPatches.length) {
      await Promise.all(
        statusPatches.map(({ id, patch }) =>
          admin.from('claude_orders').update(patch).eq('id', id)
        ),
      );
    }

    return json({ ok: true, users: compact, usage_by_order_id: usageByOrderId });
  } catch (e) {
    console.error('[manager-claude-provider-users] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});