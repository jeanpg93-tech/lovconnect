// Público — polling do status de um claude_orders pelo ID.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "invalid_order_id" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data } = await admin
      .from("claude_orders")
      .select("id, status, plan_code, sale_price_cents, pix_expires_at, paid_at, code_revealed_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!data) return json({ error: "not_found" }, 404);

    return json({
      ok: true,
      status: (data as any).status,
      plan_code: (data as any).plan_code,
      sale_price_cents: (data as any).sale_price_cents,
      pix_expires_at: (data as any).pix_expires_at,
      paid_at: (data as any).paid_at,
      issued: (data as any).status === "issued",
    });
  } catch (e) {
    console.error("[claude-public-order-status]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});