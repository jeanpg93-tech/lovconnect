import { useEffect, useState } from "react";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { PageContainer } from "@/components/painel/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, RefreshCw, Mail, User, AlertCircle, Activity } from "lucide-react";
import ClaudeIcon from "@/components/icons/ClaudeIcon";
import { cn } from "@/lib/utils";

type Order = {
  id: string;
  plan_code: string;
  status: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_whatsapp: string | null;
  created_at: string;
  sale_price_cents: number;
  provider_key_id: string | null;
  usage: null | {
    email: string;
    status?: string;
    accountExpiresAt?: string;
    redeemedAt?: string;
    tokensConsumed?: number;
    tokenLimit?: number;
    tokensInWindow?: number;
    tokenWindowHours?: number;
    dailyPercentUsed?: number;
    weeklyTokenLimit?: number;
    weeklyTokensInWindow?: number;
    percentRemaining?: number;
  };
};

const PLAN_LABELS: Record<string, string> = {
  "5x_7d": "5x · 7 dias",
  "5x_30d": "5x · 30 dias",
  "20x_30d": "20x · 30 dias",
};

const fmtTokens = (n?: number | null) => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(".", ",")} Mi`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} Mil`;
  return String(n);
};

export default function RevendedorMeusClientesClaude() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    const { data, error } = await invokeAuthenticatedFunction<any>("claude-customers-usage", { method: "GET" });
    if (!error && data?.orders) {
      setOrders(data.orders);
      setProviderError(data.provider_error ?? null);
    } else if ((data as any)?.error) {
      setProviderError((data as any).error);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
    const i = setInterval(() => load(true), 60_000);
    return () => clearInterval(i);
  }, []);

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.customer_name ?? "").toLowerCase().includes(q) ||
      (o.customer_email ?? "").toLowerCase().includes(q) ||
      (o.customer_whatsapp ?? "").toLowerCase().includes(q) ||
      (PLAN_LABELS[o.plan_code] ?? o.plan_code).toLowerCase().includes(q)
    );
  });

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <PageContainer>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight">Meus Clientes Claude</h1>
          <p className="text-xs text-muted-foreground mt-1">Consumo de tokens em tempo real do fornecedor (atualiza a cada 60s).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      {providerError && (
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          Não foi possível ler o consumo no fornecedor agora ({providerError}). Os dados das vendas continuam exibidos.
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail, WhatsApp ou plano…"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
          Nenhuma venda Claude encontrada.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((o) => {
            const pct = o.usage?.tokenLimit
              ? Math.min(100, Math.round(((o.usage.tokensInWindow ?? 0) * 100) / o.usage.tokenLimit))
              : null;
            const noEmail = !o.customer_email;
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ClaudeIcon className="h-4 w-4 text-primary" />
                      <span className="font-display text-sm font-semibold">{PLAN_LABELS[o.plan_code] ?? o.plan_code}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[12px] text-foreground/80 truncate">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="truncate">{o.customer_name ?? "Sem nome"}</span>
                    </div>
                    {o.customer_email && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{o.customer_email}</span>
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] font-bold uppercase shrink-0">
                    {o.status}
                  </Badge>
                </div>

                {noEmail ? (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
                    Sem e-mail cadastrado — não é possível ligar ao consumo do fornecedor. Cadastre o e-mail nas próximas emissões.
                  </div>
                ) : o.usage ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3 w-3" /> Janela {o.usage.tokenWindowHours ?? 12}h
                      </span>
                      <span className="font-semibold">
                        {fmtTokens(o.usage.tokensInWindow)} / {fmtTokens(o.usage.tokenLimit)}
                      </span>
                    </div>
                    {pct != null && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
                        <div
                          className={cn(
                            "h-full transition-all",
                            pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                      <div>Total consumido: <span className="font-semibold text-foreground">{fmtTokens(o.usage.tokensConsumed)}</span></div>
                      <div>Semana: <span className="font-semibold text-foreground">{fmtTokens(o.usage.weeklyTokensInWindow)} / {fmtTokens(o.usage.weeklyTokenLimit)}</span></div>
                      {o.usage.accountExpiresAt && (
                        <div className="col-span-2">Expira: <span className="font-semibold text-foreground">{new Date(o.usage.accountExpiresAt).toLocaleString("pt-BR")}</span></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
                    Cliente ainda não resgatou ou e-mail não encontrado no fornecedor.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}