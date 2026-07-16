import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(buf));
}

function pemToDer(pem: string): Uint8Array | null {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!cleaned) return null;
  try { return base64ToBytes(cleaned); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authed = createClient(supabaseUrl, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await authed.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const userId = claims.claims.sub as string;
  const userEmail = (claims.claims.email as string | undefined) ?? null;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isGerente, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "gerente",
  });
  if (roleErr || !isGerente) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_body" }, 400); }
  const publicKeyPem = typeof body?.public_key_pem === "string" ? body.public_key_pem : "";
  const confirmToken = typeof body?.confirm_token === "string" ? body.confirm_token : "";
  if (!publicKeyPem || !confirmToken) return json({ error: "invalid_body" }, 400);
  if (publicKeyPem.length > 8192 || confirmToken.length > 256) return json({ error: "invalid_body" }, 400);

  // Valida token single-use
  const tokenHash = await sha256Hex(confirmToken);
  const { data: tokenRow, error: tokErr } = await admin
    .from("claude_export_tokens")
    .select("id, created_by, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (tokErr || !tokenRow) return json({ error: "invalid_token" }, 401);
  if (tokenRow.created_by !== userId) return json({ error: "invalid_token" }, 401);
  if (tokenRow.used_at) return json({ error: "token_already_used" }, 401);
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) return json({ error: "token_expired" }, 401);

  // Marca como usado imediatamente (single-use) via update condicional
  const { data: consumed, error: consumeErr } = await admin
    .from("claude_export_tokens")
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq("id", tokenRow.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (consumeErr || !consumed) return json({ error: "token_already_used" }, 401);

  // Importa chave pública RSA-OAEP
  const der = pemToDer(publicKeyPem);
  if (!der) return json({ error: "invalid_public_key" }, 400);
  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "spki",
      der,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
  } catch {
    return json({ error: "invalid_public_key" }, 400);
  }
  const fingerprint = "sha256:" + await sha256Hex(der);

  // Lê licenças (apenas colunas necessárias)
  const { data: rows, error: qErr } = await admin
    .from("claude_orders")
    .select("id, code, provider_key_id, provider_user_id, customer_email, reseller_id, status, provider_api_key")
    .not("provider_api_key", "is", null);
  if (qErr) return json({ error: "query_error" }, 500);

  const items: any[] = [];
  for (const r of rows ?? []) {
    const plainKey = r.provider_api_key as string | null;
    if (!plainKey) continue;

    // Chave AES-GCM única por linha
    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"],
    );
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const ct = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      new TextEncoder().encode(plainKey),
    ));
    const rawAes = new Uint8Array(await crypto.subtle.exportKey("raw", aesKey));
    const wrapped = new Uint8Array(await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      rawAes,
    ));

    items.push({
      id: r.id,
      code: r.code,
      provider_key_id: r.provider_key_id,
      provider_user_id: r.provider_user_id,
      customer_email: r.customer_email,
      reseller_id: r.reseller_id,
      status: r.status,
      encrypted_key: {
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(ct),
        wrapped_key: bytesToBase64(wrapped),
      },
    });
  }

  // Auditoria (sem segredos)
  const operationId = crypto.randomUUID();
  await admin.from("claude_export_audit").insert({
    operation_id: operationId,
    manager_id: userId,
    manager_email: userEmail,
    licenses_exported: items.length,
    public_key_fingerprint: fingerprint,
  });

  return json({
    operation_id: operationId,
    algo: { wrap: "RSA-OAEP-SHA256", data: "AES-GCM-256" },
    public_key_fingerprint: fingerprint,
    count: items.length,
    exported_at: new Date().toISOString(),
    items,
  });
});
