import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function fmtBR(iso: string | null) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function describePromo(p: any) {
  const parts: string[] = [];
  if (p.extension_discount_pct != null) parts.push(`${p.extension_discount_pct}% OFF extensões`);
  if (p.credit_discount_pct != null) parts.push(`${p.credit_discount_pct}% OFF recargas`);
  if (p.recharge_bonus_pct != null) parts.push(`+${p.recharge_bonus_pct}% bônus`);
  return parts.join(" • ") || "(sem valores)";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();
    const events: string[] = [];

    // 1) Encerrar promoções ativas vencidas
    const { data: toEnd } = await admin
      .from("promotions")
      .select("*")
      .eq("status", "active")
      .not("ends_at", "is", null)
      .lte("ends_at", nowIso);

    for (const p of toEnd ?? []) {
      await admin
        .from("promotions")
        .update({ status: "ended", deactivated_at: nowIso })
        .eq("id", p.id);
      events.push(`⏹️ <b>Promoção encerrada</b>\n${p.name}\n${describePromo(p)}\nFim: ${fmtBR(p.ends_at)}`);
    }

    // 2) Ativar promoções agendadas cujo horário chegou
    const { data: toActivate } = await admin
      .from("promotions")
      .select("*")
      .eq("status", "scheduled")
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .order("starts_at", { ascending: true });

    if (toActivate && toActivate.length > 0) {
      // Encerra qualquer outra ativa (regra: 1 por vez). Pega a mais recente como vencedora.
      const winner = toActivate[toActivate.length - 1];
      const losers = toActivate.filter((p) => p.id !== winner.id);

      // Cancela as "perdedoras" (que iriam ativar junto): mantém como ended
      for (const l of losers) {
        await admin
          .from("promotions")
          .update({ status: "ended", deactivated_at: nowIso })
          .eq("id", l.id);
      }

      // Encerra qualquer ativa atual diferente do winner
      await admin
        .from("promotions")
        .update({ status: "ended", deactivated_at: nowIso })
        .eq("status", "active")
        .neq("id", winner.id);

      const { error: actErr } = await admin
        .from("promotions")
        .update({ status: "active", activated_at: nowIso })
        .eq("id", winner.id)
        .eq("status", "scheduled");

      if (!actErr) {
        events.push(
          `🎉 <b>Promoção ativada</b>\n${winner.name}\n${describePromo(winner)}\n` +
          `Início: ${fmtBR(winner.starts_at ?? nowIso)}\nFim: ${fmtBR(winner.ends_at)}`
        );
      }
    }

    // 3) Notificações
    if (events.length > 0) {
      try {
        for (const text of events) {
          await admin.from("telegram_outbox").insert({ text });
        }
      } catch (_) { /* ignore */ }
    }

    return new Response(
      JSON.stringify({ ok: true, ended: toEnd?.length ?? 0, activated: toActivate?.length ? 1 : 0, events: events.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("apply-promotion-schedule error", e);
    return new Response(
      JSON.stringify({ error: String((e as any)?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});