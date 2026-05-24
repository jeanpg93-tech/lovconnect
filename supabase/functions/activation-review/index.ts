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

    // Confirma gerente
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "gerente").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const paymentId = String(body.payment_id ?? "");
    const action = String(body.action ?? ""); // 'approve' | 'reject'
    const note = body.note ? String(body.note).slice(0, 500) : null;
    if (!paymentId || !["approve", "reject"].includes(action)) {
      return json({ error: "payment_id e action válidos são obrigatórios" }, 400);
    }

    const { data: payment } = await admin.from("activation_payments").select("*").eq("id", paymentId).maybeSingle();
    if (!payment) return json({ error: "Pagamento não encontrado" }, 404);

    if (action === "approve") {
      const { error: actErr } = await admin.rpc("activate_reseller", {
        _reseller_id: payment.reseller_id,
        _payment_id: paymentId,
        _actor_id: userId,
      });
      if (actErr) return json({ error: actErr.message }, 500);

      await admin.from("activation_payments").update({
        reviewer_id: userId,
        reviewer_note: note,
        reviewed_at: new Date().toISOString(),
        paid_at: payment.paid_at ?? new Date().toISOString(),
      }).eq("id", paymentId);

      await admin.from("activation_logs").insert({
        reseller_id: payment.reseller_id,
        event: "proof_approved",
        actor_id: userId,
        metadata: { payment_id: paymentId },
      });

      await admin.from("notifications").insert({
        user_id: (await admin.from("resellers").select("user_id").eq("id", payment.reseller_id).maybeSingle()).data?.user_id,
        title: "Painel ativado! 🎉",
        body: "Seu pagamento foi confirmado e seu painel de revendedor está totalmente liberado.",
        type: "activation_approved",
      });

      return json({ ok: true });
    } else {
      await admin.from("activation_payments").update({
        status: "rejected",
        reviewer_id: userId,
        reviewer_note: note,
        reviewed_at: new Date().toISOString(),
      }).eq("id", paymentId);

      await admin.from("resellers").update({
        activation_status: "payment_rejected",
        updated_at: new Date().toISOString(),
      }).eq("id", payment.reseller_id);

      await admin.from("activation_logs").insert({
        reseller_id: payment.reseller_id,
        event: "proof_rejected",
        actor_id: userId,
        metadata: { payment_id: paymentId, reason: note },
      });

      const rUid = (await admin.from("resellers").select("user_id").eq("id", payment.reseller_id).maybeSingle()).data?.user_id;
      await admin.from("notifications").insert({
        user_id: rUid,
        title: "Comprovante recusado",
        body: note ? `Motivo: ${note}` : "Seu comprovante foi recusado. Tente novamente via PIX.",
        type: "activation_rejected",
      });

      return json({ ok: true });
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "internal" }, 500);
  }
});