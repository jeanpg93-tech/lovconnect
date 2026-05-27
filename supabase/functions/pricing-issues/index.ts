import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Method = "flow" | "lovax";
type PackId = "1d" | "7d" | "30d" | "90d" | "365d" | "lifetime";

const PACKS_BY_METHOD: Record<Method, { id: PackId; label: string }[]> = {
  flow: [
    { id: "1d", label: "1 dia" },
    { id: "7d", label: "7 dias" },
    { id: "30d", label: "30 dias" },
    { id: "lifetime", label: "Vitalício" },
  ],
  lovax: [
    { id: "1d", label: "1 dia" },
    { id: "7d", label: "7 dias" },
    { id: "30d", label: "30 dias" },
    { id: "90d", label: "90 dias" },
    { id: "365d", label: "365 dias" },
    { id: "lifetime", label: "Vitalício" },
  ],
};

type Reason = "cost_missing" | "sale_missing" | "sale_below_cost" | "margin_zero";
type Severity = "warning" | "critical";
type Issue = {
  kind: "license" | "credits";
  method?: Method;
  pack_id?: PackId;
  credits_amount?: number;
  label: string;
  cost_cents: number;
  sale_cents: number;
  severity: Severity;
  reason: Reason;
};

function classify(cost: number, sale: number): { severity: Severity; reason: Reason } | null {
  // cost desconhecido = aviso amarelo, bloqueia (revendedor perderia lucro)
  if (!cost || cost <= 0) return { severity: "warning", reason: "cost_missing" };
  // sem preço cadastrado = crítico vermelho
  if (!sale || sale <= 0) return { severity: "critical", reason: "sale_missing" };
  // prejuízo direto
  if (sale < cost) return { severity: "critical", reason: "sale_below_cost" };
  // margem zero = aviso amarelo, bloqueia (sem lucro)
  if (sale === cost) return { severity: "warning", reason: "margin_zero" };
  return null;
}

// Custo de licença vem 100% da tabela tier_license_prices.
// Mantida apenas como helper local para preencher o mapa abaixo.
function lookupLicenseCost(
  tlp: Map<string, number>,
  tierId: string | null,
  pack: PackId,
  ouroId: string | null,
): number {
  if (tierId) {
    const v = tlp.get(`${tierId}:${pack}`);
    if (v && v > 0) return v;
  }
  if (ouroId) return tlp.get(`${ouroId}:${pack}`) ?? 0;
  return 0;
}

async function resolveContext(svc: any, resellerId: string) {
  const [tierRes, tlpRes, salePricesRes, tiersRes, creditPlansRes, creditSalesRes] =
    await Promise.all([
      svc.rpc("get_reseller_tier", { _reseller_id: resellerId }),
      svc
        .from("tier_license_prices")
        .select("tier_id,duration_code,price_cents,is_active")
        .eq("is_active", true),
      svc
        .from("reseller_license_prices")
        .select("method,pack_id,price_cents")
        .eq("reseller_id", resellerId),
      svc
        .from("reseller_tiers")
        .select("id,name,slug,is_hidden,sort_order")
        .eq("is_active", true)
        .order("sort_order"),
      svc
        .from("credit_pricing_plans")
        .select("id,label,credits_amount,is_active")
        .eq("is_active", true)
        .order("credits_amount"),
      svc
        .from("reseller_credit_prices")
        .select("credits_amount,price_cents,is_active")
        .eq("reseller_id", resellerId),
    ]);

  const tier = (Array.isArray(tierRes.data) ? tierRes.data[0] : tierRes.data) ?? null;
  const allTiers = (tiersRes.data ?? []) as any[];
  const ouro =
    allTiers.find((t) => (t.slug || "").toLowerCase() === "ouro") ??
    allTiers.find((t) => (t.name || "").toLowerCase().includes("ouro"));
  const tlp = new Map<string, number>();
  ((tlpRes as any).data ?? []).forEach((r: any) => {
    tlp.set(`${r.tier_id}:${r.duration_code}`, Number(r.price_cents) || 0);
  });

  const licenseSale: Record<string, number> = {};
  (salePricesRes.data ?? []).forEach((r: any) => {
    licenseSale[`${r.method}:${r.pack_id}`] = Number(r.price_cents) || 0;
  });

  const creditPlans = (creditPlansRes.data ?? []) as Array<{ id: string; label: string; credits_amount: number }>;

  // Custo de cada plano via RPC
  const creditCosts: Record<number, number> = {};
  await Promise.all(
    creditPlans.map(async (p) => {
      const { data } = await svc.rpc("get_credit_pack_cost", {
        _reseller_id: resellerId,
        _plan_id: p.id,
      });
      creditCosts[p.credits_amount] = Number(data ?? 0) || 0;
    }),
  );

  const creditSale: Record<number, number> = {};
  (creditSalesRes.data ?? [])
    .filter((r: any) => r.is_active !== false)
    .forEach((r: any) => {
      creditSale[r.credits_amount] = Number(r.price_cents) || 0;
    });

  return { tier, tlp, ouroId: ouro?.id ?? null, licenseSale, creditPlans, creditCosts, creditSale };
}

