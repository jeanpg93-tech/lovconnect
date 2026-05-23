import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const PROVIDER_BASE = 'https://lojinhalovable.com/api/v1/revenda';

const LOCAL_CLOSED = ['cancelado', 'cancelled', 'canceled', 'falha', 'failed', 'reembolsado'];

// Provider status -> mapped local status (canonical)
const SUCCESS_PROVIDER = new Set(['sucesso', 'entregue', 'concluido', 'completed', 'success']);
const CANCEL_PROVIDER = new Set([
  'cancelado', 'cancelled', 'canceled',
  'falha', 'failed', 'erro', 'error',
  'queimado', 'reembolsado', 'invite_invalido', 'invalido',
]);
const OPEN_PROVIDER = new Set([
  'aguardando', 'pendente', 'pending', 'processando',
  'configurando', 'recarregando', 'entregando',
  'aguardando_avaliacao',
]);

function mapProvider(d: any): { status: string | null; reason: string } {
  if (!d) return { status: null, reason: 'no_data' };
  const raw = String(d.status ?? '').toLowerCase().trim();
  if (d.cancelar === true) return { status: 'cancelado', reason: 'cancelar_true' };
  if (Number(d.codigoConviteStatus) === 2) return { status: 'cancelado', reason: 'convite_invalido' };
  if (SUCCESS_PROVIDER.has(raw)) return { status: 'sucesso', reason: raw };
  if (CANCEL_PROVIDER.has(raw)) return { status: 'cancelado', reason: raw };
  if (OPEN_PROVIDER.has(raw)) return { status: raw === 'pending' ? 'pendente' : raw, reason: raw };
  return { status: null, reason: raw || 'unknown' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'gerente').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Apenas gerentes podem auditar' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: master } = await admin
      .from('app_settings').select('value').eq('key', 'lovable_credits_master').maybeSingle();
    const apiKey = (master as any)?.value?.api_key;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Provider não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const onlyIds: string[] | null = Array.isArray(body?.purchase_ids) ? body.purchase_ids.slice(0, 200) : null;

    let q = admin
      .from('reseller_credit_purchases')
      .select('id, status, provider_pedido_id, provider_response')
      .in('status', LOCAL_CLOSED)
      .not('provider_pedido_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (onlyIds && onlyIds.length > 0) q = q.in('id', onlyIds);
    const { data: purchases, error: pErr } = await q;
    if (pErr) {
      return new Response(JSON.stringify({ error: pErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!purchases || purchases.length === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0, fixed: 0, flagged: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refunds existentes
    const ids = purchases.map((p: any) => p.id);
    const { data: refunds } = await admin
      .from('refund_requests').select('reference_id').eq('kind', 'credit_purchase').in('reference_id', ids);
    const refundedSet = new Set((refunds ?? []).map((r: any) => r.reference_id));

    let fixed = 0, flagged = 0, ok_match = 0;
    const details: any[] = [];

    for (const p of purchases as any[]) {
      try {
        const r = await fetch(`${PROVIDER_BASE}/pedidos/${p.provider_pedido_id}`, {
          method: 'GET', headers: { 'X-API-Key': apiKey },
        });
        const j = await r.json().catch(() => null);
        const providerData = j?.data ?? j;
        const mapped = mapProvider(providerData);
        const localIsCancelled = ['cancelado', 'cancelled', 'canceled', 'falha', 'failed'].includes(String(p.status));
        const localIsRefunded = String(p.status) === 'reembolsado';

        // Tudo bate: provedor confirma cancelado/reembolsado
        if (mapped.status === 'cancelado' || (localIsRefunded && (providerData?.status === 'reembolsado'))) {
          ok_match++;
          details.push({ id: p.id, action: 'match', provider_status: providerData?.status });
          continue;
        }

        // Provedor está com outro status (sucesso / em andamento)
        const shouldBe = mapped.status; // 'sucesso' | 'recarregando' | ...
        if (!shouldBe) {
          details.push({ id: p.id, action: 'unknown', provider_status: providerData?.status });
          continue;
        }

        const hasRefund = refundedSet.has(p.id);
        const prevResp = (p.provider_response ?? {}) as any;
        const audit = {
          audit_mismatch: true,
          audit_local_status_before: p.status,
          audit_provider_status: providerData?.status ?? null,
          audit_provider_cancelar: providerData?.cancelar ?? null,
          audit_provider_codigoConviteStatus: providerData?.codigoConviteStatus ?? null,
          audit_should_be: shouldBe,
          audit_has_refund_issued: hasRefund,
          audit_at: new Date().toISOString(),
        };

        if (hasRefund) {
          // Reembolso já foi pago ao revendedor — não mexer no status para evitar bagunça contábil.
          // Apenas sinalizar para revisão.
          await admin.from('reseller_credit_purchases').update({
            provider_response: { ...prevResp, ...audit },
            updated_at: new Date().toISOString(),
          }).eq('id', p.id);
          flagged++;
          details.push({ id: p.id, action: 'flagged_refund_already_issued', provider_status: providerData?.status, should_be: shouldBe });
          continue;
        }

        // Sem reembolso emitido → corrigir status local
        await admin.from('reseller_credit_purchases').update({
          status: shouldBe,
          error_message: null,
          provider_response: { ...prevResp, ...audit },
          updated_at: new Date().toISOString(),
        }).eq('id', p.id);
        fixed++;
        details.push({ id: p.id, action: 'fixed', from: p.status, to: shouldBe, provider_status: providerData?.status });
      } catch (e: any) {
        details.push({ id: p.id, action: 'error', error: e?.message });
      }
    }

    return new Response(JSON.stringify({
      ok: true, checked: purchases.length, fixed, flagged, ok_match, details,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});