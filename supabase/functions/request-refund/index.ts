import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REFUNDABLE_RECHARGE_STATUS = new Set(['failed', 'expired', 'canceled', 'cancelled']);
const REFUNDABLE_ORDER_STATUS = new Set(['failed', 'revoked']);
const REFUNDABLE_CREDIT_PURCHASE_STATUS = new Set(['cancelado', 'cancelled', 'canceled', 'falha', 'failed']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
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
    const kind = body?.kind;
    const referenceId = body?.reference_id;
    if ((kind !== 'recharge' && kind !== 'license' && kind !== 'credit_purchase') || typeof referenceId !== 'string' || !referenceId) {
      return new Response(JSON.stringify({ error: 'Parâmetros inválidos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Reseller do usuário
    const { data: reseller } = await admin
      .from('resellers').select('id').eq('user_id', userId).maybeSingle();
    if (!reseller) {
      return new Response(JSON.stringify({ error: 'Revendedor não encontrado' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resellerId = reseller.id;

    // Já reembolsado?
    const { data: existing } = await admin
      .from('refund_requests')
      .select('id')
      .eq('kind', kind)
      .eq('reference_id', referenceId)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: 'Este item já foi reembolsado' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let amountCents = 0;
    let description = '';

    if (kind === 'recharge') {
      const { data: r } = await admin
        .from('recharge_intents')
        .select('id,reseller_id,amount_cents,status,paid_at')
        .eq('id', referenceId)
        .maybeSingle();
      if (!r || r.reseller_id !== resellerId) {
        return new Response(JSON.stringify({ error: 'Recarga não encontrada' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!REFUNDABLE_RECHARGE_STATUS.has(r.status)) {
        return new Response(JSON.stringify({ error: `Status "${r.status}" não permite reembolso` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!r.paid_at) {
        return new Response(JSON.stringify({ error: 'Recarga nunca foi paga — nada a reembolsar' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      amountCents = Number(r.amount_cents) || 0;
      description = `Reembolso recarga ${r.id}`;
    } else if (kind === 'license') {
      const { data: o } = await admin
        .from('orders')
        .select('id,reseller_id,price_cents,status,is_test')
        .eq('id', referenceId)
        .maybeSingle();
      if (!o || o.reseller_id !== resellerId) {
        return new Response(JSON.stringify({ error: 'Licença não encontrada' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (o.is_test) {
        return new Response(JSON.stringify({ error: 'Licenças teste não são reembolsáveis' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!REFUNDABLE_ORDER_STATUS.has(o.status)) {
        return new Response(JSON.stringify({ error: `Status "${o.status}" não permite reembolso` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      amountCents = Number(o.price_cents) || 0;
      description = `Reembolso licença ${o.id}`;
    } else {
      // kind === 'credit_purchase'
      const { data: c } = await admin
        .from('reseller_credit_purchases')
        .select('id,reseller_id,price_cents,status')
        .eq('id', referenceId)
        .maybeSingle();
      if (!c || c.reseller_id !== resellerId) {
        return new Response(JSON.stringify({ error: 'Compra de créditos não encontrada' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!REFUNDABLE_CREDIT_PURCHASE_STATUS.has(String(c.status))) {
        return new Response(JSON.stringify({ error: `Status "${c.status}" não permite reembolso` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      amountCents = Number(c.price_cents) || 0;
      description = `Estorno compra de créditos ${String(c.id).slice(0, 8)}`;

      // Marca o pedido (orders) vinculado a esta compra de créditos como reembolsado,
      // para que o dashboard pare de contabilizá-lo como venda/receita.
      try {
        const providerPedidoId =
          (c as any)?.provider_pedido_id ??
          null;
        // Busca pelo provider_pedido_id quando existir; caso contrário, casa por nota.
        const orderQuery = admin
          .from('orders')
          .select('id,status')
          .eq('reseller_id', resellerId)
          .eq('product_type', 'credits')
          .in('status', ['completed', 'sucesso', 'success']);
        const { data: candidateOrders } = await orderQuery;
        const match = (candidateOrders ?? []).find((o: any) =>
          providerPedidoId
            ? String((o as any)?.notes ?? '').includes(String(providerPedidoId))
            : false,
        );
        // Fallback: tenta achar pela referência da própria compra (id) na nota.
        const fallback = match
          ? null
          : (candidateOrders ?? []).find((o: any) =>
              String((o as any)?.notes ?? '').includes(String(referenceId)),
            );
        const target = match ?? fallback;
        if (target?.id) {
          await admin
            .from('orders')
            .update({ status: 'reembolsado' })
            .eq('id', target.id);
        }
      } catch (_e) {
        // não bloqueia o reembolso se a atualização do pedido falhar
      }
    }

    if (amountCents <= 0) {
      return new Response(JSON.stringify({ error: 'Valor inválido para reembolso' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insere registro do reembolso (unique impede duplicidade)
    const { error: insErr } = await admin.from('refund_requests').insert({
      reseller_id: resellerId,
      kind,
      reference_id: referenceId,
      amount_cents: amountCents,
      status: 'completed',
    });
    if (insErr) {
      const dup = (insErr as any)?.code === '23505';
      return new Response(JSON.stringify({ error: dup ? 'Este item já foi reembolsado' : insErr.message }), {
        status: dup ? 409 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Credita o saldo automaticamente
    const { error: creditErr } = await admin.rpc('credit_reseller_balance', {
      _reseller_id: resellerId,
      _amount_cents: amountCents,
      _kind: 'refund',
      _description: description,
      _reference_id: referenceId,
    });
    if (creditErr) {
      return new Response(JSON.stringify({ error: `Falha ao creditar: ${creditErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, amount_cents: amountCents }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});