import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supaUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supaUrl, service);
    const { data: reseller } = await admin
      .from("resellers")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!reseller) {
      return new Response(JSON.stringify({ error: "not_a_reseller" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integ } = await admin
      .from("reseller_integrations")
      .select("misticpay_enabled, misticpay_client_id, misticpay_client_secret")
      .eq("reseller_id", reseller.id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        misticpay_enabled: !!integ?.misticpay_enabled,
        misticpay_client_id: integ?.misticpay_client_id ?? "",
        misticpay_client_secret: integ?.misticpay_client_secret ?? "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});