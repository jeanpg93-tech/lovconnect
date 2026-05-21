import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REFUNDABLE_RECHARGE_STATUS = new Set(['failed', 'expired', 'canceled', 'cancelled']);
const REFUNDABLE_ORDER_STATUS = new Set(['failed', 'revoked']);

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
    if ((kind !== 'recharge' && kind !== 'license') || typeof referenceId !== 'string' || !referenceId) {
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
        .select('id,reseller_id,amount_cents,status')
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
      amountCents = Number(r.amount_cents) || 0;
      description = `Reembolso recarga ${r.id}`;
    } else {
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