// Lista os pacotes (license_packs) disponíveis ao revendedor, filtrando
// silenciosamente aqueles cujo tamanho excede o estoque real do provedor
// (estoque total das duas APIs menos créditos já comprometidos em packs).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const safeJson = async (r: Response) => { try { return await r.json(); } catch { return null; } };

const PROVIDER_DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";
const LOVAX_DEFAULT_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";

async function getFlowRemaining(admin: any): Promise<number> {
  try {
    const { data: cfg } = await admin
      .from("provider_settings")
      .select("api_key, base_url")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const apiKey = cfg?.api_key ?? Deno.env.get("EXTENSION_PROVIDER_API_KEY") ?? "";
    const base = cfg?.base_url ?? PROVIDER_DEFAULT_BASE;
    if (!apiKey) return 0;
    const r = await fetch(`${base}/status`, {
      method: "POST",
      headers: { "x-api-token": apiKey, "x-api-key": apiKey, "Content-Type": "application/json" },
    });
    if (!r.ok) return 0;
    const data: any = await safeJson(r);
    const used = Number(data?.used ?? 0);
    const max = Number(data?.max ?? data?.limit ?? 0);
    if (!max || max <= 0) return Number.POSITIVE_INFINITY; // sem limite
    return Math.max(0, max - used);
  } catch {
    return 0;
  }
}

async function getLovaxRemaining(admin: any): Promise<number> {
  try {
    const { data } = await admin
      .from("app_settings").select("key, value").in("key", ["lovax_api_token", "lovax_base_url"]);
    const apiKey = (data?.find((r: any) => r.key === "lovax_api_token") as any)?.value;
    const base = ((data?.find((r: any) => r.key === "lovax_base_url") as any)?.value) || LOVAX_DEFAULT_BASE;
    if (!apiKey) return 0;
    const r = await fetch(base, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "balance", payload: {} }),
    });
    if (!r.ok) return 0;
    const d: any = await safeJson(r);
    if (!d?.success) return 0;
    const b = d.balance;
    if (b && typeof b === "object") {
      const avail = Number(b.keys_available ?? 0);
      return Math.max(0, avail);
    }
    if (typeof b === "number") return Math.max(0, b);
    return 0;
  } catch {
    return 0;
  }
}

export async function computeRealAvailable(admin: any): Promise<{ flow: number; lovax: number; total: number; committed: number; realAvailable: number }> {
  const [flow, lovax, commitRes] = await Promise.all([
    getFlowRemaining(admin),
    getLovaxRemaining(admin),
    admin.rpc("get_pack_commitments"),
  ]);
  const committedRow = Array.isArray(commitRes?.data) ? commitRes.data[0] : commitRes?.data;
  const committed = Number(committedRow?.committed_credits ?? 0);
  const total = flow + lovax;
  const realAvailable = Number.isFinite(total) ? Math.max(0, total - committed) : Number.POSITIVE_INFINITY;
  return { flow, lovax, total, committed, realAvailable };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    // Permite tanto gerente quanto revendedor
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roleSet = new Set(((roles as any[]) ?? []).map((r) => r.role));
    if (!roleSet.has("gerente") && !roleSet.has("revendedor")) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: packsRaw } = await admin
      .from("license_packs")
      .select("id, name, credits, price_cents, is_active, sort_order, description, icon")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("credits", { ascending: true });

    const stock = await computeRealAvailable(admin);

    const all = (packsRaw ?? []) as any[];
    const available = all.filter((p) => Number(p.credits ?? 0) <= stock.realAvailable);

    return json({
      packs: available,
      stock,
    });
  } catch (e: any) {
    console.error("list-available-packs error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});