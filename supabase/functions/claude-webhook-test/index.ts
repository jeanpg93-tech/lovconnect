import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ success: false, error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const svc = createClient(url, svcKey);

  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ success: false, error: "unauthorized" }, 401);

  const { data: reseller } = await svc.from("resellers").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!reseller) return json({ success: false, error: "reseller_not_found" }, 403);

  const { data: cfg } = await svc
    .from("reseller_claude_api_keys")
    .select("webhook_url, webhook_secret")
    .eq("reseller_id", reseller.id)
    .eq("is_active", true)
    .not("webhook_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cfg?.webhook_url) return json({ success: false, reason: "no_webhook_configured" }, 400);

  const body = JSON.stringify({
    event: "claude.webhook.test",
    pedido_id: "test-" + crypto.randomUUID(),
    plano: "5x_30d",
    preco_centavos: 14900,
    codigo: "TEST-XXXXX-XXXXX",
    provider_key_id: "test_prov_key",
    id_cliente: "teste@exemplo.com",
    sent_at: new Date().toISOString(),
  });
  const sig = cfg.webhook_secret ? `sha256=${await hmacSha256Hex(cfg.webhook_secret, body)}` : "";

  try {
    const r = await fetch(cfg.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LovConnect-Webhook/1.0",
        ...(sig ? { "X-Signature": sig } : {}),
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    const respBody = (await r.text().catch(() => "")).slice(0, 400);
    let hint: string | null = null;
    if (r.status === 401) {
      hint =
        "A sua função retornou 401 (JWT obrigatório). No projeto Supabase da sua loja, adicione no supabase/config.toml:\n\n[functions.claude-webhook]\nverify_jwt = false\n\ne reimplante. Webhooks públicos precisam aceitar chamadas sem Authorization.";
    } else if (r.status === 404) {
      hint = "A URL respondeu 404. Verifique se a função 'claude-webhook' está implantada e se a URL está correta.";
    } else if (r.status === 0) {
      hint = "Não foi possível conectar. Verifique se a URL está pública e acessível.";
    }
    return json({
      success: r.ok,
      status: r.status,
      response_body: respBody,
      hint,
      target_url: cfg.webhook_url,
    });
  } catch (e) {
    return json({
      success: false,
      error: String((e as Error)?.message ?? e),
      hint: "Falha de rede/timeout ao chamar a URL. Confirme que o endpoint está no ar e acessível pela internet.",
      target_url: cfg.webhook_url,
    }, 200);
  }
});