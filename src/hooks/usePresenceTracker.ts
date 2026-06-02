import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const PING_INTERVAL_MS = 45_000;

/**
 * Mantém o registro public.user_presence atualizado com a página atual
 * e horário da última atividade do usuário autenticado.
 */
export function usePresenceTracker() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const send = async (path: string) => {
      try {
        await supabase.from("user_presence").upsert(
          {
            user_id: user.id,
            current_path: path,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      } catch {
        // silencioso
      }
    };

    // Atualiza imediatamente na rota atual
    lastPathRef.current = pathname;
    send(pathname);

    // Heartbeat enquanto a aba estiver ativa
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        send(lastPathRef.current ?? pathname);
      }
    }, PING_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        send(lastPathRef.current ?? pathname);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pathname]);
}