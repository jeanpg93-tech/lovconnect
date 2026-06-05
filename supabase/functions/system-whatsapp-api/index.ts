import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

async function evo(path: string, init: RequestInit = {}, apiKey = EVO_KEY) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(`${EVO_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const txt = await r.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : String(e) } };
  } finally {
    clearTimeout(t);
  }
}

async function systemInstanceToken() {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("lovconnect:evolution-go:system"),
  );
  const chars = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32)
    .split("");
  chars[12] = "4";
  chars[16] = ((parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function extractQr(data: any) {
  return data?.data?.Qrcode ?? data?.data?.QRCode ?? data?.data?.qrcode ??
    data?.data?.qrCode ?? data?.qrcode?.base64 ?? data?.base64 ??
    data?.qr ?? data?.qrcode ?? data?.qrCode ?? null;
}
function extractPairingCode(data: any) {
  return data?.data?.Code ?? data?.data?.code ?? data?.pairingCode ?? data?.code ?? null;
}
function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }
function normalizeBR(raw: string): string {
  const d = onlyDigits(raw);
  if (!d) return "";
  if (d.length >= 12 && d.startsWith("55")) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!EVO_BASE || !EVO_KEY) {
    return json({ error: "Evolution API não configurada (EVOLUTION_BASE_URL / EVOLUTION_API_KEY ausentes)" }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uerr } = await userClient.auth.getUser();
    if (uerr || !user) return json({ error: "Unauthorized" }, 401);

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: isGerente } = await svc.rpc("has_role", { _user_id: user.id, _role: "gerente" });
    if (!isGerente) return json({ error: "Apenas gerentes" }, 403);

    const { data: settings } = await svc
      .from("system_whatsapp_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (!settings) return json({ error: "Configurações não encontradas" }, 500);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const instance = SYSTEM_INSTANCE;
    const instanceToken = await systemInstanceToken();
    const webhookUrl = `${SUPABASE_URL}/functions/v1/system-whatsapp-webhook?secret=${settings.webhook_secret}`;

    if (action === "connect") {
      // 1) Try to fully delete any previous instance to start clean
      //    (avoids the "store doesn't contain a device JID" zombie state).
      try {
        await evo("/instance/logout", { method: "DELETE" }, instanceToken);
      } catch (_) { /* ignore */ }
      try {
        await evo(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" });
      } catch (_) { /* ignore */ }
      try {
        await evo("/instance/delete", { method: "DELETE", body: JSON.stringify({ name: instance }) });
      } catch (_) { /* ignore */ }
      await delay(400);

      // 2) Create fresh
      const created = await evo("/instance/create", {
        method: "POST",
        body: JSON.stringify({ name: instance, token: instanceToken }),
      });
      if (!created.ok && ![201, 200, 403, 409].includes(created.status)) {
        console.warn("evo create returned", created.status, created.data);
      }

      // tenta configurar webhook (best-effort)
      try {
        await evo("/webhook/set", {
          method: "POST",
          body: JSON.stringify({
            url: webhookUrl,
            events: ["MESSAGES_UPDATE", "MESSAGES_UPSERT", "CONNECTION_UPDATE"],
            enabled: true,
          }),
        }, instanceToken);
      } catch (e) {
        console.warn("webhook set failed", e);
      }

      const conn = await evo("/instance/connect", {
        method: "POST",
        body: JSON.stringify({ immediate: true, subscribe: ["QRCODE", "CONNECTION"] }),
      }, instanceToken);
      if (!conn.ok) console.warn("evo connect returned", conn.status, conn.data);

      // Try several times because evolution-go takes ~1-3s to generate the QR
      let qr: string | null = extractQr(conn.data);
      let pairingCode: string | null = extractPairingCode(conn.data);
      let qrResp = { data: conn.data } as any;
      for (let i = 0; i < 6 && !qr; i++) {
        await delay(600);
        qrResp = await evo("/instance/qr", { method: "GET" }, instanceToken);
        qr = extractQr(qrResp.data);
        pairingCode = pairingCode ?? extractPairingCode(qrResp.data);
      }

      await svc.from("system_whatsapp_settings").update({
        status: "connecting",
        connected_number: null,
      }).eq("singleton", true);

      return json({ ok: true, instance, qr, pairingCode });
    }

    if (action === "status") {
      const st = await evo("/instance/status", { method: "GET" }, instanceToken);
      const rawErr = String(st.data?.error ?? st.data?.message ?? "");
      // If Evolution reports the zombie state, force disconnected so the UI prompts a reconnect.
      const isZombie = /device jid|client is nil/i.test(rawErr);
      const state: string = isZombie ? "close" :
        st.data?.data?.Connected === true || st.data?.data?.LoggedIn === true ? "open" :
        st.data?.data?.Connected === false ? "close" :
        st.data?.instance?.state ?? st.data?.state ?? "unknown";
      const mapped =
        state === "open" ? "connected" :
        state === "connecting" ? "connecting" :
        state === "close" || state === "closed" ? "disconnected" : state;

      const update: Record<string, unknown> = { status: mapped };
      if (mapped === "connected") {
        const fi = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`, { method: "GET" });
        const rec = Array.isArray(fi.data) ? fi.data[0] : fi.data;
        const inst = rec?.instance ?? rec;
        const number = inst?.number ?? inst?.owner ?? inst?.wuid ?? null;
        update.connected_number = typeof number === "string" ? number.split("@")[0] : null;
      } else if (mapped === "disconnected") {
        update.connected_number = null;
      }
      await svc.from("system_whatsapp_settings").update(update).eq("singleton", true);
      return json({ ok: true, state: mapped, zombie: isZombie, raw: rawErr || undefined });
    }

    if (action === "disconnect") {
      // Fully wipe the instance so the next connect starts from scratch.
      const r = await evo("/instance/logout", { method: "DELETE" }, instanceToken);
      try { await evo(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" }); } catch (_) {}
      try { await evo("/instance/delete", { method: "DELETE", body: JSON.stringify({ name: instance }) }); } catch (_) {}
      await svc.from("system_whatsapp_settings").update({
        status: "disconnected",
        connected_number: null,
      }).eq("singleton", true);
      return json({ ok: true, raw: r.data });
    }

    if (action === "send_test") {
      const number = normalizeBR(String(body.number ?? ""));
      const text = String(body.text ?? "✅ Teste do WhatsApp do sistema");
      if (number.length < 12) return json({ error: "WhatsApp inválido. Informe DDD + número, ex: 13988804959" }, 400);
      const finalText = `${text}\n\n${settings.footer_text}`;
      const { data: row, error: logError } = await svc.from("system_whatsapp_log").insert({
        kind: "test",
        to_number: number,
        message: finalText,
        status: "queued",
        created_by: user.id,
      }).select("id").single();
      if (logError || !row?.id) return json({ error: logError?.message ?? "Não foi possível criar o envio" }, 500);

      const sendPromise = (async () => {
        let r = await evo("/send/text", {
          method: "POST",
          body: JSON.stringify({ number, text: finalText }),
        }, instanceToken);
        if (!r.ok) {
          console.warn("[send_test] /send/text with instanceToken failed", r.status, r.data);
          r = await evo("/send/text", {
            method: "POST",
            body: JSON.stringify({ number, text: finalText }),
          }, EVO_KEY);
          if (!r.ok) console.warn("[send_test] /send/text with EVO_KEY failed", r.status, r.data);
        }
        const evoMsgId = r.data?.key?.id ?? r.data?.data?.key?.id ?? null;
        await svc.from("system_whatsapp_log").update({
          status: r.ok ? "sent" : "error",
          error_reason: r.ok ? null : JSON.stringify(r.data).slice(0, 500),
          evolution_message_id: evoMsgId,
          sent_at: r.ok ? new Date().toISOString() : null,
        }).eq("id", row.id);
      })();
      (globalThis as any).EdgeRuntime?.waitUntil?.(sendPromise);
      return json({ ok: true, queued: true, log_id: row.id, number });
    }

    if (action === "get_webhook_url") {
      return json({ ok: true, url: webhookUrl });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[system-whatsapp-api]", e);
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});