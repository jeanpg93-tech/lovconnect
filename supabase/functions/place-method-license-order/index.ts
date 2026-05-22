import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "jsr:@supabase/supabase-js@2/cors";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ALLOWED_METHODS = ["flow", "lovax"];
const ALLOWED_PACKS = ["1d", "7d", "30d", "90d", "365d", "lifetime"];

const onlyDigits = (s: string) => (s ?? "").toString().replace(/\D+/g, "");

const genKey = (method: string, pack: string) => {
  const rnd = crypto.randomUUID().replace(/-/g, "").toUpperCase().slice(0, 16);
  return `${method.toUpperCase()}-${pack.toUpperCase()}-${rnd}`;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const method = String(body.method ?? "").toLowerCase();
    const pack_id = String(body.pack_id ?? "").toLowerCase();
    const display_name = String(body.display_name ?? "").trim();
    const whatsapp = onlyDigits(body.whatsapp ?? "");
    const client_id = body.client_id ? String(body.client_id) : null;

    if (!ALLOWED_METHODS.includes(method)) return json({ error: "Método inválido" }, 400);
    if (!ALLOWED_PACKS.includes(pack_id)) return json({ error: "Pacote inválido" }, 400);
    if (display_name.length < 2) return json({ error: "Nome obrigatório" }, 400);
    if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 13)) {
      return json({ error: "WhatsApp inválido" }, 400);
    }

    const { data: reseller } = await svc
      .from("resellers").select("id").eq("user_id", userId).maybeSingle();
    if (!reseller) return json({ error: "Revendedor não encontrado" }, 404);
    const reseller_id = reseller.id as string;

    const { data: tierData } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller_id });
    const tier = Array.isArray(tierData) ? tierData[0] : tierData;
    if (!tier?.id) return json({ error: "Nível não definido" }, 400);

    // Cascata: override individual -> licencas.valores[tier] -> fallback Partner→Ouro -> método irmão
    const [{ data: setting }, { data: ovRow }, { data: tiersAll }] = await Promise.all([
      svc.from("app_settings").select("value").eq("key", "licencas.valores").maybeSingle(),
      svc.from("reseller_license_cost_overrides")
        .select("price_cents,is_active")
        .eq("reseller_id", reseller_id)
        .eq("pack_id", pack_id)
        .eq("is_active", true)
        .maybeSingle(),
      svc.from("reseller_tiers").select("id,slug,name,is_hidden").eq("is_active", true),
    ]);
    const valores = (setting?.value ?? {}) as Record<string, any>;
    const otherMethod = method === "flow" ? "lovax" : "flow";
    const ouro = (tiersAll ?? []).find((t: any) => (t.slug || "").toLowerCase() === "ouro")
      ?? (tiersAll ?? []).find((t: any) => (t.name || "").toLowerCase().includes("ouro"));
    let price_cents = 0;
    if (ovRow?.price_cents && ovRow.price_cents > 0) {
      price_cents = Number(ovRow.price_cents);
    } else {
      const b1 = Number(valores?.[method]?.[pack_id]?.[tier.id] ?? 0);
      const b2 = b1 > 0 ? 0 : Number(valores?.[otherMethod]?.[pack_id]?.[tier.id] ?? 0);
      let brl = b1 > 0 ? b1 : b2;
      if (brl <= 0 && tier.is_hidden && ouro?.id) {
        const o1 = Number(valores?.[method]?.[pack_id]?.[ouro.id] ?? 0);
        const o2 = o1 > 0 ? 0 : Number(valores?.[otherMethod]?.[pack_id]?.[ouro.id] ?? 0);
        brl = o1 > 0 ? o1 : o2;
      }
      price_cents = Math.round(brl * 100);
    }
    if (!price_cents || price_cents <= 0) {
      return json({ error: "Preço não definido para esse pacote no seu nível" }, 400);
    }

    if (client_id) {
      const { data: prof } = await svc
        .from("profiles").select("id,reseller_id").eq("id", client_id).maybeSingle();
      if (!prof || prof.reseller_id !== reseller_id) {
        return json({ error: "Cliente inválido" }, 400);
      }
    }

    const { data: debitOk, error: debitErr } = await svc.rpc("debit_reseller_balance", {
      _reseller_id: reseller_id,
      _amount_cents: price_cents,
      _kind: "license_purchase",
      _description: `Licença ${method.toUpperCase()} ${pack_id}`,
      _reference_id: null,
    });
    if (debitErr) return json({ error: debitErr.message }, 500);
    if (debitOk === false) return json({ error: "Saldo insuficiente" }, 402);

    const license_key = genKey(method, pack_id);
    const license_type = `${method}_${pack_id}`;

    const notesObj = { method, pack_id, display_name, whatsapp: whatsapp || null };

    const { data: order, error: orderErr } = await svc
      .from("orders")
      .insert({
        reseller_id,
        client_id,
        license_type,
        price_cents,
        status: "completed",
        license_key,
        product_type: "extension",
        notes: JSON.stringify(notesObj),
      })
      .select("id")
      .single();

    if (orderErr) {
      // tentar estornar
      await svc.rpc("credit_reseller_balance", {
        _reseller_id: reseller_id,
        _amount_cents: price_cents,
        _kind: "refund",
        _description: `Estorno falha gerar licença ${method}/${pack_id}`,
        _reference_id: null,
      });
      return json({ error: orderErr.message }, 500);
    }

    return json({
      ok: true,
      order_id: order.id,
      license_key,
      method,
      pack_id,
      price_cents,
      display_name,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro interno" }, 500);
  }
});