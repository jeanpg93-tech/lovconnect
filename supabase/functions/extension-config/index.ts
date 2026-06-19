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
    let { data: customization, error: custError } = await supabaseSvc
      .from("extension_customizations")
      .select("*")
      .eq("reseller_id", order.reseller_id)
      .eq("extension_id", order.extension_id)
      .maybeSingle();

    if (custError) throw custError;

    if (!customization) {
      const { data: template, error: tplError } = await supabaseSvc
        .from("extension_customizations")
        .select("*")
        .eq("extension_id", order.extension_id)
        .eq("is_template", true)
        .maybeSingle();
      if (tplError) throw tplError;
      customization = template;
    }

    // 3. Fallback if no customization found
    if (!customization) {
      // Return extension defaults if possible, or a generic response
      const { data: extension } = await supabaseSvc
        .from("extensions")
        .select("name")
        .eq("id", order.extension_id)
        .maybeSingle();

      return new Response(JSON.stringify({
        display_name: extension?.name || "LovConnect",
        brand_name: extension?.name || "LovConnect",
        manifest_name: extension?.name || "LovConnect",
        primary_color: "#ff1010",
        color_primary: "#ff1010",
        secondary_color: "#ff3b30",
        color_secondary: "#ff3b30",
        logo_url: null,
        logo_rect_url: null,
        logo_square_url: null,
        favicon_url: null,
        icon_16_url: null,
        icon_32_url: null,
        icon_48_url: null,
        icon_128_url: null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      display_name: customization.brand_name || customization.manifest_name,
      brand_name: customization.brand_name || customization.manifest_name,
      manifest_name: customization.manifest_name || customization.brand_name,
      manifest_description: customization.manifest_description,
      window_title: customization.window_title,
      primary_color: customization.color_primary,
      color_primary: customization.color_primary,
      color_primary_hover: customization.color_primary_hover,
      secondary_color: customization.color_secondary,
      color_secondary: customization.color_secondary,
      logo_url: customization.logo_rect_url || customization.logo_square_url,
      logo_rect_url: customization.logo_rect_url,
      logo_square_url: customization.logo_square_url,
      favicon_url: customization.icon_128_url || customization.icon_48_url || customization.icon_32_url || customization.icon_16_url,
      icon_16_url: customization.icon_16_url,
      icon_32_url: customization.icon_32_url,
      icon_48_url: customization.icon_48_url,
      icon_128_url: customization.icon_128_url,
      support_url: customization.support_url,
      community_url: customization.community_url,
      footer_text: customization.footer_text,
      license_title: customization.license_title,
      license_description: customization.license_description,
      license_placeholder: customization.license_placeholder,
      license_button_text: customization.license_button_text,
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
