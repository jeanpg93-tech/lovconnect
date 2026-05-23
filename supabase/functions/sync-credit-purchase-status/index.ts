import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const EXTERNAL_API_BASE = 'https://lojinhalovable.com/api/v1/revenda';

// Status local considerado "em aberto" (vale a pena consultar provider)
const OPEN_LOCAL_STATUSES = new Set([
  'aguardando',
  'processando',
  'pendente',
  'configurando',
  'recarregando',
  'entregando',
  'manual_pendente',
  'manual_iniciado',
  'manual_aceito',
  'manual_processando',
]);

// Status do provider que indicam cancelamento/falha definitivos
const CANCEL_PROVIDER = new Set([
  'cancelado', 'cancelled', 'canceled',
  'falha', 'failed', 'erro', 'error',
  'queimado', 'reembolsado', 'invite_invalido', 'invalido',
]);
const SUCCESS_PROVIDER = new Set([
  'sucesso', 'entregue', 'concluido', 'completed', 'success',
]);

async function getMasterKey(admin: ReturnType<typeof createClient>) {
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'lovable_credits_master')
    .maybeSingle();
  return (data?.value?.api_key as string | undefined) ?? null;
}

// Solicita estorno no provedor (fire-and-forget). Marca em provider_response para dedupe.
async function requestProviderRefund(
  admin: ReturnType<typeof createClient>,
  apiKey: string,
  purchaseId: string,
  providerId: string,
) {
  try {
    const { data: p } = await admin
      .from('reseller_credit_purchases')
      .select('provider_response')
      .eq('id', purchaseId)
      .maybeSingle();
    const prev = ((p as any)?.provider_response ?? {}) as any;
    if (prev?.provider_refund_requested_at) return;

    let ok = false, statusCode = 0, body: any = null, errMsg: string | null = null;
    try {
      const r = await fetch(`${EXTERNAL_API_BASE}/pedidos/${providerId}/reembolso`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      });
      statusCode = r.status;
      const text = await r.text();
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      ok = r.ok && body?.success !== false;
    } catch (e: any) {
      errMsg = e?.message ?? 'fetch_failed';
    }

    await admin.from('reseller_credit_purchases').update({
      provider_response: {
        ...prev,
        provider_refund_requested_at: new Date().toISOString(),
        provider_refund_ok: ok,
        provider_refund_status_code: statusCode,
        provider_refund_response: body,
        provider_refund_error: errMsg,
      },
      updated_at: new Date().toISOString(),
    }).eq('id', purchaseId);
  } catch (_e) {
    // silencioso
  }
}

function mapProviderToLocal(providerData: any): { status: string | null; errorMessage: string | null } {
  if (!providerData) return { status: null, errorMessage: null };
  const raw = String(providerData.status ?? '').toLowerCase().trim();
  // Sinais explícitos de cancelamento
  if (providerData.cancelar === true) {
    return { status: 'cancelado', errorMessage: providerData.errorMessage ?? providerData.error ?? null };
  }
  // Convite inválido (codigoConviteStatus === 2) também é tratado como cancelado
  if (Number(providerData.codigoConviteStatus) === 2) {
    return { status: 'cancelado', errorMessage: providerData.errorMessage ?? providerData.error ?? 'Convite inválido' };
  }
  if (CANCEL_PROVIDER.has(raw)) {
    return { status: 'cancelado', errorMessage: providerData.errorMessage ?? providerData.error ?? null };
  }
  if (SUCCESS_PROVIDER.has(raw)) {
    return { status: 'sucesso', errorMessage: null };
  }
  return { status: null, errorMessage: null };
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

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.purchase_ids) ? body.purchase_ids.slice(0, 50) : null;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: reseller } = await admin
      .from('resellers').select('id').eq('user_id', userId).maybeSingle();
    if (!reseller) {
      return new Response(JSON.stringify({ error: 'Revendedor não encontrado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resellerId = reseller.id;

    // Busca as compras a sincronizar (dono = reseller atual, status em aberto)
    let q = admin
      .from('reseller_credit_purchases')
      .select('id, provider_pedido_id, status, tipo_entrega')
      .eq('reseller_id', resellerId);
    if (ids && ids.length > 0) {
      q = q.in('id', ids);
    } else {
      q = q.in('status', Array.from(OPEN_LOCAL_STATUSES)).limit(50);
    }
    const { data: purchases, error: pErr } = await q;
    if (pErr) {
      return new Response(JSON.stringify({ error: pErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!purchases || purchases.length === 0) {
      return new Response(JSON.stringify({ ok: true, synced: 0, updated: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = await getMasterKey(admin);
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Provider não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updated = 0;
    const results: Array<{ id: string; status: string; changed: boolean }> = [];

    for (const p of purchases) {
      // Só consultamos provider quando o status local ainda é "em aberto" e tipo é workspace_proprio (que usa provider externo).
      // Para manuais entregues localmente, pulamos.
      if (!OPEN_LOCAL_STATUSES.has(String(p.status ?? ''))) {
        results.push({ id: p.id, status: p.status, changed: false });
        continue;
      }
      if (String(p.status ?? '').startsWith('manual_')) {
        // pedidos manuais são gerenciados pelo admin, não pelo provider externo
        results.push({ id: p.id, status: p.status, changed: false });
        continue;
      }
      const providerId = p.provider_pedido_id ?? p.id;
      try {
        const r = await fetch(`${EXTERNAL_API_BASE}/pedidos/${providerId}`, {
          method: 'GET',
          headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        });
        const json = await r.json().catch(() => null);
        const providerData = json?.data ?? json;
        const mapped = mapProviderToLocal(providerData);
        if (mapped.status && mapped.status !== p.status) {
          const { error: uErr } = await admin
            .from('reseller_credit_purchases')
            .update({
              status: mapped.status,
              error_message: mapped.errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq('id', p.id);
          if (!uErr) {
            updated++;
            results.push({ id: p.id, status: mapped.status, changed: true });
            // Se virou cancelado, dispara estorno automático no provedor (não bloqueia)
            if (mapped.status === 'cancelado') {
              await requestProviderRefund(admin, apiKey, p.id, String(providerId));
            }
            continue;
          }
        }
        results.push({ id: p.id, status: p.status, changed: false });
      } catch (_e) {
        results.push({ id: p.id, status: p.status, changed: false });
      }
    }

    return new Response(JSON.stringify({ ok: true, synced: purchases.length, updated, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});