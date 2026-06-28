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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: reseller } = await admin
      .from('resellers')
      .select('id, claude_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    if (!reseller) return json({ error: 'reseller_not_found' }, 404);
    if (!reseller.claude_enabled) return json({ error: 'claude_not_enabled' }, 403);

    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

    // Vendas Claude desse revendedor (para casar por email)
    const { data: orders } = await admin
      .from('claude_orders')
      .select('id, plan_code, status, customer_email, customer_name, customer_whatsapp, created_at, sale_price_cents, provider_key_id')
      .eq('reseller_id', reseller.id)
      .order('created_at', { ascending: false })
      .limit(500);

    // Busca usuários no fornecedor (uso de tokens)
    let providerUsers: any[] = [];
    let providerError: string | null = null;
    try {
      const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/users`, {
        headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: 'application/json' },
      });
      const txt = await r.text();
      let parsed: any;
      try { parsed = JSON.parse(txt); } catch { parsed = null; }
      if (!r.ok) {
        providerError = `provider_${r.status}`;
      } else {
        providerUsers = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : [];
      }
    } catch (e) {
      providerError = String((e as Error)?.message ?? e);
    }

    const byEmail = new Map<string, any>();
    for (const u of providerUsers) {
      const email = String(u?.email ?? '').trim().toLowerCase();
      if (email) byEmail.set(email, u);
    }

    const enriched = (orders ?? []).map((o) => {
      const email = String(o.customer_email ?? '').trim().toLowerCase();
      const match = email ? byEmail.get(email) : null;
      return {
        ...o,
        usage: match ? {
          email: match.email,
          kind: match.kind,
          status: match.status,
          accountExpiresAt: match.accountExpiresAt,
          redeemedAt: match.redeemedAt,
          tokensConsumed: match?.usage?.tokensConsumed ?? null,
          tokenLimit: match?.usage?.tokenLimit ?? null,
          tokensInWindow: match?.usage?.tokensInWindow ?? null,
          tokenWindowHours: match?.usage?.tokenWindowHours ?? null,
          dailyPercentUsed: match?.usage?.dailyPercentUsed ?? null,
          weeklyTokenLimit: match?.usage?.weeklyTokenLimit ?? null,
          weeklyTokensInWindow: match?.usage?.weeklyTokensInWindow ?? null,
        } : null,
      };
    });

    return json({
      ok: true,
      provider_error: providerError,
      provider_total: providerUsers.length,
      orders: enriched,
    });
  } catch (e) {
    console.error('[claude-customers-usage] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});