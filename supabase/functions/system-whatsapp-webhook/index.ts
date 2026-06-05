import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Evolution status codes commonly seen:
// 1 / "PENDING" -> sent
// 2 / "SERVER_ACK" -> sent (server received)
// 3 / "DELIVERY_ACK" -> delivered
// 4 / "READ" / "PLAYED" -> read
// 5 -> read
function mapStatus(raw: any): "sent" | "delivered" | "read" | null {
  if (raw == null) return null;
  const s = String(raw).toUpperCase();
  if (s === "READ" || s === "PLAYED" || s === "4" || s === "5") return "read";
  if (s === "DELIVERY_ACK" || s === "DELIVERED" || s === "3") return "delivered";
  if (s === "SERVER_ACK" || s === "PENDING" || s === "1" || s === "2") return "sent";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: true });

  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret") ?? "";
    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: settings } = await svc
      .from("system_whatsapp_settings").select("webhook_secret").eq("singleton", true).maybeSingle();
    if (!settings || secret !== settings.webhook_secret) {
      return json({ ok: false, error: "invalid secret" }, 401);
    }

    const body = await req.json().catch(() => ({} as any));
    // event name might be at top-level or in `event` field
    const event = String(body.event ?? body.type ?? "").toLowerCase();
    const data = body.data ?? body;

    // CONNECTION_UPDATE — update settings.status
    if (event.includes("connection")) {
      const stRaw = String(data?.state ?? data?.status ?? "").toLowerCase();
      const mapped = stRaw === "open" ? "connected" : stRaw === "close" || stRaw === "closed" ? "disconnected" : stRaw === "connecting" ? "connecting" : null;
      if (mapped) {
        await svc.from("system_whatsapp_settings").update({ status: mapped }).eq("singleton", true);
      }
      return json({ ok: true });
    }

    // MESSAGES_UPDATE — status change
    // payload may be: { key: { id }, update: { status } } or { messages: [...] }
    const updates: any[] = Array.isArray(data) ? data
      : Array.isArray(data?.messages) ? data.messages
      : [data];

    for (const u of updates) {
      const msgId = u?.key?.id ?? u?.id ?? u?.message_id ?? null;
      const statusRaw = u?.update?.status ?? u?.status ?? u?.ack;
      const mapped = mapStatus(statusRaw);
      if (!msgId || !mapped) continue;

      const patch: Record<string, unknown> = { status: mapped };
      const now = new Date().toISOString();
      if (mapped === "delivered") patch.delivered_at = now;
      if (mapped === "read") {
        patch.read_at = now;
        // also fill delivered_at if not set
        const { data: existing } = await svc.from("system_whatsapp_log")
          .select("delivered_at").eq("evolution_message_id", msgId).maybeSingle();
        if (existing && !existing.delivered_at) patch.delivered_at = now;
      }
      await svc.from("system_whatsapp_log").update(patch).eq("evolution_message_id", msgId);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[system-whatsapp-webhook]", e);
    return json({ ok: false }, 200); // never error to Evolution
  }
});