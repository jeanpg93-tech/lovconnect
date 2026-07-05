// Cron-invoked function: marks Claude orders as `expired` when their PIX
// window elapsed without payment. Runs safely without auth (invoked via pg_net).
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Autenticação: só chamadas internas (cron/service-role) ou gerentes.
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authTok = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (authTok !== SERVICE_ROLE_KEY) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: `Bearer ${authTok}` } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isMgr } = await userClient.rpc("has_role", { _user_id: u.user.id, _role: "gerente" });
    if (!isMgr) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nowIso = new Date().toISOString();

  // Only pedidos aguardando pagamento com pix_expires_at no passado
  const { data, error } = await svc
    .from("claude_orders")
    .update({ status: "expired", expired_at: nowIso, error_message: "pix_expired" })
    .in("status", ["pending", "awaiting_payment"])
    .not("pix_expires_at", "is", null)
    .lt("pix_expires_at", nowIso)
    .select("id");

  if (error) {
    console.error("[claude-expire-pending-pix]", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ success: true, expired: data?.length ?? 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});