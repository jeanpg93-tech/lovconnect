import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const PROVIDER_BASE = 'https://lojinhalovable.com/api/v1/revenda';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user) return json({ error: 'Sessão inválida' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Só gerente
    const { data: role } = await admin
      .from('user_roles').select('role')
      .eq('user_id', u.user.id).eq('role', 'gerente').maybeSingle();
    if (!role) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const purchaseId = typeof body?.purchase_id === 'string' ? body.purchase_id : null;
    if (!purchaseId) return json({ error: 'missing purchase_id' }, 400);
    const force = body?.force === true; // ignora dedupe

    const { data: p } = await admin
      .from('reseller_credit_purchases')
      .select('id, provider_pedido_id, status, provider_response')
      .eq('id', purchaseId).maybeSingle();
    if (!p) return json({ error: 'purchase_not_found' }, 404);
    if (!p.provider_pedido_id) return json({ error: 'sem provider_pedido_id (pedido manual ou local)' }, 400);
    if (String(p.status ?? '').startsWith('manual_')) return json({ error: 'pedidos manuais não usam o provedor' }, 400);

    const prev = (p.provider_response ?? {}) as any;
    if (!force && prev?.provider_refund_requested_at && prev?.provider_refund_ok) {
      return json({ error: 'já estornado com sucesso (use force=true para reenviar)' }, 409);
    }

    const { data: master } = await admin
      .from('app_settings').select('value').eq('key', 'lovable_credits_master').maybeSingle();
    const apiKey = (master as any)?.value?.api_key;
    if (!apiKey) return json({ error: 'API key do provedor não configurada' }, 500);

    let ok = false, statusCode = 0, respBody: any = null, errMsg: string | null = null;
    try {
      const r = await fetch(`${PROVIDER_BASE}/pedidos/${p.provider_pedido_id}/reembolso`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      });
      statusCode = r.status;
      const text = await r.text();
      try { respBody = JSON.parse(text); } catch { respBody = { raw: text }; }
      ok = r.ok && respBody?.success !== false;
    } catch (e: any) {
      errMsg = e?.message ?? 'fetch_failed';
    }

    const attempts = Array.isArray(prev?.provider_refund_attempts) ? prev.provider_refund_attempts : [];
    attempts.push({
      at: new Date().toISOString(),
      ok, status_code: statusCode, error: errMsg, response: respBody,
      triggered_by: 'gerente_retry',
    });

    await admin.from('reseller_credit_purchases').update({
      provider_response: {
        ...prev,
        provider_refund_requested_at: prev?.provider_refund_requested_at ?? new Date().toISOString(),
        provider_refund_last_attempt_at: new Date().toISOString(),
        provider_refund_ok: ok,
        provider_refund_status_code: statusCode,
        provider_refund_response: respBody,
        provider_refund_error: errMsg,
        provider_refund_attempts: attempts,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', purchaseId);

    return json({ ok, status_code: statusCode, error: errMsg, response: respBody });
  } catch (e: any) {
    return json({ error: e?.message ?? 'internal_error' }, 500);
  }
});