import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) return json({ costs: {} });

  const svc = createClient(supabaseUrl, serviceRoleKey);
  const token = authHeader.replace("Bearer ", "").trim();
  const { data: authData, error: authError } = await svc.auth.getUser(token);
  if (authError || !authData.user) return json({ costs: {} });

  const userId = authData.user.id;
  const { data: reseller } = await svc
    .from("resellers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!reseller) return json({ costs: {} });

  const [tierRes, tierStateRes, tiersRes, plansRes] = await Promise.all([
    svc.rpc("get_reseller_tier", { _reseller_id: reseller.id }),
    svc.from("reseller_tier_state").select("total_spent_cents").eq("reseller_id", reseller.id).maybeSingle(),
    svc
      .from("reseller_tiers")
      .select("id,name,is_hidden,min_spent_cents,sort_order,discount_percent")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    svc
      .from("credit_pricing_plans")
      .select("id,credits_amount")
      .eq("is_active", true),
  ]);

  const currentTier = (Array.isArray(tierRes.data) ? tierRes.data[0] : tierRes.data) as
    | { id: string; name?: string; is_hidden: boolean }
    | null;
  const allTiers = (tiersRes.data ?? []) as Array<{
    id: string;
    name: string;
    is_hidden: boolean;
    min_spent_cents: number;
    sort_order: number;
    discount_percent?: number;
  }>;
  const visibleTiers = allTiers.filter((t) => !t.is_hidden);
  const totalSpent = Number(tierStateRes.data?.total_spent_cents ?? 0);

  const equivalentVisibleTier = [...visibleTiers]
    .filter((tier) => tier.min_spent_cents <= totalSpent)
    .sort((a, b) => a.min_spent_cents - b.min_spent_cents)
    .at(-1);

  // Para CRÉDITOS: se o nível for "Partner", usa preços do nível "Ouro" como fallback
  // (mesma regra usada na tela /painel/gerente/partners).
  // Overrides individuais em reseller_credit_prices continuam tendo prioridade no front.
  const isPartner = (currentTier?.name ?? "").toLowerCase().includes("partner");
  const ouroTier =
    allTiers.find((t) => t.name.toLowerCase() === "ouro") ??
    allTiers.find((t) => t.name.toLowerCase().includes("ouro")) ??
    allTiers.find((t) => t.name.toLowerCase().includes("black"));

  let effectiveTierId: string | null;
  if (isPartner && ouroTier) {
    effectiveTierId = ouroTier.id;
  } else if (currentTier?.is_hidden) {
    effectiveTierId = equivalentVisibleTier?.id ?? visibleTiers[0]?.id ?? null;
  } else {
    effectiveTierId = currentTier?.id ?? equivalentVisibleTier?.id ?? visibleTiers[0]?.id ?? null;
  }

  if (!effectiveTierId) return json({ costs: {} });

  const { data: tierPrices } = await svc
    .from("tier_credit_prices")
    .select("plan_id,price_cents")
    .eq("tier_id", effectiveTierId)
    .eq("is_active", true);

  const planById = new Map((plansRes.data ?? []).map((plan: { id: string; credits_amount: number }) => [plan.id, plan.credits_amount]));
  const costs: Record<number, number> = {};

  (tierPrices ?? []).forEach((row: { plan_id: string; price_cents: number }) => {
    const credits = planById.get(row.plan_id);
    if (credits != null) costs[credits] = Number(row.price_cents ?? 0);
  });

  const effectiveTier = allTiers.find((tier) => tier.id === effectiveTierId) ?? null;

  return json({
    costs,
    tierName: currentTier?.name ?? effectiveTier?.name ?? null,
    effectiveTierId,
    effectiveTierName: effectiveTier?.name ?? currentTier?.name ?? null,
  });
});