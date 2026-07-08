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

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function evo(path: string, init: RequestInit = {}, apiKey = EVO_KEY, timeoutMs = 10_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
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

function instanceNameFor(resellerId: string) {
  return `rev_${resellerId.replace(/-/g, "").slice(0, 12)}`;
}

async function instanceTokenFor(resellerId: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`lovconnect:evolution-go:${resellerId}`),
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
  return data?.data?.Qrcode ??
    data?.data?.QRCode ??
    data?.data?.qrcode ??
    data?.data?.qrCode ??
    data?.qrcode?.base64 ??
    data?.base64 ??
    data?.qr ??
    data?.qrcode ??
    data?.qrCode ??
    null;
}

function extractPairingCode(data: any) {
  return data?.data?.Code ?? data?.data?.code ?? data?.pairingCode ?? data?.code ?? null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rawString(data: any) {
  try { return JSON.stringify(data ?? ""); } catch { return String(data ?? ""); }
}

function instanceRecord(data: any, instance: string) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [data?.data ?? data].filter(Boolean);
  return rows.find((row: any) => {
    const rec = row?.instance ?? row;
    const name = rec?.instanceName ?? rec?.name ?? rec?.instance?.instanceName;
    return !name || name === instance;
  }) ?? null;
}

function instanceNumber(data: any) {
  const rec = data?.instance ?? data?.data?.instance ?? data?.data ?? data;
  const value = rec?.ownerJid ?? rec?.owner ?? rec?.wuid ?? rec?.number ?? rec?.profileNumber ?? rec?.profile_number ?? null;
  return typeof value === "string" && value ? value.split("@")[0] : null;
}

function instanceState(data: any) {
  const rec = data?.instance ?? data?.data?.instance ?? data?.data ?? data;
  const raw = rec?.connectionStatus ?? rec?.state ?? rec?.status ?? data?.state ?? "";
  if (rec?.Connected === true || rec?.LoggedIn === true) return "open";
  if (rec?.Connected === false || rec?.LoggedIn === false) return "close";
  return String(raw).toLowerCase();
}

function legacyConnected(data: any) {
  const rec = data?.data ?? data;
  return rec?.Connected === true && rec?.LoggedIn === true;
}

function legacyDisconnected(data: any) {
  const rec = data?.data ?? data;
  return rec?.Connected === false || rec?.LoggedIn === false;
}

