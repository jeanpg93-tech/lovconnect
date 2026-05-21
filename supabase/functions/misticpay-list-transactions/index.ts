import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};


const MISTIC_BASE = "https://api.misticpay.com/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Check if user is manager (role = 'gerente' in user_roles)
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "gerente")
      .maybeSingle();

    if (!roleRow) {
      return json({ error: "Forbidden: Manager access only" }, 403);
    }

    const url = new URL(req.url);
    const page = url.searchParams.get("page") || "1";
    const status = url.searchParams.get("status");

    const ci = Deno.env.get("MISTICPAY_CLIENT_ID");
    const cs = Deno.env.get("MISTICPAY_CLIENT_SECRET");

    if (!ci || !cs) {
      return json({ error: "MisticPay credentials not configured" }, 500);
    }

    let endpoint = `${MISTIC_BASE}/users/transactions/list/${page}`;
    if (status && status !== "all") {
      endpoint += `?status=${status.toUpperCase()}`;
    }

    console.log(`Fetching MisticPay transactions from: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "ci": ci,
        "cs": cs,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("MisticPay API error:", data);
      return json({ error: data.message || "MisticPay API error", details: data }, response.status);
    }

    return json(data);
  } catch (e) {
    console.error("misticpay-list-transactions error:", e);
    return json({ error: e.message }, 500);
  }
});

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
