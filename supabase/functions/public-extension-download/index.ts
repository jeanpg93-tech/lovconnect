import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-query-slug",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") || req.headers.get("x-query-slug");
    if (!slug) {
      return new Response(JSON.stringify({ error: "missing slug" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ext, error } = await supabase
      .from("extensions")
      .select("id, name, version, file_path, file_size, is_active")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !ext || !ext.file_path) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("extension-files")
      .createSignedUrl(ext.file_path, 60 * 10, {
        download: `${ext.name} v${ext.version}.zip`,
      });

    if (signErr || !signed) {
      return new Response(JSON.stringify({ error: "sign failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: signed.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
