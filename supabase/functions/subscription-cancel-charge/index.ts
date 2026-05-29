import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isMgr } = await admin.rpc("has_role", { _user_id: userId, _role: "gerente" });
    if (!isMgr) return json({ error: "Apenas gerente" }, 403);

    const body = await req.json().catch(() => ({}));
    const chargeId = String(body.charge_id ?? "");
    if (!chargeId) return json({ error: "charge_id obrigatório" }, 400);

    const { data: charge } = await admin
      .from("reseller_subscription_charges")
      .select("*").eq("id", chargeId).maybeSingle();
    if (!charge) return json({ error: "Cobrança não encontrada" }, 404);
    if (charge.status === "paid") return json({ error: "Cobrança já paga" }, 400);

    await admin.from("reseller_subscription_charges").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    }).eq("id", chargeId);

    return json({ ok: true });
  } catch (e: any) {
    console.error("subscription-cancel-charge error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});