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
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supaUrl, serviceKey);

    // Authorize: caller must be a gerente
    if (token !== serviceKey) {
      const userClient = createClient(supaUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isG } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "gerente" });
      if (!isG) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const displayName = body.display_name ? String(body.display_name) : email;
    if (!email || !password) return json({ error: "email and password required" }, 400);
    if (password.length < 6) return json({ error: "password must be at least 6 chars" }, 400);

    // Use any active affiliate code so handle_new_user trigger accepts the signup
    const { data: affRow } = await admin
      .from("affiliate_codes")
      .select("code")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const affCode = (affRow as any)?.code ?? null;
    if (!affCode) return json({ error: "no active affiliate code available" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { affiliate_code: affCode, display_name: displayName },
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "create failed" }, 400);
    const userId = created.user.id;

    // Profile created by trigger as pending — promote to approved and clear onboarding gates
    await admin.from("profiles").update({
      display_name: displayName,
      whatsapp: "00000000000",
      must_change_password: false,
      approval_status: "approved",
    }).eq("id", userId);

    await admin.from("user_roles").upsert(
      { user_id: userId, role: "revendedor" },
      { onConflict: "user_id,role" },
    );

    const slugBase = ("demo-" + email.split("@")[0]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "demo";
    let slug = slugBase;
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await admin.from("resellers").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const { data: reseller, error: rErr } = await admin.from("resellers").insert({
      user_id: userId,
      display_name: displayName,
      slug,
      is_active: true,
      activation_status: "active",
      billing_mode: "normal",
      subscription_onboarding_completed: true,
      subscription_blocked: false,
      is_demo: true,
    } as any).select("id").single();
    if (rErr) return json({ error: rErr.message, user_id: userId }, 400);

    // Give a starter balance so demo can simulate purchases
    await admin.rpc("credit_reseller_balance", {
      _reseller_id: reseller.id,
      _amount_cents: 25000,
      _kind: "manual_credit",
      _description: "Saldo inicial — conta demo",
      _reference_id: null,
    });

    // ============ FASE 3 — DADOS-SEED ============
    try {
      await seedDemoData(admin, reseller.id as string, slug);
    } catch (seedErr) {
      console.error("[admin-create-demo-account] seed failed", seedErr);
      // não falha a criação se o seed der erro
    }

    return json({ ok: true, user_id: userId, reseller_id: reseller.id, slug, email, password });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

// ===================== SEED HELPERS =====================

const BR_FIRST = ["João", "Maria", "Carlos", "Ana", "Pedro", "Juliana", "Lucas", "Mariana", "Rafael", "Fernanda", "Bruno", "Camila", "Diego", "Larissa", "Gabriel"];
const BR_LAST  = ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Lima", "Araújo", "Ferreira", "Carvalho", "Gomes"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rndName() { return `${pick(BR_FIRST)} ${pick(BR_LAST)} (Demo)`; }
function rndWpp() {
  const ddd = String(Math.floor(Math.random() * 80) + 11);
  return `55${ddd}9${String(Math.floor(Math.random() * 100000000)).padStart(8, "0")}`;
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString();
}
function genDemoKey() {
  return `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

async function seedDemoData(admin: any, resellerId: string, slug: string) {
  // ---- Storefront ----
  const { data: ext } = await admin.from("extensions")
    .select("id").eq("is_active", true).limit(1).maybeSingle();
  const extId = (ext as any)?.id ?? null;

  await admin.from("reseller_storefronts").insert({
    reseller_id: resellerId,
    is_enabled: true,
    store_name: "Loja Demo",
    tagline: "Vitrine de demonstração — explore à vontade!",
    welcome_message: "Bem-vindo! Esta é uma loja de exemplo da nossa conta demo.",
    contact_whatsapp: "5511999990000",
    primary_color: "#7c3aed",
    visible_extension_ids: extId ? [extId] : [],
    show_credits: true,
    show_extensions: true,
    show_free_trial: true,
    show_products: true,
  });

  // (clientes em profiles exigem auth.users — pulamos no seed; demo pode criar à vontade depois)

  // ---- 15 chaves (orders) ----
  const licTypes = ["flow_pro_7d", "flow_pro_15d", "flow_pro_30d", "flow_lifetime", "flow_pro_1d"];
  const licPrices: Record<string, number> = {
    flow_pro_1d: 500, flow_pro_7d: 1500, flow_pro_15d: 2500,
    flow_pro_30d: 4000, flow_lifetime: 12000,
  };
  const orderRows: any[] = [];
  for (let i = 0; i < 15; i++) {
    const t = pick(licTypes);
    const status = i < 11 ? "completed" : i < 13 ? "revoked" : "completed";
    const createdAt = daysAgoIso(Math.floor(Math.random() * 30));
    orderRows.push({
      reseller_id: resellerId,
      extension_id: extId,
      license_type: t,
      price_cents: licPrices[t],
      status,
      license_key: genDemoKey(),
      notes: JSON.stringify({ demo: true, display_name: rndName(), whatsapp: rndWpp() }),
      created_at: createdAt,
      updated_at: createdAt,
      key_revoked_at: status === "revoked" ? daysAgoIso(Math.floor(Math.random() * 5)) : null,
    });
  }
  await admin.from("orders").insert(orderRows);

  // ---- 10 vendas na loja (storefront_orders) ----
  const storeRows: any[] = [];
  for (let i = 0; i < 10; i++) {
    const t = pick(licTypes);
    const createdAt = daysAgoIso(Math.floor(Math.random() * 30));
    storeRows.push({
      reseller_id: resellerId,
      extension_id: extId,
      license_type: t,
      buyer_name: rndName(),
      buyer_whatsapp: rndWpp(),
      price_cents: licPrices[t] * 2, // margem de venda
      status: "paid",
      provider: "demo",
      provider_transaction_id: `DEMO-${crypto.randomUUID().slice(0, 8)}`,
      license_key: genDemoKey(),
      created_at: createdAt,
      updated_at: createdAt,
    });
  }
  await admin.from("storefront_orders").insert(storeRows);

  // ---- 5 transações de carteira adicionais ----
  // (o saldo inicial de R$250 já gerou 1; adicionamos 4 para totalizar 5)
  await admin.rpc("credit_reseller_balance", {
    _reseller_id: resellerId, _amount_cents: 10000,
    _kind: "recharge", _description: "Recarga demo via PIX",
    _reference_id: null,
  });
  await admin.rpc("credit_reseller_balance", {
    _reseller_id: resellerId, _amount_cents: 5000,
    _kind: "recharge", _description: "Recarga demo via PIX",
    _reference_id: null,
  });
  // Débitos diretos via insert (não há rpc de debit pública aqui)
  await admin.from("balance_transactions").insert([
    {
      reseller_id: resellerId, amount_cents: -1500,
      kind: "order_debit", description: "Geração de chave PRO 7d (demo)",
      created_at: daysAgoIso(2),
    },
    {
      reseller_id: resellerId, amount_cents: -2500,
      kind: "order_debit", description: "Geração de chave PRO 15d (demo)",
      created_at: daysAgoIso(5),
    },
  ]);
}