function buildIssues(ctx: Awaited<ReturnType<typeof resolveContext>>): {
  issues: Issue[];
  blocked: Record<string, { severity: Severity; reason: Reason }>;
} {
  const issues: Issue[] = [];
  const blocked: Record<string, { severity: Severity; reason: Reason }> = {};

  // Licenças — só reporta itens que têm preço cadastrado OU custo definido
  // (revendedor pode legitimamente não vender alguns packs)
  for (const method of ["flow", "lovax"] as Method[]) {
    for (const pack of PACKS_BY_METHOD[method]) {
      const saleKey = `${method}:${pack.id}`;
      const sale = ctx.licenseSale[saleKey] ?? 0;
      const cost = lookupLicenseCost(ctx.tlp, ctx.tier?.id ?? null, pack.id, ctx.ouroId);
      // Reporta apenas se o revendedor tentou vender (tem preço cadastrado)
      // OU se o gerente definiu custo (revendedor poderia vender mas falta o sale)
      if (sale <= 0) continue; // sem preço cadastrado = não vende, ok
      const c = classify(cost, sale);
      if (c) {
        const issue: Issue = {
          kind: "license",
          method,
          pack_id: pack.id,
          label: `${method === "flow" ? "PromptFlow" : "LovaX"} ${pack.label}`,
          cost_cents: cost,
          sale_cents: sale,
          severity: c.severity,
          reason: c.reason,
        };
        issues.push(issue);
        blocked[`license:${saleKey}`] = c;
      }
    }
  }

  // Créditos — só reporta itens cadastrados
  for (const plan of ctx.creditPlans) {
    const sale = ctx.creditSale[plan.credits_amount] ?? 0;
    if (sale <= 0) continue;
    const cost = ctx.creditCosts[plan.credits_amount] ?? 0;
    const c = classify(cost, sale);
    if (c) {
      const issue: Issue = {
        kind: "credits",
        credits_amount: plan.credits_amount,
        label: plan.label || `${plan.credits_amount} créditos`,
        cost_cents: cost,
        sale_cents: sale,
        severity: c.severity,
        reason: c.reason,
      };
      issues.push(issue);
      blocked[`credits:${plan.credits_amount}`] = c;
    }
  }

  return { issues, blocked };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const svc = createClient(supabaseUrl, svcKey);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: userData, error: userErr } = await svc.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    // Manager scan: agrega problemas de todos os revendedores ativos
    if (body.scan === "all") {
      const { data: roleData } = await svc
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "gerente")
        .maybeSingle();
      if (!roleData) return json({ error: "forbidden" }, 403);

      const { data: resellers } = await svc
        .from("resellers")
        .select("id,display_name,slug")
        .eq("is_active", true)
        .order("display_name");

      const list = resellers ?? [];
      const results = await Promise.all(
        list.map(async (r: any) => {
          try {
            const ctx = await resolveContext(svc, r.id);
            const { issues } = buildIssues(ctx);
            if (issues.length === 0) return null;
            return {
              reseller_id: r.id,
              display_name: r.display_name,
              slug: r.slug,
              issues,
              has_critical: issues.some((i) => i.severity === "critical"),
              has_warning: issues.some((i) => i.severity === "warning"),
            };
          } catch {
            return null;
          }
        }),
      );
      const filtered = results.filter(Boolean) as any[];
      return json({
        scope: "all",
        resellers: filtered,
        total_resellers_with_issues: filtered.length,
        has_critical: filtered.some((r) => r.has_critical),
        has_warning: filtered.some((r) => r.has_warning),
      });
    }

    // Determine target reseller
    let resellerId: string | null = null;
    if (body.reseller_id) {
      // só gerente pode consultar outro reseller
      const { data: roleData } = await svc
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "gerente")
        .maybeSingle();
      if (!roleData) return json({ error: "forbidden" }, 403);
      resellerId = String(body.reseller_id);
    } else {
      const { data: r } = await svc
        .from("resellers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      resellerId = r?.id ?? null;
    }
    if (!resellerId) return json({ issues: [], blocked: {}, has_blocking: false, has_critical: false });

    const ctx = await resolveContext(svc, resellerId);
    const { issues, blocked } = buildIssues(ctx);

    return json({
      issues,
      blocked,
      has_blocking: issues.length > 0,
      has_critical: issues.some((i) => i.severity === "critical"),
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? "internal" }, 500);
  }
});

// Helper exportado para reuso em outras edge functions via cópia
export { resolveContext, buildIssues, classify, computeLicenseCost };