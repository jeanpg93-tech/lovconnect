// Público — devolve preços de venda dos planos Claude para um revendedor (pelo slug).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function computeSalePrice(cost: number, mode: string, value: number) {
  if (mode === "percent") return Math.max(0, Math.round((cost * (10000 + value)) / 10000));
  if (mode === "fixed_add") return Math.max(0, cost + value);
  return Math.max(0, value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") ?? "").toLowerCase();
    if (!slug) return json({ error: "slug_required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: reseller } = await admin
      .from("resellers")
      .select("id, slug, display_name, claude_enabled, is_active")
      .eq("slug", slug)
      .maybeSingle();
    if (!reseller || !(reseller as any).is_active || !(reseller as any).claude_enabled) {
      return json({ error: "reseller_not_available" }, 404);
    }

    const [{ data: defs }, { data: ovs }] = await Promise.all([
      admin.from("claude_plan_prices").select("plan_code, cost_cents, sale_price_cents").eq("is_active", true),
      admin.from("claude_reseller_price_overrides").select("plan_code, markup_mode, markup_value_cents").eq("reseller_id", (reseller as any).id).eq("is_active", true),
    ]);

    const prices: Record<string, number> = {};
    for (const d of (defs ?? []) as any[]) {
      const ov = (ovs ?? []).find((o: any) => o.plan_code === d.plan_code);
      let sale = d.sale_price_cents as number;
      if (ov) sale = computeSalePrice(d.cost_cents, (ov as any).markup_mode, (ov as any).markup_value_cents);
      prices[d.plan_code] = sale;
    }

    return json({
      ok: true,
      reseller: {
        id: (reseller as any).id,
        slug: (reseller as any).slug,
        display_name: (reseller as any).display_name,
      },
      prices,
    });
  } catch (e) {
    console.error("[claude-public-prices]", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});