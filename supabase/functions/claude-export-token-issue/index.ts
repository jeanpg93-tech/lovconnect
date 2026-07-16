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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(buf));
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

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isGerente, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "gerente",
  });
  if (roleErr || !isGerente) return json({ error: "forbidden" }, 403);

  // Nonce 32 bytes -> base64url
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const b64 = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const tokenHash = await sha256Hex(b64);

  const { error: insErr } = await admin.from("claude_export_tokens").insert({
    token_hash: tokenHash,
    created_by: userId,
  });
  if (insErr) return json({ error: "storage_error" }, 500);

  // Token retornado UMA vez. Não gravamos o valor em claro.
  return json({ confirm_token: b64, expires_in_seconds: 15 * 60 });
});
