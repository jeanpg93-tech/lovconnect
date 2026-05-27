import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const KEY = "recargas_settings";

const MODE_LABEL: Record<string, string> = {
  automatico: "Automático",
  manual: "Manual",
  maintenance: "Manutenção",
};

function fmtBR(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Carrega settings atuais
    const { data: settingsRow } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();

    const current: any = settingsRow?.value ?? {};
    const paused = !!current.schedule_paused;

    // 2) Busca entradas vencidas
    const nowIso = new Date().toISOString();
    const { data: due, error: dueErr } = await admin
      .from("recharge_schedule")
      .select("*")
      .is("executed_at", null)
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true });

    if (dueErr) throw dueErr;
    if (!due || due.length === 0) {
      return json({ ok: true, applied: 0, paused });
    }

    // Se pausada, marcamos como puladas (não aplicamos)
    if (paused) {
      const ids = due.map((d) => d.id);
      await admin
        .from("recharge_schedule")
        .update({ executed_at: nowIso, executed_result: "skipped_paused" })
        .in("id", ids);
      try {
        await admin.from("telegram_outbox").insert({
          text:
            `⏸️ <b>Agenda de recargas pausada</b>\n` +
            `${ids.length} troca(s) vencida(s) foram ignoradas.\n` +
            due.map((d) =>
              `• ${fmtBR(d.scheduled_at)} → <b>${MODE_LABEL[d.target_mode] ?? d.target_mode}</b>`
            ).join("\n"),
        });
      } catch (_) { /* ignore */ }
      return json({ ok: true, applied: 0, skipped: ids.length, paused: true });
    }

    // 3) Aplica apenas a entrada mais recente (última do conjunto vencido)
    const last = due[due.length - 1];
    let next = { ...current };

    if (last.target_mode === "maintenance") {
      next.maintenance_enabled = true;
      if (last.maintenance_message) next.maintenance_message = last.maintenance_message;
    } else {
      next.active_mode = last.target_mode; // "automatico" | "manual"
      next.maintenance_enabled = false;
    }

    const { error: upErr } = await admin
      .from("app_settings")
      .upsert({ key: KEY, value: next }, { onConflict: "key" });
    if (upErr) throw upErr;

    // 4) Marca todas as vencidas como executadas
    const appliedId = last.id;
    const skippedIds = due.filter((d) => d.id !== appliedId).map((d) => d.id);

    if (skippedIds.length) {
      await admin
        .from("recharge_schedule")
        .update({ executed_at: nowIso, executed_result: "superseded" })
        .in("id", skippedIds);
    }
    await admin
      .from("recharge_schedule")
      .update({ executed_at: nowIso, executed_result: `applied:${last.target_mode}` })
      .eq("id", appliedId);

    // Notificação Telegram da execução
    try {
      const label = MODE_LABEL[last.target_mode] ?? last.target_mode;
      let text =
        `⚙️ <b>Agenda de recargas executada</b>\n` +
        `Modo ativado: <b>${label}</b>\n` +
        `Agendado para: ${fmtBR(last.scheduled_at)}`;
      if (last.target_mode === "maintenance" && last.maintenance_message) {
        text += `\n💬 ${last.maintenance_message}`;
      }
      if (last.note) text += `\n📝 ${last.note}`;
      if (skippedIds.length) {
        text += `\n\n↪️ ${skippedIds.length} entrada(s) anterior(es) ignorada(s) (superseded).`;
      }
      await admin.from("telegram_outbox").insert({ text });
    } catch (_) { /* não bloqueia */ }

    return json({ ok: true, applied: 1, mode: last.target_mode, superseded: skippedIds.length });
  } catch (e) {
    console.error("apply-recharge-schedule error", e);
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}