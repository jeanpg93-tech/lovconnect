import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const MISTIC_BASE = "https://api.misticpay.com/api";

// Endpoints conhecidos para validar credenciais.
// Tentamos em ordem; o primeiro que retornar 2xx ou 401/403 (auth válida → endpoint existe)
// é o que confirma que a API responde.
const PROBE_PATHS = [
  "/users/transactions/list/1",
  "/account",
  "/account/balance",
  "/balance",
  "/transactions",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: claims, error: cErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (cErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub;

    const body = await req.json().catch(() => ({}));
    const ci = String(body.client_id ?? "").trim();
    const cs = String(body.client_secret ?? "").trim();
    if (!ci || !cs) return json({ error: "Informe client_id e client_secret" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: reseller } = await admin
      .from("resellers").select("id").eq("user_id", userId).maybeSingle();
    if (!reseller) return json({ error: "Apenas revendedores" }, 403);

    const attempts: Array<{
      path: string;
      status: number;
      body: unknown;
    }> = [];

    for (const path of PROBE_PATHS) {
      let resp: Response;
      try {
        resp = await fetch(`${MISTIC_BASE}${path}`, {
          method: "GET",
          headers: { ci, cs, "Content-Type": "application/json" },
        });
      } catch (e) {
        attempts.push({
          path,
          status: 0,
          body: { error: e instanceof Error ? e.message : "network error" },
        });
        continue;
      }
      const txt = await resp.text();
      let parsed: unknown;
      try { parsed = JSON.parse(txt); } catch { parsed = { raw: txt.slice(0, 500) }; }
      attempts.push({ path, status: resp.status, body: parsed });

      // 2xx → tudo certo
      if (resp.ok) {
        return json({
          ok: true,
          status: resp.status,
          probed: path,
          details: parsed,
        });
      }
      // 401/403 → endpoint existe, mas credenciais inválidas
      if (resp.status === 401 || resp.status === 403) {
        return json({
          ok: false,
          reason: "invalid_credentials",
          status: resp.status,
          probed: path,
          message:
            "Credenciais inválidas. Confira o CI (Client ID) e o CS (Client Secret) no painel da MisticPay.",
          details: parsed,
        });
      }
    }

    // Nenhum endpoint respondeu OK ou 401/403 — provável bloqueio/instabilidade ou todos 404.
    const allNotFound = attempts.every((a) => a.status === 404);
    return json({
      ok: false,
      reason: allNotFound ? "endpoints_unavailable" : "unexpected_response",
      message: allNotFound
        ? "A API da MisticPay respondeu 404 em todos os endpoints testados. Verifique se sua conta está ativa, se o CI/CS pertencem ao ambiente correto (produção) e se sua conta tem permissão de API habilitada. Se persistir, contate o suporte da MisticPay."
        : "A API da MisticPay respondeu de forma inesperada. Verifique suas credenciais ou tente novamente em instantes.",
      attempts,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "erro" }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
