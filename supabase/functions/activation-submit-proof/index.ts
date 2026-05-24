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

    const body = await req.json().catch(() => ({}));
    const proofPath = String(body.proof_path ?? "");
    const note = body.note ? String(body.note).slice(0, 500) : null;
    if (!proofPath) return json({ error: "proof_path obrigatório" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: reseller } = await admin.from("resellers").select("id, activation_status").eq("user_id", userId).maybeSingle();
    if (!reseller) return json({ error: "Revendedor não encontrado" }, 403);
    if (reseller.activation_status === "active") return json({ error: "Já ativo" }, 400);

    // Encontra (ou cria) pagamento pendente
    let { data: payment } = await admin
      .from("activation_payments")
      .select("*")
      .eq("reseller_id", reseller.id)
      .in("status", ["pending", "rejected", "expired"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment) {
      const { data: created } = await admin.from("activation_payments").insert({
        reseller_id: reseller.id,
        amount_cents: 20000,
        status: "under_review",
        provider: "manual",
      }).select().single();
      payment = created;
    } else {
      await admin.from("activation_payments").update({
        status: "under_review",
        proof_url: proofPath,
        proof_note: note,
        updated_at: new Date().toISOString(),
      }).eq("id", payment.id);
    }

    await admin.from("resellers").update({ activation_status: "payment_under_review", updated_at: new Date().toISOString() }).eq("id", reseller.id);

    await admin.from("activation_logs").insert({
      reseller_id: reseller.id,
      event: "proof_uploaded",
      actor_id: userId,
      metadata: { payment_id: payment!.id, proof_path: proofPath },
    });

    return json({ ok: true, payment_id: payment!.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal" }, 500);
  }
});