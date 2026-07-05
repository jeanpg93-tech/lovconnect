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
      .select('id, plan_code, status, customer_email, customer_name, customer_whatsapp, customer_id, customer_identifier, created_at, sale_price_cents, provider_key_id, provider_api_key, code, cancelled_at, redeemed_at, expired_at, cancel_requested_at, cancel_request_note, refund_waived, customer_refund_full_name, customer_refund_pix_key, customer_refund_pix_key_type, customer_refunded_at, customer_refund_note')
      .eq('reseller_id', reseller.id)
      .order('created_at', { ascending: false })
      .limit(500);

    // Portal existente por e-mail (claude_customers deste revendedor)
    const emailsWithPortal = new Set<string>();
    {
      const emails = Array.from(new Set(
        (orders ?? [])
          .map((o) => String(o.customer_email ?? '').trim().toLowerCase())
          .filter(Boolean),
      ));
      if (emails.length) {
        const { data: portalRows } = await admin
          .from('claude_customers')
          .select('email')
          .eq('reseller_id', reseller.id)
          .in('email', emails);
        for (const r of portalRows ?? []) {
          const e = String((r as any).email ?? '').trim().toLowerCase();
          if (e) emailsWithPortal.add(e);
        }
      }
    }

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

    // Reconcilia status no fornecedor (best-effort) para pedidos ainda "issued".
    // Alguns provedores expõem GET /api/rsl/keys/:id retornando status: active|redeemed|cancelled|expired.
    async function fetchProviderKey(ref: string) {
      try {
        const r = await fetch(`${CLAUDE_BASE_URL}/api/rsl/keys/${encodeURIComponent(ref)}`, {
          headers: { Authorization: `Bearer ${CLAUDE_API_KEY}`, Accept: 'application/json' },
        });
        if (!r.ok) return null;
        return await r.json().catch(() => null);
      } catch { return null; }
    }

    const providerKeyByOrder = new Map<string, any>();
    const targets = (orders ?? []).filter((o) => o.status === 'issued' && (o.provider_key_id || o.code));
    const CONCURRENCY = 6;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const slice = targets.slice(i, i + CONCURRENCY);
      await Promise.all(slice.map(async (o) => {
        const ref = String(o.provider_key_id ?? o.code ?? '').trim();
        if (!ref) return;
        const data = await fetchProviderKey(ref);
        if (data) providerKeyByOrder.set(o.id, data);
      }));
    }

    // Espelha status terminais recebidos do provedor no banco (sem esperar webhook).
    const patches: Array<{ id: string; patch: Record<string, unknown> }> = [];
    for (const [orderId, pk] of providerKeyByOrder.entries()) {
      // Provider may wrap the payload as {key:{...}} or {data:{...}}; be tolerant.
      const keyObj = (pk && typeof pk === 'object') ? (pk.key ?? pk.data ?? pk) : pk;
      const provStatus = String(keyObj?.status ?? keyObj?.state ?? '').toLowerCase();
      const patch: Record<string, unknown> = {};
      if (provStatus === 'redeemed' || provStatus === 'used' || provStatus === 'activated') {
        patch.status = 'redeemed';
        patch.redeemed_at = keyObj?.redeemedAt ?? keyObj?.redeemed_at ?? new Date().toISOString();
      } else if (provStatus === 'cancelled' || provStatus === 'canceled' || provStatus === 'revoked') {
        patch.status = 'cancelled';
        patch.cancelled_at = keyObj?.cancelledAt ?? keyObj?.cancelled_at ?? new Date().toISOString();
      } else if (provStatus === 'expired') {
        patch.status = 'expired';
        patch.expired_at = keyObj?.expiredAt ?? keyObj?.expired_at ?? new Date().toISOString();
      }
      if (Object.keys(patch).length) patches.push({ id: orderId, patch });
    }
    if (patches.length) {
      console.log('[claude-customers-usage] reconciling', patches.length, 'orders', patches.map((p) => ({ id: p.id, ...p.patch })));
    }
    await Promise.all(patches.map(async (p) => {
      const { error } = await admin.from('claude_orders').update(p.patch).eq('id', p.id);
      if (error) console.error('[claude-customers-usage] patch failed', p.id, error.message);
    }));

    const REFUND_WINDOW_DAYS = 7;
    const enriched = (orders ?? []).map((o) => {
      const email = String(o.customer_email ?? '').trim().toLowerCase();
      const match = email ? byEmail.get(email) : null;
      const pkRaw = providerKeyByOrder.get(o.id);
      const pk = (pkRaw && typeof pkRaw === 'object') ? (pkRaw.key ?? pkRaw.data ?? pkRaw) : pkRaw;
      const patched = patches.find((p) => p.id === o.id)?.patch as { status?: string } | undefined;
      const effectiveStatus = (patched?.status as string) ?? o.status;
      const providerStatus = String(pk?.status ?? pk?.state ?? '').toLowerCase() || null;
      const createdMs = new Date(o.created_at).getTime();
      const refundDeadlineMs = createdMs + REFUND_WINDOW_DAYS * 86_400_000;
      const withinRefundWindow = Date.now() <= refundDeadlineMs;
      return {
        ...o,
        status: effectiveStatus,
        origin: o.customer_id ? 'loja' : 'api',
        provider_status: providerStatus,
        refund_deadline_at: new Date(refundDeadlineMs).toISOString(),
        within_refund_window: withinRefundWindow,
        portal_active: email ? emailsWithPortal.has(email) : false,
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
          percentRemaining: match?.usage?.percentRemaining ?? null,
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
      refund_window_days: REFUND_WINDOW_DAYS,
    });
  } catch (e) {
    console.error('[claude-customers-usage] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});