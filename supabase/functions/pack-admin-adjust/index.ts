// Gerente credita ou debita créditos do pack de um revendedor manualmente,
// e/ou alterna o billing_mode entre normal/subscription/pack.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const { data: isMgr } = await admin.rpc("has_role", { _user_id: userId, _role: "gerente" });
    if (!isMgr) return json({ error: "Apenas gerente" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const reseller_id = String(body.reseller_id ?? "");
    if (!reseller_id) return json({ error: "reseller_id obrigatório" }, 400);

    if (action === "set_billing_mode") {
      const mode = String(body.mode ?? "");
      if (!["normal", "subscription", "pack"].includes(mode)) return json({ error: "mode inválido" }, 400);
      const { error } = await admin.from("resellers").update({ billing_mode: mode }).eq("id", reseller_id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, mode });
    }

    if (action === "credit") {
      const credits = Number(body.credits);
      const description = String(body.description ?? "Crédito manual do gerente");
      if (!Number.isInteger(credits) || credits <= 0) return json({ error: "credits inválido" }, 400);

      // Cria registro de compra "manual" para histórico (sem Pix)
      const { data: purchase, error: purchaseErr } = await admin
        .from("reseller_pack_purchases")
        .insert({
          reseller_id,
          pack_id: body.pack_id ?? null,
          pack_name: body.pack_name ?? "Crédito manual",
          credits,
          price_cents: 0,
          status: "manual",
          provider: null,
          paid_at: new Date().toISOString(),
          created_by_admin: userId,
          notes: description,
        })
        .select("id")
        .single();
      if (purchaseErr) return json({ error: purchaseErr.message }, 500);

      const { data: newBal, error: credErr } = await admin.rpc("pack_credit_balance", {
        _reseller_id: reseller_id,
        _credits: credits,
        _kind: "admin_credit",
        _purchase_id: (purchase as any).id,
        _description: description,
        _actor_id: userId,
      });
      if (credErr) return json({ error: credErr.message }, 500);

      return json({ ok: true, credits, balance: newBal });
    }

    if (action === "debit") {
      const credits = Number(body.credits);
      const description = String(body.description ?? "Débito manual do gerente");
      if (!Number.isInteger(credits) || credits <= 0) return json({ error: "credits inválido" }, 400);

      const { data: newBal, error: debErr } = await admin.rpc("pack_debit_balance", {
        _reseller_id: reseller_id,
        _credits: credits,
        _description: description,
        _actor_id: userId,
      });
      if (debErr) {
        const msg = debErr.message?.includes("insufficient_credits") ? "Saldo insuficiente" : debErr.message;
        return json({ error: msg }, 400);
      }
      return json({ ok: true, credits, balance: newBal });
    }

    return json({ error: "action inválida" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});