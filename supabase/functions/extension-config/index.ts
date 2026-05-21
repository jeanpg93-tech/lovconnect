import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseSvc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const url = new URL(req.url);
    const licenseKey = url.searchParams.get("license_key");

    if (!licenseKey) {
      return new Response(JSON.stringify({ error: "license_key is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Find the order/license to get reseller and extension info
    const { data: order, error: orderError } = await supabaseSvc
      .from("orders")
      .select("reseller_id, extension_id")
      .eq("license_key", licenseKey)
      .maybeSingle();

    if (orderError) throw orderError;
    if (!order) {
      return new Response(JSON.stringify({ error: "License not found or trial license" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get the customization for this reseller and extension
    const { data: customization, error: custError } = await supabaseSvc
      .from("extension_customizations")
      .select("*")
      .eq("reseller_id", order.reseller_id)
      .eq("extension_id", order.extension_id)
      .maybeSingle();

    if (custError) throw custError;

    // 3. Fallback if no customization found
    if (!customization) {
      // Return extension defaults if possible, or a generic response
      const { data: extension } = await supabaseSvc
        .from("extensions")
        .select("name")
        .eq("id", order.extension_id)
        .maybeSingle();

      return new Response(JSON.stringify({
        display_name: extension?.name || "Ferramenta",
        primary_color: "#7C3AED",
        secondary_color: "#F9FAFB",
        logo_url: null,
        favicon_url: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      display_name: customization.display_name,
      primary_color: customization.primary_color,
      secondary_color: customization.secondary_color,
      logo_url: customization.logo_url,
      favicon_url: customization.favicon_url,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
