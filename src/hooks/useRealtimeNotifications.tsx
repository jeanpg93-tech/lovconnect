import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { notify } from "@/lib/notify";
import { toast } from "sonner";

/**
 * Escuta eventos do Supabase em tempo real e dispara notificações
 * nativas (com som) + toast in-app para o usuário logado.
 */
export function useRealtimeNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          const a: any = payload.new;
          notify(`📢 ${a.title ?? "Novo aviso"}`, a.content?.slice(0, 140), { tag: `ann-${a.id}` });
          toast.message(a.title ?? "Novo aviso", { description: a.content?.slice(0, 140) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
