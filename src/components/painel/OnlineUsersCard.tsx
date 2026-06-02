import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";
import { ONLINE_WINDOW_MS } from "@/lib/path-labels";

/**
 * Card de "usuários online" no dashboard do gerente.
 * Considera online quem teve last_seen_at nos últimos 2 minutos.
 */
export default function OnlineUsersCard() {
  const [count, setCount] = useState<number | null>(null);
  const [resellers, setResellers] = useState<number>(0);

  const load = async () => {
    const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("user_presence")
      .select("user_id, last_seen_at")
      .gte("last_seen_at", since);
    if (error || !data) {
      setCount(0);
      return;
    }
    setCount(data.length);
    // Quebra extra: quantos são revendedores
    if (data.length > 0) {
      const ids = data.map((d) => d.user_id);
      const { data: rs } = await supabase
        .from("resellers")
        .select("user_id")
        .in("user_id", ids);
      setResellers((rs ?? []).length);
    } else {
      setResellers(0);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-card p-5 transition-all hover:scale-[1.02] hover:shadow-lg">
      <div className="absolute -right-6 -bottom-6 opacity-[0.08] group-hover:opacity-[0.15] transition-opacity pointer-events-none">
        <Users className="h-32 w-32 text-emerald-500" />
      </div>
      <div className="relative z-10 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Online agora
          </div>
          <div className="mt-2 font-display text-3xl font-black tracking-tighter text-foreground">
            {count ?? "—"}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {resellers} revendedor{resellers === 1 ? "" : "es"} ativo{resellers === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
          <Users className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}