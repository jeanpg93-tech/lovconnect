import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Loader2, Package, TrendingDown, ShoppingBag } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

const formatDateTime = (s: string | null) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("pt-BR"); } catch { return s; }
};

const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((c || 0) / 100);

type Ledger = { id: string; kind: string; delta_credits: number; description: string | null; created_at: string };
type Purchase = { id: string; pack_name: string | null; credits: number; price_cents: number; status: string; created_at: string; paid_at: string | null };

export default function RevendedorHistoricoPacote() {
  const { user } = useAuth();
  const { packCredits } = useRole();
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      const rid = (r as any)?.id;
      if (!rid) { setLoading(false); return; }
      const [l, p] = await Promise.all([
        supabase.from("reseller_pack_ledger" as any).select("*").eq("reseller_id", rid).order("created_at", { ascending: false }).limit(200),
        supabase.from("reseller_pack_purchases" as any).select("*").eq("reseller_id", rid).order("created_at", { ascending: false }).limit(50),
      ]);
      setLedger(((l.data as any) ?? []) as Ledger[]);
      setPurchases(((p.data as any) ?? []) as Purchase[]);
      setLoading(false);
    })();
  }, [user?.id]);

  const totalPurchased = ledger.reduce((sum, l) => sum + (l.delta_credits > 0 ? l.delta_credits : 0), 0);
  const totalUsed = ledger.reduce((sum, l) => sum + (l.delta_credits < 0 ? -l.delta_credits : 0), 0);

  return (
    <PageContainer>
      <PageHeader title="Histórico de Pacote" description="Suas compras e movimentações de licenças" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
          <Package className="h-5 w-5 text-primary" />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Licenças restantes</div>
            <div className="font-mono text-2xl font-black text-primary">{packCredits}</div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/60 px-4 py-3 flex items-center gap-3">
          <TrendingDown className="h-5 w-5 text-rose-500" />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Licenças usadas</div>
            <div className="font-mono text-2xl font-black">{totalUsed}</div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/60 px-4 py-3 flex items-center gap-3">
          <ShoppingBag className="h-5 w-5 text-emerald-500" />
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Licenças compradas</div>
            <div className="font-mono text-2xl font-black">{totalPurchased}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr,1.2fr]">
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <h3 className="font-display text-sm font-semibold mb-3">Compras</h3>
            {purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma compra ainda.</p>
            ) : (
              <div className="space-y-2">
                {purchases.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2">
                    <div>
                      <div className="font-medium text-sm">{p.pack_name ?? "—"} · {p.credits} licenças</div>
                      <div className="text-[11px] text-muted-foreground">{formatDateTime(p.paid_at ?? p.created_at)} · {p.status}</div>
                    </div>
                    <div className="font-mono text-sm">{brl(p.price_cents)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card/60 p-5">
            <h3 className="font-display text-sm font-semibold mb-3">Movimentações</h3>
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem movimentações.</p>
            ) : (
              <div className="space-y-1 max-h-[480px] overflow-y-auto">
                {ledger.map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2 text-xs">
                    <div>
                      <div className="font-medium">{l.description ?? l.kind}</div>
                      <div className="text-muted-foreground">{formatDateTime(l.created_at)} · {l.kind}</div>
                    </div>
                    <div className={cn("font-mono font-bold", l.delta_credits > 0 ? "text-emerald-500" : "text-rose-500")}>
                      {l.delta_credits > 0 ? "+" : ""}{l.delta_credits}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}