// Cria (ou reutiliza) um cliente final de Claude vinculado a um revendedor.
// - Se o email ainda não existe em auth.users: cria com senha aleatória e envia magic link.
// - Se já existe: apenas envia magic link (idempotente).
// Público: sem JWT (chamado do storefront/link externo).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (d: unknown, status = 200) =>
  new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function randomPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const reseller_id = String(body?.reseller_id ?? "").trim();
    const name = String(body?.name ?? "").trim().slice(0, 120);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const whatsapp = body?.whatsapp ? String(body.whatsapp).replace(/\D+/g, "").slice(0, 15) : null;
    const redirect_to = String(body?.redirect_to ?? "").trim() || undefined;

    if (!reseller_id) return json({ error: "reseller_id_required" }, 400);
    if (name.length < 2) return json({ error: "name_required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);

    const { data: reseller } = await admin
      .from("resellers")
      .select("id, is_active, claude_enabled")
      .eq("id", reseller_id)
      .maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "reseller_not_found" }, 404);
    if (!reseller.claude_enabled) return json({ error: "claude_not_enabled" }, 403);

    // Já tem cliente para esse revendedor + email?
    const { data: existing } = await admin
      .from("claude_customers")
      .select("id, auth_user_id")
      .eq("reseller_id", reseller_id)
      .eq("email", email)
      .maybeSingle();

    let authUserId = existing?.auth_user_id ?? null;
    let generatedPassword: string | null = null;

    if (!authUserId) {
      // SECURITY: só criamos/associamos contas para claude_customers deste revendedor.
      // Não buscamos em auth.users por email para evitar account-takeover.
      // Se o email já existir em auth.users mas não for um claude_customer deste
      // revendedor, seguimos com createUser — que falhará se já cadastrado,
      // retornando erro genérico (sem vazar magic link).
      generatedPassword = randomPassword(16);
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { name, claude_customer: true, reseller_id },
      });
      if (cErr || !created?.user) {
        return json({ error: "email_already_registered_or_invalid" }, 409);
      }
      authUserId = created.user.id;
    }

    // Upsert claude_customers
    let customerId = existing?.id ?? null;
    if (!customerId) {
      const { data: ins, error: iErr } = await admin
        .from("claude_customers")
        .insert({
          reseller_id,
          auth_user_id: authUserId,
          name,
          email,
          whatsapp,
          must_change_password: !!generatedPassword,
        })
        .select("id")
        .single();
      if (iErr) return json({ error: "customer_create_failed", detail: iErr.message }, 500);
      customerId = ins.id;
    } else if (!existing?.auth_user_id && authUserId) {
      await admin.from("claude_customers").update({ auth_user_id: authUserId }).eq("id", customerId);
    }

    // SECURITY: enviamos o magic link por email via Supabase (signInWithOtp)
    // em vez de retornar o action_link na resposta — assim apenas o dono real
    // do email recebe o link.
    const { error: otpErr } = await admin.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirect_to, shouldCreateUser: false },
    });
    if (otpErr) {
      console.warn("[claude-customer-signup] signInWithOtp failed", otpErr.message);
    }

    return json({
      success: true,
      customer_id: customerId,
      auth_user_id: authUserId,
      generated_password: generatedPassword, // one-time (mostrar ao cliente na tela)
      magic_link_sent: !otpErr,
    });
  } catch (e) {
    console.error("[claude-customer-signup]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});