function onlyDigits(s: string) {
  return (s ?? "").replace(/\D+/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!EVO_BASE || !EVO_KEY) {
    return json({ error: "Evolution API não configurada pelo gerente" }, 500);
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
    const { data: reseller } = await svc
      .from("resellers")
      .select("id, is_active, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!reseller || !reseller.is_active) return json({ error: "Apenas revendedores ativos" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const instance = instanceNameFor(reseller.id);
    const instanceToken = await instanceTokenFor(reseller.id);

    // garante row da integração
    await svc.from("reseller_integrations").upsert(
      { reseller_id: reseller.id, instance_name: instance },
      { onConflict: "reseller_id" }
    );

    if (action === "connect") {
      const shouldReset = body.reset !== false;

      if (shouldReset) {
        // Limpa a instância antiga por completo. Só logout não resolve quando o Evolution
        // fica com sessão fantasma: ele responde "no QR code available" indefinidamente.
        const cleanup = await Promise.all([
          // Evolution GO usa POST para logout/restart; a API v2 usa DELETE. Tentamos os dois.
          evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "POST" }, instanceToken, 5_000),
          evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "POST" }, EVO_KEY, 5_000),
          evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" }, instanceToken, 5_000),
          evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" }, EVO_KEY, 5_000),
          evo(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" }, EVO_KEY, 5_000),
          evo(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" }, instanceToken, 5_000),
        ]);
        console.log("evo pre-connect cleanup", cleanup.map((r) => ({ ok: r.ok, status: r.status })));
        // Aguarda o servidor liberar o socket antes de recriar
        await delay(1500);
      }

      // Tenta criar instância (ignora se já existir)
      const created = await evo("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          name: instance,
          token: instanceToken,
        }),
      });
      // se 403/409 = já existe, segue
      if (!created.ok && ![201, 200, 403, 409].includes(created.status)) {
        // tenta mesmo assim o connect abaixo
        console.warn("evo create returned", created.status, created.data);
      }

      // Se a instância já existia (500 "instance already exists"), força restart
      // para invalidar qualquer sessão fantasma antes do connect.
      if (created.status === 500 || created.status === 403 || created.status === 409) {
        const restarted = await Promise.all([
          evo(`/instance/restart/${encodeURIComponent(instance)}`, { method: "POST" }, instanceToken, 5_000),
          evo(`/instance/restart/${encodeURIComponent(instance)}`, { method: "PUT" }, EVO_KEY, 5_000),
        ]);
        console.log("evo restart", restarted.map((r) => ({ ok: r.ok, status: r.status })));
        await delay(1200);
      }

      // Evolution GO: conecta por POST /instance/connect e lê o QR em GET /instance/qr usando o token da instância.
      const conn = await evo("/instance/connect", {
        method: "POST",
        body: JSON.stringify({
          immediate: true,
          subscribe: ["QRCODE", "CONNECTION"],
        }),
      }, instanceToken);
      if (!conn.ok) console.warn("evo connect returned", conn.status, conn.data);

      // Se o connect trouxe um jid mas não há QR (sessão fantasma), força logout via
      // POST e reconecta uma vez. Sem isso o Evolution nunca gera QR novo.
      const connJid = conn.data?.data?.jid ?? conn.data?.jid ?? null;
      const connEvent = String(conn.data?.data?.eventString ?? "");
      let effectiveConn = conn;
      if (connJid && !extractQr(conn.data) && !extractPairingCode(conn.data)) {
        console.warn("evo ghost session detected — forcing logout", { jid: connJid, event: connEvent });
        await Promise.all([
          evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "POST" }, instanceToken, 5_000),
          evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "POST" }, EVO_KEY, 5_000),
          evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" }, EVO_KEY, 5_000),
        ]);
        await delay(1200);
        effectiveConn = await evo("/instance/connect", {
          method: "POST",
          body: JSON.stringify({ immediate: true, subscribe: ["QRCODE", "CONNECTION"] }),
        }, instanceToken);
      }

      let qr = extractQr(effectiveConn.data);
      let pairingCode = extractPairingCode(effectiveConn.data);
      let qrResp = { ok: effectiveConn.ok, status: effectiveConn.status, data: effectiveConn.data };
      // O Evolution costuma levar 1-3s para efetivamente gerar o QR após o connect.
      // Faz polling curto em vez de uma única retentativa.
      for (let i = 0; i < 12 && !qr && !pairingCode; i++) {
        await delay(800);
        qrResp = await evo("/instance/qr", { method: "GET" }, instanceToken);
        qr = extractQr(qrResp.data);
        pairingCode = pairingCode ?? extractPairingCode(qrResp.data);
      }

      await svc.from("reseller_integrations").update({
        evolution_instance: instance,
        connection_status: "connecting",
      }).eq("reseller_id", reseller.id);

      if (!qr && !pairingCode) {
        console.warn("evo qr missing", { connectStatus: conn.status, connect: conn.data, qrStatus: qrResp.status, qr: qrResp.data });
        return json({
          ok: false,
          error: "O Evolution ainda não liberou um QR. A instância foi reiniciada; tente conectar novamente em alguns segundos.",
          details: qrResp.data,
        }, 502);
      }

      return json({ ok: true, instance, qr, pairingCode, raw: qrResp.data });
    }

    if (action === "status") {
      const [connState, fetched, legacyStatus] = await Promise.all([
        evo(`/instance/connectionState/${encodeURIComponent(instance)}`, { method: "GET" }, instanceToken),
        evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`, { method: "GET" }, EVO_KEY),
        evo("/instance/status", { method: "GET" }, instanceToken),
      ]);
      const fetchedRec = instanceRecord(fetched.data, instance);
      const hardErrors = `${rawString(connState.data)} ${rawString(fetched.data)} ${rawString(legacyStatus.data)}`;
      const legacyIsConnected = legacyConnected(legacyStatus.data);
      const isZombie = !legacyIsConnected && /device jid|client is nil|not exist|inexistente|instance not found/i.test(hardErrors);
      const state: string = legacyIsConnected ? "open" :
        isZombie || legacyDisconnected(legacyStatus.data) || (!fetchedRec && fetched.ok) ? "close" :
        instanceState(connState.data) || instanceState(fetchedRec) || instanceState(legacyStatus.data) || "unknown";

      const mapped =
        state === "open" ? "connected" :
        state === "connecting" ? "connecting" :
        state === "close" || state === "closed" || state === "disconnected" || state === "unknown" ? "disconnected" : state;

      const update: Record<string, unknown> = { connection_status: mapped };

      if (mapped === "connected") {
        update.last_connected_at = new Date().toISOString();
        // Busca perfil
        const inst = fetchedRec?.instance ?? fetchedRec;
        const profileName = inst?.profileName ?? inst?.profilePictureName ?? inst?.owner ?? null;
        const profilePic = inst?.profilePictureUrl ?? inst?.profilePicUrl ?? null;
        const number = instanceNumber(fetchedRec) ?? inst?.number ?? inst?.owner ?? inst?.wuid ?? null;
        update.profile_name = profileName;
        update.profile_picture_url = profilePic;
        update.profile_number = typeof number === "string" ? number.split("@")[0] : null;
      } else if (mapped === "disconnected") {
        update.profile_name = null;
        update.profile_picture_url = null;
        update.profile_number = null;
      }

      await svc.from("reseller_integrations").update(update).eq("reseller_id", reseller.id);

      return json({ ok: true, state: mapped, zombie: isZombie, raw: { connectionState: connState.data, fetched: fetched.data, legacyStatus: legacyStatus.data } });
    }

    if (action === "disconnect") {
      await svc.from("reseller_integrations").update({
        connection_status: "disconnected",
        profile_name: null,
        profile_picture_url: null,
        profile_number: null,
      }).eq("reseller_id", reseller.id);
      const cleanupTask = (async () => {
        const results = await Promise.all([
          evo(`/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" }, instanceToken, 5_000),
          evo("/instance/logout", { method: "DELETE" }, instanceToken, 5_000),
          evo(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" }, EVO_KEY, 5_000),
          evo(`/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" }, instanceToken, 5_000),
          evo("/instance/delete", { method: "DELETE", body: JSON.stringify({ name: instance, instanceName: instance }) }, EVO_KEY, 5_000),
        ]);
        console.log("[reseller disconnect cleanup]", results.map((r) => ({ ok: r.ok, status: r.status })));
      })();
      (globalThis as any).EdgeRuntime?.waitUntil?.(cleanupTask);
      return json({ ok: true, queued: true });
    }

    if (action === "send_test") {
      const number = onlyDigits(String(body.number ?? ""));
      const text = String(body.text ?? "✅ Teste de integração WhatsApp via Evolution API");
      if (number.length < 10) return json({ error: "WhatsApp inválido" }, 400);
      const r = await evo("/send/text", {
        method: "POST",
        body: JSON.stringify({ number, text }),
      }, instanceToken);
      if (!r.ok) return json({ ok: false, error: "Falha ao enviar", details: r.data }, 502);
      await svc.rpc("increment_evolution_messages_sent", { _reseller_id: reseller.id });
      return json({ ok: true, raw: r.data });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    console.error("[evolution-api]", e);
    return json({ error: e instanceof Error ? e.message : "erro interno" }, 500);
  }
});
