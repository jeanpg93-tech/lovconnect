import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const MISTIC_BASE = "https://api.misticpay.com/api";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isServiceRoleToken(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload?.role === "service_role";
  } catch (_e) {
    return false;
  }
}

async function getManagerMisticCreds(admin: any): Promise<{ ci: string | null; cs: string | null }> {
  let ci = Deno.env.get("MISTICPAY_CLIENT_ID") ?? null;
  let cs = Deno.env.get("MISTICPAY_CLIENT_SECRET") ?? null;
  if (ci && cs) return { ci, cs };
  try {
    const { data } = await admin.from("app_settings")
      .select("key, value")
      .in("key", ["misticpay_client_id", "misticpay_client_secret"]);
    for (const row of (data ?? []) as any[]) {
      const v = typeof row.value === "string" ? row.value : (row.value?.value ?? row.value);
      if (row.key === "misticpay_client_id" && !ci) ci = v ?? null;
      if (row.key === "misticpay_client_secret" && !cs) cs = v ?? null;
    }
  } catch (_e) {}
  return { ci, cs };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceCall = token === serviceKey || isServiceRoleToken(token);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    let userId: string | null = null;

    if (!isServiceCall) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
      if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
      userId = claims.claims.sub;
      const { data: isMgr } = await admin.rpc("has_role", { _user_id: userId, _role: "gerente" });
      if (!isMgr) return json({ error: "Apenas gerente" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const resellerId = String(body.reseller_id ?? "");
    const kind = String(body.kind ?? "one_off");
    const amountCents = Number(body.amount_cents);
    const dueDate = String(body.due_date ?? "");
    const description = String(body.description ?? "Cobrança mensalista");
    const isOnboarding = !!body.is_onboarding;
    const recurrenceId = body.recurrence_id ? String(body.recurrence_id) : null;

    if (!resellerId) return json({ error: "reseller_id obrigatório" }, 400);
    if (!["monthly", "installment", "one_off"].includes(kind)) return json({ error: "kind inválido" }, 400);
    if (!Number.isInteger(amountCents) || amountCents < 100) return json({ error: "Valor mínimo R$ 1,00" }, 400);
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return json({ error: "due_date inválido" }, 400);

    const { data: reseller } = await admin
      .from("resellers").select("id, display_name, user_id, is_demo")
      .eq("id", resellerId).maybeSingle();
    if (!reseller) return json({ error: "Revendedor não encontrado" }, 404);

    // DEMO GUARD — gera cobrança fake sem chamar MisticPay
    if ((reseller as any).is_demo) {
      const fakePayload = `00020126360014BR.GOV.BCB.PIX0114DEMO${crypto.randomUUID().slice(0, 8)}5204000053039865802BR5913DEMO RESELLER6009SAO PAULO62070503***6304ABCD`;
      const { data: demoCharge, error: demoErr } = await admin
        .from("reseller_subscription_charges")
        .insert({
          reseller_id: resellerId,
          kind, description, amount_cents: amountCents, due_date: dueDate,
          status: "pending", provider: "demo",
          is_onboarding: isOnboarding, created_by: userId,
          recurrence_id: recurrenceId,
          pix_payload: fakePayload,
          provider_charge_id: `DEMO-${crypto.randomUUID().slice(0, 8)}`,
        }).select().single();
      if (demoErr || !demoCharge) return json({ error: demoErr?.message ?? "demo insert error" }, 500);
      return json({
        demo: true,
        charge_id: demoCharge.id,
        provider_transaction_id: demoCharge.provider_charge_id,
        copy_paste: fakePayload,
        amount_cents: amountCents,
      });
    }

    const { data: prof } = await admin
      .from("profiles").select("display_name, email")
      .eq("id", reseller.user_id).maybeSingle();
    const payerName = prof?.display_name ?? reseller.display_name ?? "Revendedor";
    const payerDoc = (body.payer_document ?? "00000000000").toString().replace(/\D/g, "");

    // Create local charge row first to get id used as transactionId
    const { data: charge, error: insErr } = await admin
      .from("reseller_subscription_charges")
      .insert({
        reseller_id: resellerId,
        kind,
        description,
        amount_cents: amountCents,
        due_date: dueDate,
        status: "pending",
        provider: "misticpay",
        is_onboarding: isOnboarding,
        created_by: userId,
        recurrence_id: recurrenceId,
      })
      .select().single();
    if (insErr || !charge) return json({ error: insErr?.message ?? "insert error" }, 500);

    const { ci, cs } = await getManagerMisticCreds(admin);
    if (!ci || !cs) {
      await admin.from("reseller_subscription_charges").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", charge.id);
      return json({ error: "MisticPay do gerente não configurado" }, 500);
    }

    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const webhookUrl = `${supaUrl}/functions/v1/misticpay-webhook`;

    const mpResp = await fetch(`${MISTIC_BASE}/transactions/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ci, cs },
      body: JSON.stringify({
        amount: amountCents / 100,
        payerName,
        payerDocument: payerDoc,
        transactionId: charge.id,
        description: `${description} — ${reseller.display_name ?? ""}`.trim(),
        projectWebhook: webhookUrl,
      }),
    });
    const mpJson = await mpResp.json().catch(() => ({}));
    if (!mpResp.ok) {
      await admin.from("reseller_subscription_charges").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", charge.id);
      return json({ error: mpJson?.message ?? "Erro MisticPay", details: mpJson }, 502);
    }

    const d = mpJson.data ?? {};
    await admin.from("reseller_subscription_charges").update({
      provider_charge_id: String(d.transactionId ?? ""),
      pix_qr_base64: d.qrCodeBase64 ?? null,
      pix_payload: d.copyPaste ?? null,
    }).eq("id", charge.id);

    return json({
      charge_id: charge.id,
      provider_transaction_id: d.transactionId,
      qr_code_base64: d.qrCodeBase64,
      copy_paste: d.copyPaste,
      amount_cents: amountCents,
    });
  } catch (e: any) {
    console.error("subscription-create-charge error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});