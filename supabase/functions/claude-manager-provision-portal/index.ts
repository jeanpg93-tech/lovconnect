// Provisiona (ou reseta) acesso do cliente ao portal para pedidos emitidos
// pelo painel do Gerente. O portal é atrelado à loja padrão definida em
// app_settings.manager_reseller_id (por padrão, a loja "lovconnect" do Jean).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function randomPassword(len = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return json({ error: 'unauthorized' }, 401);

    const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: uErr } = await asUser.auth.getUser();
    if (uErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const { data: isManager } = await asUser.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'gerente',
    });
    if (!isManager) return json({ error: 'forbidden' }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? '').trim();
    const action = (String(body?.action ?? 'provision').trim() as 'provision' | 'reset');
    if (!orderId) return json({ error: 'order_id_required' }, 400);

    // Descobre o reseller padrão do gerente
    const { data: setting } = await admin
      .from('app_settings').select('value').eq('key', 'manager_reseller_id').maybeSingle();
    const managerResellerId = String((setting as any)?.value ?? '').trim();
    if (!managerResellerId) return json({ error: 'manager_reseller_not_configured' }, 500);

    const { data: order } = await admin
      .from('claude_orders')
      .select('id, reseller_id, customer_email, customer_name, customer_whatsapp, plan_code')
      .eq('id', orderId).maybeSingle();
    if (!order) return json({ error: 'order_not_found' }, 404);

    const email = String((order as any).customer_email ?? '').trim().toLowerCase();
    const name = String((order as any).customer_name ?? '').trim() || 'Cliente';
    const whatsapp = String((order as any).customer_whatsapp ?? '').replace(/\D+/g, '') || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'customer_email_required' }, 400);

    // Atrela a order à loja padrão do gerente (para o portal listar essa venda)
    if (!(order as any).reseller_id) {
      await admin.from('claude_orders').update({ reseller_id: managerResellerId }).eq('id', orderId);
    }

    let { data: customer } = await admin
      .from('claude_customers')
      .select('id, auth_user_id, email, whatsapp, name, must_change_password')
      .eq('reseller_id', managerResellerId).eq('email', email).maybeSingle();

    let authUserId = (customer as any)?.auth_user_id as string | null | undefined;
    let tempPassword: string | null = null;
    let alreadyExisted = !!customer;

    if (!authUserId) {
      tempPassword = randomPassword(14);
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { name, claude_customer: true, reseller_id: managerResellerId },
      });
      if (cErr || !created?.user) {
        const msg = String(cErr?.message ?? '').toLowerCase();
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
          return json({
            error: 'email_already_registered',
            detail: 'Este e-mail já possui conta em outra loja/portal. Peça ao cliente para usar "Esqueci a senha".',
          }, 409);
        }
        return json({ error: 'auth_create_failed', detail: cErr?.message }, 500);
      }
      authUserId = created.user.id;
    } else if (action === 'reset') {
      tempPassword = randomPassword(14);
      const { error: uErr2 } = await admin.auth.admin.updateUserById(authUserId, { password: tempPassword });
      if (uErr2) return json({ error: 'auth_reset_failed', detail: uErr2.message }, 500);
    }

    if (!customer) {
      const { data: ins, error: iErr } = await admin
        .from('claude_customers')
        .insert({
          reseller_id: managerResellerId,
          auth_user_id: authUserId,
          name, email, whatsapp,
          must_change_password: true,
        })
        .select('id').single();
      if (iErr) return json({ error: 'customer_create_failed', detail: iErr.message }, 500);
      customer = { id: ins.id, auth_user_id: authUserId, email, whatsapp, name, must_change_password: true } as any;
    } else if (action === 'reset') {
      await admin.from('claude_customers')
        .update({ must_change_password: true })
        .eq('id', (customer as any).id);
    }

    // Descobre slug da loja para montar portal_url de retorno
    const { data: sf } = await admin
      .from('resellers').select('slug').eq('id', managerResellerId).maybeSingle();
    const slug = (sf as any)?.slug ?? null;

    return json({
      ok: true,
      email,
      name,
      whatsapp,
      temp_password: tempPassword,
      already_existed: alreadyExisted,
      action,
      reseller_slug: slug,
    });
  } catch (e) {
    console.error('[claude-manager-provision-portal] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});