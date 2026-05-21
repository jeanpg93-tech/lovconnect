import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, StatCard } from "@/components/painel/PageHeader";
import { Package, Store } from "lucide-react";

export default function ClienteDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ ext: 0, resellerName: "—" });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: ext }, { data: prof }] = await Promise.all([
        supabase.from("client_extensions").select("*", { count: "exact", head: true }).eq("client_id", user.id),
        supabase.from("profiles").select("reseller_id, resellers(display_name)").eq("id", user.id).maybeSingle(),
      ]);
      setStats({
        ext: ext ?? 0,
        resellerName: (prof as any)?.resellers?.display_name ?? "—",
      });
    })();
  }, [user]);

  return (
    <div>
      <PageHeader title="Bem-vindo" description="Acesse e gerencie suas extensões." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Minhas extensões" value={stats.ext} icon={Package} />
        <StatCard label="Meu revendedor" value={stats.resellerName} icon={Store} />
      </div>
    </div>
  );
}
