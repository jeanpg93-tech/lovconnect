import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type Row = {
  id: string;
  status: string;
  expires_at: string | null;
  extensions: { name: string; description: string | null; version: string } | null;
};

export default function ClienteExtensoes() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("client_extensions")
        .select("id,status,expires_at,extensions(name,description,version)")
        .eq("client_id", user.id);
      setRows((data ?? []) as any);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div>
      <PageHeader title="Meus Produtos" description="Suas licenças ativas e expiradas." />
      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Você ainda não possui extensões. Fale com seu revendedor.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const active = r.status === "active";
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm">
                <div className="flex items-start justify-between">
                  <h3 className="font-display font-semibold">{r.extensions?.name ?? "—"}</h3>
                  {active
                    ? <CheckCircle2 className="h-4 w-4 text-primary" />
                    : <AlertCircle className="h-4 w-4 text-muted-foreground" />}
                </div>
                {r.extensions?.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{r.extensions.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-mono">v{r.extensions?.version}</span>
                  <span className="capitalize">{r.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
