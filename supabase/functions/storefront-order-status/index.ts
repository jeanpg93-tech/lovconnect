import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-query-order-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const order_id =
      url.searchParams.get("order_id") ||
      req.headers.get("x-query-order-id") ||
      (req.method === "POST" ? (await req.json().catch(() => ({}))).order_id : null);
    if (!order_id) return json({ error: "order_id obrigatório" }, 400);

    const raw = String(order_id).trim();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cols =
      "id,short_code,status,license_key,price_cents,license_type,product_type,credit_amount,buyer_name,paid_at,error_message,invite_link";

    let order: any = null;

    if (UUID_RE.test(raw)) {
      const { data } = await admin
        .from("storefront_orders")
        .select(cols)
        .eq("id", raw)
        .maybeSingle();
      order = data;
    } else {
      const digits = raw.replace(/\D+/g, "");
      if (!digits) return json({ error: "ID inválido" }, 400);
      const { data } = await admin
        .from("storefront_orders")
        .select(cols)
        .eq("short_code", digits)
        .maybeSingle();
      order = data;
    }

    if (!order) return json({ error: "Pedido não encontrado" }, 404);
    return json({ order });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
