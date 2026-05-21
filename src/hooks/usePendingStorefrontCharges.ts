import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Conta vendas da loja do revendedor logado que estão aguardando saldo
 * (status = 'awaiting_balance'). Mantém-se atualizado via realtime.
 */
export function usePendingStorefrontCharges() {
  const [count, setCount] = useState(0);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) {
        if (active) { setCount(0); setLoading(false); }
        return;
      }
      const { data: reseller } = await supabase
        .from("resellers")
        .select("id")
        .eq("user_id", uid)
        .maybeSingle();
      const rid = reseller?.id ?? null;
      if (!active) return;
      setResellerId(rid);
      if (!rid) {
        setCount(0);
        setLoading(false);
        return;
      }
      const { count: c } = await supabase
        .from("storefront_orders")
        .select("id", { head: true, count: "exact" })
        .eq("reseller_id", rid)
        .eq("status", "awaiting_balance");
      if (!active) return;
      setCount(c ?? 0);
      setLoading(false);
    };

    load();

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!resellerId) return;
    const channel = supabase
      .channel(`pending-charges-${resellerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "storefront_orders",
          filter: `reseller_id=eq.${resellerId}`,
        },
        async () => {
          const { count: c } = await supabase
            .from("storefront_orders")
            .select("id", { head: true, count: "exact" })
            .eq("reseller_id", resellerId)
            .eq("status", "awaiting_balance");
          setCount(c ?? 0);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [resellerId]);

  return { count, hasPending: count > 0, loading };
}