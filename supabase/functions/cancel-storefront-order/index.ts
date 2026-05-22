import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body?.order_id === "string" ? body.order_id : null;
    if (!orderId) return json({ error: "missing_order_id" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: order, error: oerr } = await admin
      .from("storefront_orders")
      .select("id, status, reseller_id, paid_at")
      .eq("id", orderId)
      .maybeSingle();

    if (oerr) return json({ error: oerr.message }, 500);
    if (!order) return json({ error: "order_not_found" }, 404);

    // Somente pode cancelar enquanto está pendente (PIX ainda não foi pago)
    if (order.status !== "pending" || order.paid_at) {
      return json(
        { error: "cannot_cancel", reason: "Pedido só pode ser cancelado antes do pagamento" },
        409,
      );
    }

    const { error: uerr } = await admin
      .from("storefront_orders")
      .update({
        status: "cancelado",
        error_message: "Cancelado pelo comprador/revendedor antes do pagamento",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("status", "pending"); // double-check atomic

    if (uerr) return json({ error: uerr.message }, 500);

    return json({ success: true });
  } catch (e: any) {
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});