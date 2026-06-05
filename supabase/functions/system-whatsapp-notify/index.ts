import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVO_BASE = (Deno.env.get("EVOLUTION_BASE_URL") ?? "").replace(/\/+$/, "");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
const SYSTEM_INSTANCE = "system";

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function systemInstanceToken() {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("lovconnect:evolution-go:system"));
  const chars = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function render(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? "");
}

function normalizeBR(raw: string): string {
  const d = (raw ?? "").replace(/\D+/g, "");
  if (!d) return "";
  if (d.length >= 12 && d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

/**
 * Body:
 *  - mode: "auto" (requires event_key + reseller_id) | "manual" (requires reseller_ids[] OR raw_number, message, created_by)
 *  - event_key, reseller_id, vars?  -> auto
 *  - reseller_ids?, raw_number?, message, created_by? -> manual
 * Internal endpoint — auth: service-role key in Authorization OR caller is gerente.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!EVO_BASE || !EVO_KEY) return json({ ok: false, skipped: "evolution_not_configured" });

  try {
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Auth: either service-role bearer, or authenticated gerente.
    const auth = req.headers.get("Authorization") ?? "";
    const bearer = auth.replace(/^Bearer\s+/i, "");
    let isServiceCall = bearer && bearer === SERVICE_ROLE_KEY;
    let callerUserId: string | null = null;

    if (!isServiceCall) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: isGerente } = await svc.rpc("has_role", { _user_id: user.id, _role: "gerente" });
      if (!isGerente) return json({ error: "Apenas gerentes" }, 403);
      callerUserId = user.id;
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? "auto");

    const { data: settings } = await svc
      .from("system_whatsapp_settings")
      .select("*").eq("singleton", true).maybeSingle();
    if (!settings) return json({ ok: false, skipped: "no_settings" });
    if (settings.status !== "connected") {
      return json({ ok: false, skipped: "not_connected" });
    }

    const instanceToken = await systemInstanceToken();
    const footer = settings.footer_text ?? "";

    async function sendOne(opts: {
      kind: "auto" | "manual";
      eventKey: string | null;
      resellerId: string | null;
      toRaw: string;
      message: string;
    }) {
      const to = normalizeBR(opts.toRaw);
      if (!to || to.length < 12) {
        return { ok: false, skipped: "invalid_number" };
      }
      const finalText = `${opts.message}\n\n${footer}`;

      // queued row
      const { data: row } = await svc.from("system_whatsapp_log").insert({
        kind: opts.kind,
        event_key: opts.eventKey,
        reseller_id: opts.resellerId,
        to_number: to,
        message: finalText,
        status: "queued",
        created_by: callerUserId,
      }).select("id").single();

      const r = await fetch(`${EVO_BASE}/send/text`, {
        method: "POST",
        headers: { apikey: instanceToken, "Content-Type": "application/json" },
        body: JSON.stringify({ number: to, text: finalText }),
      });
      const txt = await r.text();
      let data: any = null;
      try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
      const evoMsgId = data?.key?.id ?? data?.data?.key?.id ?? null;

      if (row?.id) {
        await svc.from("system_whatsapp_log").update({
          status: r.ok ? "sent" : "error",
          error_reason: r.ok ? null : (typeof data === "string" ? data : JSON.stringify(data)).slice(0, 500),
          evolution_message_id: evoMsgId,
          sent_at: r.ok ? new Date().toISOString() : null,
        }).eq("id", row.id);
      }
      return { ok: r.ok, log_id: row?.id, status: r.status };
    }

    if (mode === "auto") {
      const event_key = String(body.event_key ?? "");
      const reseller_id = String(body.reseller_id ?? "");
      const vars = (body.vars ?? {}) as Record<string, string>;
      if (!event_key || !reseller_id) return json({ error: "event_key e reseller_id obrigatórios" }, 400);

      const { data: ev } = await svc.from("system_whatsapp_events").select("*").eq("event_key", event_key).maybeSingle();
      if (!ev || !ev.enabled) return json({ ok: false, skipped: "event_disabled_or_missing" });

      // cooldown: skip if same event was sent to same reseller in last `cooldown_hours`
      if (ev.cooldown_hours > 0) {
        const since = new Date(Date.now() - ev.cooldown_hours * 3600 * 1000).toISOString();
        const { data: recent } = await svc
          .from("system_whatsapp_log")
          .select("id")
          .eq("event_key", event_key)
          .eq("reseller_id", reseller_id)
          .in("status", ["queued", "sent", "delivered", "read"])
          .gte("created_at", since)
          .limit(1);
        if (recent && recent.length > 0) return json({ ok: false, skipped: "cooldown" });
      }

      const { data: reseller } = await svc
        .from("resellers").select("id, display_name, user_id").eq("id", reseller_id).maybeSingle();
      if (!reseller) return json({ ok: false, skipped: "reseller_not_found" });

      const { data: prof } = await svc.from("profiles").select("whatsapp, display_name").eq("id", reseller.user_id).maybeSingle();
      const to = String(prof?.whatsapp ?? "");
      if (!to) return json({ ok: false, skipped: "no_whatsapp" });

      const merged: Record<string, string> = {
        nome: vars.nome ?? prof?.display_name ?? reseller.display_name ?? "",
        loja: vars.loja ?? reseller.display_name ?? "",
        ...vars,
      };
      const message = render(ev.template, merged);
      const res = await sendOne({ kind: "auto", eventKey: event_key, resellerId: reseller_id, toRaw: to, message });
      return json(res);
    }

    if (mode === "manual") {
      const message = String(body.message ?? "").trim();
      if (!message) return json({ error: "message obrigatório" }, 400);
      const reseller_ids: string[] = Array.isArray(body.reseller_ids) ? body.reseller_ids : [];
      const raw_number: string = String(body.raw_number ?? "");

      const results: any[] = [];
      if (raw_number) {
        results.push(await sendOne({ kind: "manual", eventKey: null, resellerId: null, toRaw: raw_number, message }));
      }
      if (reseller_ids.length > 0) {
        for (const id of reseller_ids) {
          const { data: reseller } = await svc.from("resellers").select("user_id, display_name").eq("id", id).maybeSingle();
          let to = "";
          let nome = "";
          if (reseller) {
            const { data: prof } = await svc.from("profiles").select("whatsapp, display_name").eq("id", reseller.user_id).maybeSingle();
            to = prof?.whatsapp ?? "";
            nome = prof?.display_name ?? reseller.display_name ?? "";
          }
          if (!to) {
            await svc.from("system_whatsapp_log").insert({
              kind: "manual", reseller_id: id, to_number: "",
              message, status: "error", error_reason: "Revendedor sem WhatsApp cadastrado",
              created_by: callerUserId,
            });
            results.push({ ok: false, reseller_id: id, skipped: "no_whatsapp" });
            continue;
          }
          const personalized = render(message, { nome });
          results.push(await sendOne({ kind: "manual", eventKey: null, resellerId: id, toRaw: to, message: personalized }));
        }
      }
      return json({ ok: true, results });
    }

    return json({ error: "mode inválido" }, 400);
  } catch (e) {
    console.error("[system-whatsapp-notify]", e);
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});