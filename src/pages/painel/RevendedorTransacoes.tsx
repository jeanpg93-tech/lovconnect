import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { 
  ArrowDownRight, 
  ArrowUpRight, 
  Gift, 
  Zap, 
  Loader2, 
  Search, 
  Calendar, 
  Filter,
  History,
  TrendingDown,
  TrendingUp,
  Key
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, startOfDay, isAfter, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

type Transaction = {
  id: string;
  reseller_id: string;
  kind: string;
  amount_cents: number;
  description: string | null;
  reference_id: string | null;
  created_at: string;
};

const KIND_META: Record<string, { label: string; cls: string; icon: any }> = {
  recharge:        { label: "Recargas",        cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",   icon: ArrowDownRight },
  credit_purchase: { label: "Recargas",        cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",   icon: ArrowDownRight },
  bonus:           { label: "Bônus",          cls: "bg-amber-500/10 text-amber-500 border-amber-500/20",       icon: Gift },
  affiliate_bonus: { label: "Indicação",      cls: "bg-amber-500/10 text-amber-500 border-amber-500/20",       icon: Gift },
  order_debit:     { label: "Chave",          cls: "bg-blue-500/10 text-blue-500 border-blue-500/20",          icon: Key },
  order:           { label: "Chave",          cls: "bg-blue-500/10 text-blue-500 border-blue-500/20",          icon: Key },
  api_debit:       { label: "Venda API",      cls: "bg-blue-500/10 text-blue-500 border-blue-500/20",          icon: Key },
  refund:          { label: "Estorno",        cls: "bg-sky-500/10 text-sky-500 border-sky-500/20",             icon: ArrowDownRight },
  panel_refund:    { label: "Estorno Painel", cls: "bg-sky-500/10 text-sky-500 border-sky-500/20",             icon: ArrowDownRight },
  credit_purchase_refund: { label: "Estorno", cls: "bg-sky-500/10 text-sky-500 border-sky-500/20",           icon: ArrowDownRight },
  license_purchase_refund:{ label: "Estorno Licença", cls: "bg-sky-500/10 text-sky-500 border-sky-500/20",   icon: ArrowDownRight },
  adjustment:      { label: "Ajuste Gerente", cls: "bg-violet-500/10 text-violet-500 border-violet-500/20",    icon: Zap },
  manual_credit:   { label: "Recarga Manual", cls: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: ArrowDownRight },
  manual_debit:    { label: "Débito Manual",  cls: "bg-rose-500/10 text-rose-500 border-rose-500/20",          icon: ArrowUpRight },
  claude_key_issue:  { label: "Venda Claude",   cls: "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/25",      icon: ClaudeIcon },
  claude_key_refund: { label: "Estorno Claude", cls: "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/25",      icon: ClaudeIcon },
  claude_key_issue_refund: { label: "Estorno Claude", cls: "bg-[#D97757]/10 text-[#D97757] border-[#D97757]/25", icon: ClaudeIcon },
};

const PLAN_LABEL: Record<string, string> = {
  "pro_30d":  "Pro · 30 dias",
  "5x_7d":    "Max 5X · 7 dias",
  "5x_30d":   "Max 5X · 30 dias",
  "20x_30d":  "Max 20X · 30 dias",
  "api_500k_30d": "Pro · 30 dias",
  "api_25m_30d": "Max 5X · 30 dias",
  "api_10m_30d": "Max 20X · 30 dias",
};

type ClaudeOrderMeta = {
  plan_code: string | null;
  customer_name: string | null;
  customer_whatsapp: string | null;
  origin: "loja" | "api";
};

function ClaudeOrderChips({ meta }: { meta: ClaudeOrderMeta }) {
  const chip = "inline-flex items-center gap-1 rounded-md border border-[#D97757]/25 bg-[#D97757]/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#D97757]";
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {meta.plan_code && (
        <span className={chip}>{PLAN_LABEL[meta.plan_code] ?? meta.plan_code}</span>
      )}
      <span className={chip}>{meta.origin === "loja" ? "Loja" : "API"}</span>
      {meta.customer_name && (
        <span className={chip}>👤 {meta.customer_name}</span>
      )}
      {meta.customer_whatsapp && (
        <span className={chip}>📱 {meta.customer_whatsapp}</span>
      )}
    </div>
  );
}

export default function RevendedorTransacoes() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [claudeOrders, setClaudeOrders] = useState<Record<string, ClaudeOrderMeta>>({});
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    
    const { data: reseller } = await supabase
      .from("resellers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!reseller) {
      setLoading(false);
      return;
    }
    setResellerId(reseller.id);

    const { data: txs } = await supabase
      .from("balance_transactions")
      .select("*")
      .eq("reseller_id", reseller.id)
      .order("created_at", { ascending: false });

    setTransactions(txs || []);

    // Enriquecer transações Claude com dados do pedido (plano, cliente, origem)
    const claudeRefs = Array.from(new Set(
      (txs || [])
        .filter((t: any) => t.kind === "claude_key_issue" || t.kind === "claude_key_refund" || t.kind === "claude_key_issue_refund")
        .map((t: any) => t.reference_id)
        .filter(Boolean)
    )) as string[];
    if (claudeRefs.length) {
      const { data: orders } = await supabase
        .from("claude_orders")
        .select("id, plan_code, customer_name, customer_whatsapp, provider_transaction_id")
        .in("id", claudeRefs);
      const map: Record<string, ClaudeOrderMeta> = {};
      (orders || []).forEach((o: any) => {
        map[o.id] = {
          plan_code: o.plan_code ?? null,
          customer_name: o.customer_name ?? null,
          customer_whatsapp: o.customer_whatsapp ?? null,
          origin: o.provider_transaction_id ? "loja" : "api",
        };
      });
      setClaudeOrders(map);
    } else {
      setClaudeOrders({});
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    if (resellerId) {
      const channel = supabase.channel(`tx-${resellerId}`)
        .on("postgres_changes", { 
          event: "INSERT", 
          schema: "public", 
          table: "balance_transactions", 
          filter: `reseller_id=eq.${resellerId}` 
        }, () => loadData())
        .subscribe();
      
      return () => { supabase.removeChannel(channel); };
    }
  }, [user, resellerId]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (typeFilter !== "all") {
        if (typeFilter === "manual" && !["adjustment", "manual_credit", "manual_debit"].includes(t.kind)) return false;
        if (typeFilter === "order" && !["order", "order_debit", "api_debit"].includes(t.kind)) return false;
        if (typeFilter === "bonus" && !["bonus", "affiliate_bonus"].includes(t.kind)) return false;
        if (typeFilter === "refund" && !["refund", "panel_refund", "credit_purchase_refund", "license_purchase_refund"].includes(t.kind)) return false;
        if (typeFilter !== "manual" && typeFilter !== "order" && typeFilter !== "bonus" && typeFilter !== "refund" && t.kind !== typeFilter) return false;
      }

      if (dateFilter !== "all") {
        const now = new Date();
        const txDate = new Date(t.created_at);
        if (dateFilter === "today" && txDate < startOfDay(now)) return false;
        if (dateFilter === "7days" && txDate < subDays(now, 7)) return false;
        if (dateFilter === "30days" && txDate < subDays(now, 30)) return false;
      }

      if (search.trim()) {
        const s = search.toLowerCase();
        return (t.description || "").toLowerCase().includes(s) || 
               KIND_META[t.kind]?.label.toLowerCase().includes(s);
      }

      return true;
    });
  }, [transactions, typeFilter, dateFilter, search]);

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const todayTxs = transactions.filter(t => isAfter(new Date(t.created_at), today));
    
    return {
      entradas: todayTxs.filter(t => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0),
      saidas: Math.abs(todayTxs.filter(t => t.amount_cents < 0).reduce((s, t) => s + t.amount_cents, 0)),
    };
  }, [transactions]);

  const formatBRL = (cents: number) => 
    (Math.abs(cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  return (
    <PageContainer>
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background backdrop-blur-md">
        <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por descrição..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white/5 border-white/10 w-full"
            />
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="flex-1 sm:w-[160px] bg-white/5 border-white/10">
                <Filter className="h-3.5 w-3.5 mr-2" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="recharge">Recargas PIX</SelectItem>
                <SelectItem value="order">Vendas / Pedidos</SelectItem>
                <SelectItem value="manual">Ajustes Gerente</SelectItem>
                <SelectItem value="bonus">Indicação & Bônus</SelectItem>
                <SelectItem value="refund">Estornos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="flex-1 sm:w-[160px] bg-white/5 border-white/10">
                <Calendar className="h-3.5 w-3.5 mr-2" />
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo o histórico</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/20 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
              <tr>
                <th className="px-6 py-4 text-left font-semibold">Data/Hora</th>
                <th className="px-6 py-4 text-left font-semibold">Tipo</th>
                <th className="px-6 py-4 text-left font-semibold">Descrição/Obs</th>
                <th className="px-6 py-4 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground italic">
                    Nenhuma transação encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const meta = KIND_META[t.kind] || { label: t.kind, cls: "bg-muted text-muted-foreground", icon: Zap };
                  const isPositive = t.amount_cents > 0;
                  
                  return (
                    <tr key={t.id} className="group hover:bg-white/5 transition-all">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{format(new Date(t.created_at), "dd/MM/yyyy")}</span>
                          <span className="text-[10px] text-muted-foreground/60 font-mono">{format(new Date(t.created_at), "HH:mm:ss")}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className={cn("gap-1.5 h-6 text-[10px] font-bold uppercase tracking-wider", meta.cls)}>
                          <meta.icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-[300px]">
                          <p className="text-foreground/90 font-medium leading-tight">
                            {t.description || "—"}
                          </p>
                          {(t.kind === "claude_key_issue" || t.kind === "claude_key_refund" || t.kind === "claude_key_issue_refund") && t.reference_id && claudeOrders[t.reference_id] && (
                            <ClaudeOrderChips meta={claudeOrders[t.reference_id]} />
                          )}
                          {t.reference_id && (
                            <div className="flex flex-col mt-0.5">
                              <span className="text-[9px] font-mono text-muted-foreground/40 block">Ref: {t.reference_id.split("-")[0]}</span>
                              {(t.kind === "refund" || t.kind === "panel_refund" || t.kind === "credit_purchase_refund" || t.kind === "license_purchase_refund") && (
                                <span className="text-[9px] font-mono text-primary/60 block font-bold uppercase italic">Pedido Original: {t.reference_id.split("-")[0]}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className={cn(
                          "font-mono font-black text-sm",
                          isPositive ? "text-emerald-500" : "text-rose-500"
                        )}>
                          {isPositive ? "+" : "-"} {formatBRL(t.amount_cents)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-white/5">
          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground italic">
              Nenhuma transação encontrada.
            </div>
          ) : (
            filtered.map((t) => {
              const meta = KIND_META[t.kind] || { label: t.kind, cls: "bg-muted text-muted-foreground", icon: Zap };
              const isPositive = t.amount_cents > 0;
              
              return (
                <div key={t.id} className="p-4 flex flex-col gap-3 hover:bg-white/5 transition-active active:scale-[0.98] transition-all">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={cn("gap-1.5 h-5 text-[9px] font-bold uppercase tracking-wider", meta.cls)}>
                      <meta.icon className="h-2.5 w-2.5" />
                      {meta.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {format(new Date(t.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <p className="text-foreground/90 font-medium leading-tight text-sm">
                        {t.description || "—"}
                      </p>
                      {(t.kind === "claude_key_issue" || t.kind === "claude_key_refund" || t.kind === "claude_key_issue_refund") && t.reference_id && claudeOrders[t.reference_id] && (
                        <ClaudeOrderChips meta={claudeOrders[t.reference_id]} />
                      )}
                      {t.reference_id && (
                        <div className="flex flex-col mt-1">
                          <span className="text-[9px] font-mono text-muted-foreground/40 block">Ref: {t.reference_id.split("-")[0]}</span>
                          {(t.kind === "refund" || t.kind === "panel_refund" || t.kind === "credit_purchase_refund" || t.kind === "license_purchase_refund") && (
                            <span className="text-[9px] font-mono text-primary/60 block font-bold uppercase italic">Pedido Original: {t.reference_id.split("-")[0]}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <span className={cn(
                        "font-mono font-black text-base",
                        isPositive ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {isPositive ? "+" : "-"} {formatBRL(t.amount_cents)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </PageContainer>
  );
}
