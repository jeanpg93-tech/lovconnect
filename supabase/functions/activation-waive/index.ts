import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await sb.auth.getClaims(auth.replace("Bearer ", ""));
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "gerente").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const resellerId = String(body.reseller_id ?? "");
    const reason = body.reason ? String(body.reason).slice(0, 500) : null;
    if (!resellerId) return json({ error: "reseller_id é obrigatório" }, 400);

    const { data: r } = await admin.from("resellers").select("id, user_id, activation_status, display_name").eq("id", resellerId).maybeSingle();
    if (!r) return json({ error: "Revendedor não encontrado" }, 404);
    if (r.activation_status === "active") return json({ error: "Revendedor já está ativo" }, 400);

    // Ativa sem cobrança (payment_id NULL → não credita saldo)
    const { error: actErr } = await admin.rpc("activate_reseller", {
      _reseller_id: resellerId,
      _payment_id: null,
      _actor_id: userId,
    });
    if (actErr) return json({ error: actErr.message }, 500);

    await admin.from("activation_logs").insert({
      reseller_id: resellerId,
      event: "waived_by_manager",
      actor_id: userId,
      metadata: { reason },
    });

    if (r.user_id) {
      await admin.from("notifications").insert({
        user_id: r.user_id,
        title: "Painel ativado! 🎉",
        body: reason
          ? `Seu painel foi liberado como cortesia. Motivo: ${reason}`
          : "Seu painel foi liberado como cortesia pelo gerente.",
        type: "activation_approved",
      });
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal" }, 500);
  }
});