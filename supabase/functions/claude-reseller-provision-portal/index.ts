// Provisions (or resets) portal access for a customer of a given claude_orders row.
// Authenticated as reseller. Idempotent when action = "provision".
// action = "reset" always generates a new temporary password.
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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: reseller } = await admin
      .from('resellers').select('id, display_name').eq('user_id', userData.user.id).maybeSingle();
    if (!reseller) return json({ error: 'not_a_reseller' }, 403);
    const resellerId = (reseller as any).id as string;

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? '').trim();
    const action = (String(body?.action ?? 'provision').trim() as 'provision' | 'reset');
    const sendWhatsapp = !!body?.send_whatsapp;
    if (!orderId) return json({ error: 'order_id_required' }, 400);

    const { data: order } = await admin
      .from('claude_orders')
      .select('id, reseller_id, customer_id, customer_email, customer_name, customer_whatsapp, plan_code')
      .eq('id', orderId).maybeSingle();
    if (!order) return json({ error: 'order_not_found' }, 404);
    if ((order as any).reseller_id !== resellerId) return json({ error: 'forbidden' }, 403);

    const email = String((order as any).customer_email ?? '').trim().toLowerCase();
    const name = String((order as any).customer_name ?? '').trim() || 'Cliente';
    const whatsapp = String((order as any).customer_whatsapp ?? '').replace(/\D+/g, '') || null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'customer_email_required' }, 400);

    // Existing customer for THIS reseller
    let { data: customer } = await admin
      .from('claude_customers')
      .select('id, auth_user_id, email, whatsapp, name, must_change_password')
      .eq('reseller_id', resellerId).eq('email', email).maybeSingle();

    let authUserId = (customer as any)?.auth_user_id as string | null | undefined;
    let tempPassword: string | null = null;
    let alreadyExisted = !!customer;

    // Create auth user if needed
    if (!authUserId) {
      tempPassword = randomPassword(14);
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password: tempPassword, email_confirm: true,
        user_metadata: { name, claude_customer: true, reseller_id: resellerId },
      });
      if (cErr || !created?.user) {
        const msg = String(cErr?.message ?? '').toLowerCase();
        if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
          return json({
            error: 'email_already_registered',
            detail: 'Este e-mail já possui conta em outra loja/portal. Peça ao cliente para usar "Esqueci a senha" no portal.',
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

    // Upsert claude_customers row
    if (!customer) {
      const { data: ins, error: iErr } = await admin
        .from('claude_customers')
        .insert({
          reseller_id: resellerId,
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

    // Attempt WhatsApp send if requested (best-effort)
    let whatsappSent = false;
    let whatsappSkipped: string | null = null;
    if (sendWhatsapp && whatsapp && tempPassword) {
      try {
        const portalUrl = String(body?.portal_url ?? '').trim() || 'https://lovconnect.store/cliente-claude/login';
        const text =
          `Olá! Você agora tem acesso ao portal para acompanhar o consumo dos seus tokens Claude.\n\n` +
          `🔗 Portal: ${portalUrl}\n` +
          `📧 E-mail: ${email}\n` +
          `🔒 Senha temporária: ${tempPassword}\n\n` +
          `No primeiro acesso você será solicitado a definir uma nova senha.`;
        const r = await fetch(`${SUPABASE_URL}/functions/v1/evolution-send-sale`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reseller_id: resellerId, kind: 'claude', to: whatsapp,
            vars: { nome: name, plano: (order as any).plan_code, link: portalUrl, chave: tempPassword },
            raw_text_override: text, // ignored today; template still used if configured
          }),
        });
        const jr = await r.json().catch(() => ({}));
        whatsappSent = !!jr?.ok;
        if (!whatsappSent) whatsappSkipped = jr?.skipped || jr?.error || 'send_failed';
      } catch (e) {
        whatsappSkipped = String((e as Error)?.message ?? e);
      }
    }

    return json({
      ok: true,
      email,
      name,
      whatsapp,
      temp_password: tempPassword,               // null if action=provision and portal already existed
      already_existed: alreadyExisted,
      action,
      whatsapp_sent: whatsappSent,
      whatsapp_skipped: whatsappSkipped,
    });
  } catch (e) {
    console.error('[claude-reseller-provision-portal] error', e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});