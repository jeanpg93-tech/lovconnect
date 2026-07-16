import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { maintenanceGuard } from "../_shared/maintenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BASE = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    {
      const _maintClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const _maintResp = await maintenanceGuard(_maintClient, corsHeaders);
      if (_maintResp) return _maintResp;
    }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const reseller_slug = String(body.reseller_slug ?? "").trim();
    const buyer_name = typeof body.buyer_name === "string" ? body.buyer_name.trim().slice(0, 100) : "";
    const whatsapp_raw = typeof body.buyer_whatsapp === "string" ? body.buyer_whatsapp : "";
    const buyer_whatsapp = whatsapp_raw.replace(/\D+/g, "").slice(0, 15);
    const rawIp = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim())
      || req.headers.get("x-real-ip")
      || "0.0.0.0";
    const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;
    const IPV6_RE = /^[0-9a-fA-F:]{2,45}$/;
    const ip = (IPV4_RE.test(rawIp) || IPV6_RE.test(rawIp)) ? rawIp : "0.0.0.0";

    if (!reseller_slug) return json({ error: "Loja inválida" }, 400);
    if (buyer_name.length < 2) return json({ error: "Informe seu nome" }, 400);
    if (!buyer_whatsapp) {
      return json({ error: "Informe seu WhatsApp (DDD + número)" }, 400);
    }
    if (buyer_whatsapp.length < 10 || buyer_whatsapp.length > 13) {
      return json({ error: "WhatsApp inválido (informe DDD + número)" }, 400);
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reseller } = await svc
      .from("resellers")
      .select("id, is_active, test_keys_per_day_override, activation_status")
      .eq("slug", reseller_slug)
      .maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "Loja indisponível" }, 404);
    if (reseller.activation_status && reseller.activation_status !== "active") {
      return json({ error: "Loja indisponível" }, 404);
    }

    const { data: store } = await svc
      .from("reseller_storefronts")
      .select("is_enabled, show_free_trial, extension_method")
      .eq("reseller_id", reseller.id)
      .maybeSingle();
    if (!store || !store.is_enabled) return json({ error: "Loja desativada" }, 404);
    if (!store.show_free_trial) return json({ error: "Chave teste indisponível nesta loja" }, 403);

    // Lovax é o único método ativo. Flow descontinuado.
    const method: "lovax" = "lovax";
    {
      const { data: deliverySettings } = await svc
        .from("app_settings")
        .select("key,value")
        .in("key", ["licencas.delivery.maintenance"]);
      const maintenanceVal = deliverySettings?.find((r: any) => r.key === "licencas.delivery.maintenance")?.value as any;
      if (maintenanceVal?.enabled === true) {
        return json({ error: "Geração de chaves temporariamente em manutenção. Tente novamente em alguns minutos." }, 503);
      }
    }

    // Limite diário: override específico do revendedor ou tier padrão
    let dailyLimit = 10;
    if (reseller.test_keys_per_day_override != null) {
      dailyLimit = Number(reseller.test_keys_per_day_override);
    } else {
      const { data: tierRows } = await svc.rpc("get_reseller_tier", { _reseller_id: reseller.id });
      const tier = Array.isArray(tierRows) ? tierRows[0] : tierRows;
      dailyLimit = Number(tier?.test_keys_per_day ?? 10);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await svc
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("reseller_id", reseller.id)
      .eq("is_test", true)
      .gte("created_at", since);
    if ((count ?? 0) >= dailyLimit) {
      return json({
        error: "Limite diário de chaves teste atingido. Tente novamente em algumas horas.",
      }, 429);
    }

    // Anti-abuso: 1 chave teste por telefone OU IP a cada 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const orFilter: string[] = [`ip_address.eq.${ip}`];
    if (buyer_whatsapp) orFilter.push(`phone.eq.${buyer_whatsapp}`);
    const { data: dup } = await svc
      .from("trial_registrations")
      .select("id")
      .or(orFilter.join(","))
      .gte("created_at", since24h)
      .limit(1)
      .maybeSingle();
    if (dup) {
      return json({
        error: "Você já gerou uma chave teste nas últimas 24h. Tente novamente mais tarde.",
      }, 429);
    }

    // upsert do contato (se whatsapp informado)
    let customer_id: string | null = null;
    let final_display_name = buyer_name;
    if (buyer_whatsapp) {
      const { data: existing } = await svc
        .from("reseller_customers")
        .select("id, display_name")
        .eq("reseller_id", reseller.id)
        .eq("whatsapp", buyer_whatsapp)
        .maybeSingle();
      if (existing) {
        customer_id = existing.id;
        final_display_name = existing.display_name;
      } else {
        const { data: created } = await svc
          .from("reseller_customers")
          .insert({ reseller_id: reseller.id, whatsapp: buyer_whatsapp, display_name: buyer_name })
          .select("id, display_name")
          .single();
        if (created) {
          customer_id = created.id;
          final_display_name = created.display_name;
        }
      }
    }

    // cria pedido
    const { data: order, error: ordErr } = await svc.from("orders").insert({
      reseller_id: reseller.id,
      customer_id,
      license_type: "trial",
      price_cents: 0,
      status: "pending",
      is_test: true,
    }).select().single();
    if (ordErr || !order) return json({ error: "Falha ao criar pedido" }, 500);

    // chama provedor Lovax (único ativo)
    let providerData: any = null;
    let license_key: string | null = null;
    try {
      {
        const { data: settings } = await svc
          .from("app_settings")
          .select("key, value")
          .in("key", ["lovax_api_token", "lovax_base_url"]);
        const tk = settings?.find((r: any) => r.key === "lovax_api_token")?.value as string | undefined;
        const bs = (settings?.find((r: any) => r.key === "lovax_base_url")?.value as string | undefined)
          || "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";
        if (!tk) {
          await svc.from("orders").update({ status: "failed", error_message: "MétodoLovax não configurado" }).eq("id", order.id);
          return json({ error: "MétodoLovax não configurado pelo gerente" }, 500);
        }
        const trialName = (final_display_name && final_display_name.length >= 2) ? final_display_name : "Cliente Teste";
        const r = await fetch(bs, {
          method: "POST",
          headers: { Authorization: `Bearer ${tk}`, "x-api-key": tk, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_trial",
            payload: { customer_name: trialName, minutes: 15, max_devices: 1 },
          }),
        });
        const text = await r.text();
        try { providerData = JSON.parse(text); } catch { providerData = { raw: text }; }
        if (!r.ok || !providerData?.success) {
          await svc.from("orders").update({
            status: "failed",
            error_message: providerData?.error ?? `Lovax retornou ${r.status}`,
            provider_response: providerData,
          }).eq("id", order.id);
          return json({ error: "Falha no MétodoLovax", details: providerData }, 502);
        }
        license_key = providerData?.license?.license_key ?? providerData?.license_key ?? providerData?.key ?? null;
      }
    } catch (e) {
      await svc.from("orders").update({
        status: "failed",
        error_message: e instanceof Error ? e.message : "Erro no provedor",
      }).eq("id", order.id);
      return json({ error: "Erro ao chamar provedor" }, 502);
    }

    await svc.from("orders").update({
      status: "completed",
      license_key,
      provider_response: providerData,
    }).eq("id", order.id);

    // Notifica gerente no Telegram
    try {
      const { data: resellerInfo } = await svc
        .from("resellers")
        .select("display_name, slug")
        .eq("id", reseller.id)
        .maybeSingle();
      const resellerLabel = resellerInfo?.display_name || resellerInfo?.slug || reseller_slug;
      const txt =
        `🧩 <b>Teste de Extensão (Loja pública)</b>\n` +
        `🏪 Revendedor: ${resellerLabel}\n` +
        `👤 Cliente: ${final_display_name}` +
        (buyer_whatsapp ? ` (${buyer_whatsapp})` : '') +
        (license_key ? `\n🔑 Chave: <code>${license_key}</code>` : '') +
        `\n⏱ 15 min · 1 dispositivo\n` +
        `📦 Produto: Extensão (chave de licença)`;
      await svc.rpc('telegram_enqueue', { _text: txt });
    } catch (e) {
      console.warn('telegram_enqueue (storefront trial) failed', e);
    }

    // registra para rate-limit por telefone/IP
    if (license_key) {
      await svc.from("trial_registrations").insert({
        name: final_display_name,
        phone: buyer_whatsapp || "",
        ip_address: ip,
        license_key,
      });
    }

    return json({
      ok: true,
      order_id: order.id,
      status: "completed",
      license_key,
      display_name: final_display_name,
    });
  } catch (e) {
    console.error("[storefront-create-trial]", e);
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
