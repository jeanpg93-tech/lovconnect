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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    // Carrega reseller e valida que é DEMO (proteção crítica)
    const { data: reseller } = await svc.from("resellers")
      .select("id, is_demo").eq("user_id", userId).maybeSingle();
    if (!reseller) return json({ error: "Revendedor não encontrado" }, 404);
    if (!(reseller as any).is_demo) {
      return json({ error: "Esta ação só está disponível em contas demo." }, 403);
    }

    const rid = reseller.id as string;
    const summary: Record<string, number> = {};
    const safeDel = async (table: string) => {
      const { count, error } = await svc.from(table as any)
        .delete({ count: "exact" }).eq("reseller_id", rid);
      summary[table] = error ? -1 : (count ?? 0);
    };

    // Limpa dados gerados pelo visitante (mantém o reseller + profile + balance reset)
    await safeDel("orders");
    await safeDel("storefront_orders");
    await safeDel("reseller_wallet_transactions");
    await safeDel("reseller_pack_balances");
    await safeDel("reseller_subscription_charges");
    await safeDel("blocked_sale_attempts");
    await safeDel("reseller_api_usage");
    await safeDel("reseller_extension_price_overrides");

    // Limpa clientes do revendedor (profiles)
    const { count: cliCount } = await svc.from("profiles")
      .delete({ count: "exact" }).eq("reseller_id", rid);
    summary["profiles_clientes"] = cliCount ?? 0;

    return json({ ok: true, demo: true, reseller_id: rid, deleted: summary });
  } catch (e: any) {
    console.error("reset-demo-account error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});