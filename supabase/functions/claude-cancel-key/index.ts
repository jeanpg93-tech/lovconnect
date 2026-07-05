import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLAUDE_API_KEY = Deno.env.get('CLAUDE_RESELLER_API_KEY')!;
const CLAUDE_BASE_URL = (Deno.env.get('CLAUDE_RESELLER_API_BASE_URL') ?? '').replace(/\/$/, '');

// Janela de cancelamento com estorno automático (dias corridos)
const REFUND_WINDOW_DAYS = 7;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

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

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? '').trim();
    const force = Boolean(body?.force);
    if (!orderId) return json({ error: 'missing_order_id' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: reseller } = await admin
      .from('resellers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!reseller) return json({ error: 'reseller_not_found' }, 404);

    const { data: order, error: oErr } = await admin
      .from('claude_orders')
      .select('*')
      .eq('id', orderId)
      .eq('reseller_id', reseller.id)
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) return json({ error: 'order_not_found' }, 404);
    // Aceitamos cancelamento de chaves ainda não resgatadas (issued),
    // já ativadas pelo cliente (redeemed) e as que estão com pedido de
    // cancelamento pendente do cliente (cancel_requested). Estados finais
    // (cancelled/expired/failed/refunded) permanecem bloqueados.
    if (!['issued', 'redeemed', 'cancel_requested'].includes(order.status)) {
      return json({ error: 'invalid_status', status: order.status }, 409);
    }
    // Fallback: se o fornecedor não devolveu um ID separado, o próprio "code" é o identificador.
    const providerKeyRef = String(order.provider_key_id ?? order.code ?? '').trim();
    if (!providerKeyRef) return json({ error: 'missing_provider_key_id' }, 422);
    if (!CLAUDE_BASE_URL) return json({ error: 'provider_not_configured' }, 500);

    // Regra dos 7 dias: fora da janela precisa de `force` e NÃO estorna.
    const createdAtMs = new Date(order.created_at).getTime();
    const ageDays = (Date.now() - createdAtMs) / 86_400_000;
    const withinWindow = ageDays <= REFUND_WINDOW_DAYS;
    if (!withinWindow && !force) {
      return json({
        error: 'refund_window_expired',
        message: `Prazo de ${REFUND_WINDOW_DAYS} dias para cancelamento com estorno já expirou. Envie force=true para cancelar mesmo assim (sem estorno).`,
        age_days: Math.floor(ageDays),
        refund_window_days: REFUND_WINDOW_DAYS,
      }, 409);
    }

    // Chama fornecedor — usa MINHA api key (revendedor nunca fala direto).
    let providerStatus = 0;
    let providerResp: any = null;
    try {
      const r = await fetch(
        `${CLAUDE_BASE_URL}/api/rsl/keys/${encodeURIComponent(providerKeyRef)}/cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CLAUDE_API_KEY}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      providerStatus = r.status;
      const txt = await r.text();
      try { providerResp = JSON.parse(txt); } catch { providerResp = { raw: txt }; }
    } catch (e) {
      providerStatus = 0;
      providerResp = { network_error: String((e as Error)?.message ?? e) };
    }

    const now = new Date().toISOString();
    const prevAttempts = Array.isArray(order.cancel_attempts) ? order.cancel_attempts : [];
    const attempt = {
      at: now,
      status_code: providerStatus,
      ok: providerStatus >= 200 && providerStatus < 300,
      response: providerResp,
    };

    if (providerStatus < 200 || providerStatus >= 300) {
      // 409 = já cancelada/reembolsada/resgatada no provedor.
      if (providerStatus === 409) {
        const provStatus = String(providerResp?.status ?? '').toLowerCase();
        const errMsg = String(providerResp?.error ?? providerResp?.message ?? '').toLowerCase();
        const alreadyCancelled =
          provStatus === 'cancelled' ||
          provStatus === 'refunded' ||
          /cancel|reembols|refund/.test(errMsg);

        if (alreadyCancelled) {
          // Sincroniza o estado local: a chave está morta no provedor.
          // Se ainda não estornamos (dentro do prazo), estorna agora.
          const { data: existingRefund } = await admin
            .from('balance_transactions')
            .select('id')
            .eq('reseller_id', reseller.id)
            .eq('reference_id', order.id)
            .eq('kind', 'claude_key_refund')
            .maybeSingle();

          let refundCents = 0;
          if (!existingRefund && withinWindow) {
            const { data: issueTx } = await admin
              .from('balance_transactions')
              .select('amount_cents')
              .eq('reseller_id', reseller.id)
              .eq('reference_id', order.id)
              .eq('kind', 'claude_key_issue')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            const debited = issueTx ? Math.abs(Number((issueTx as any).amount_cents) || 0) : 0;
            refundCents = debited > 0 ? debited : (Number(order.cost_cents) || 0);
            if (refundCents > 0) {
              await admin.rpc('credit_reseller_balance', {
                _reseller_id: reseller.id,
                _amount_cents: refundCents,
                _kind: 'claude_key_refund',
                _description: `Cancelamento chave Claude ${order.plan_code} (sync provedor)`,
                _reference_id: order.id,
              });
            }
          }
          await admin.from('claude_orders').update({
            status: 'cancelled',
            cancelled_at: now,
            refund_waived: !withinWindow && !existingRefund,
            cancel_attempts: [...prevAttempts, attempt],
          }).eq('id', order.id);
          return json({
            ok: true,
            synced: true,
            order_id: order.id,
            refund_cents: refundCents,
            message: 'Chave já estava cancelada no provedor — status sincronizado.',
          });
        }

        // Ainda resgatada (não cancelada) — mantém como estava.
        await admin.from('claude_orders').update({
          status: provStatus === 'redeemed' ? 'cancel_rejected' : (order.status),
          cancel_attempts: [...prevAttempts, attempt],
        }).eq('id', order.id);
        return json({
          error: 'already_redeemed',
          provider_status: provStatus,
          body: providerResp,
        }, 409);
      }
      await admin.from('claude_orders').update({
        status: 'cancel_failed',
        cancel_attempts: [...prevAttempts, attempt],
      }).eq('id', order.id);
      return json({
        error: 'provider_cancel_failed',
        status: providerStatus,
        body: providerResp,
      }, 502);
    }

    // Estorna EXATAMENTE o valor que foi debitado da carteira do revendedor.
    // O fornecedor pode devolver/relatar apenas o custo interno (ex.: R$20), mas
    // a carteira do revendedor foi cobrada pelo custo real do nível (ex.: R$58).
    // Portanto, a fonte da verdade é a transação `claude_key_issue` vinculada ao pedido.
    const { data: issueTx } = await admin
      .from('balance_transactions')
      .select('amount_cents')
      .eq('reseller_id', reseller.id)
      .eq('reference_id', order.id)
      .eq('kind', 'claude_key_issue')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const debitedCents = issueTx ? Math.abs(Number((issueTx as any).amount_cents) || 0) : 0;
    const baseRefund = debitedCents > 0 ? debitedCents : (Number(order.cost_cents) || 0);
    const refundCents = withinWindow ? baseRefund : 0;
    if (refundCents > 0) {
      const { error: cErr } = await admin.rpc('credit_reseller_balance', {
        _reseller_id: reseller.id,
        _amount_cents: refundCents,
        _kind: 'claude_key_refund',
        _description: `Cancelamento chave Claude ${order.plan_code}`,
        _reference_id: order.id,
      });
      if (cErr) {
        await admin.from('claude_orders').update({
          cancel_attempts: [...prevAttempts, attempt, {
            at: new Date().toISOString(),
            ok: false,
            refund_error: cErr.message,
          }],
        }).eq('id', order.id);
        return json({ error: 'refund_failed', detail: cErr.message }, 500);
      }
    }

    await admin.from('claude_orders').update({
      status: 'cancelled',
      cancelled_at: now,
      refund_waived: !withinWindow,
      cancel_attempts: [...prevAttempts, attempt],
    }).eq('id', order.id);

    return json({
      ok: true,
      order_id: order.id,
      refund_cents: refundCents,
      refund_waived: !withinWindow,
      age_days: Math.floor(ageDays),
      provider_response: providerResp,
    });
  } catch (e) {
    console.error('[claude-cancel-key] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});