import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;

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
    const { data: role } = await admin
      .from('user_roles').select('role')
      .eq('user_id', u.user.id).eq('role', 'gerente').maybeSingle();
    if (!role) return json({ error: 'forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const purchaseId = typeof body?.purchase_id === 'string' ? body.purchase_id : null;
    const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 500) : null;
    if (!purchaseId) return json({ error: 'missing purchase_id' }, 400);

    const { data: p } = await admin
      .from('reseller_credit_purchases')
      .select('id, status, provider_response')
      .eq('id', purchaseId).maybeSingle();
    if (!p) return json({ error: 'purchase_not_found' }, 404);

    const prev = (p.provider_response ?? {}) as any;
    const now = new Date().toISOString();
    const attempts = Array.isArray(prev?.provider_refund_attempts) ? prev.provider_refund_attempts : [];
    attempts.push({
      at: now, ok: true, status_code: 200, error: null,
      response: { manual: true, notes },
      triggered_by: 'gerente_manual_mark',
      marked_by_user_id: u.user.id,
    });

    await admin.from('reseller_credit_purchases').update({
      status: 'reembolsado',
      provider_response: {
        ...prev,
        provider_refund_requested_at: prev?.provider_refund_requested_at ?? now,
        provider_refund_last_attempt_at: now,
        provider_refund_ok: true,
        provider_refund_status_code: 200,
        provider_refund_response: { manual: true, notes, marked_at: now, marked_by_user_id: u.user.id },
        provider_refund_error: null,
        provider_refund_manual: true,
        provider_refund_manual_at: now,
        provider_refund_manual_by: u.user.id,
        provider_refund_manual_notes: notes,
        provider_refund_attempts: attempts,
      },
      updated_at: now,
    }).eq('id', purchaseId);

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e?.message ?? 'internal_error' }, 500);
  }
});