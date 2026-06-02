import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { SalesStatusBadge } from "@/components/painel/SalesStatusBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft, Plus, Minus, Package, TrendingDown, ShoppingBag, Ban, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((c || 0) / 100);

const formatDateTime = (s: string | null) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("pt-BR"); } catch { return s; }
};

type Reseller = { id: string; display_name: string; user_id: string; billing_mode: string | null; pack_sales_disabled: boolean | null; delivery_source: string | null };
type Balance = { credits: number };
type Purchase = {
  id: string; pack_name: string | null; credits: number; price_cents: number;
  status: string; provider: string | null; created_at: string; paid_at: string | null;
  notes: string | null;
};
type LedgerRow = {
  id: string; kind: string; delta_credits: number; description: string | null;
  created_at: string;
};

const statusBadge = (s: string) => {
  const m: Record<string, { l: string; c: string }> = {
    pending: { l: "Pendente", c: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
    paid: { l: "Pago", c: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    manual: { l: "Manual", c: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
    cancelled: { l: "Cancelado", c: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  };
  const x = m[s] ?? m.pending;
  return <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", x.c)}>{x.l}</span>;
};

export default function GerenteRevendedorPacote() {
  const params = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const id = params.id ?? pathname.match(/\/revendedores\/([^/]+)\/pacote/)?.[1];
  const navigate = useNavigate();

  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditQty, setCreditQty] = useState<number>(10);
  const [creditDesc, setCreditDesc] = useState("");
  const [debitQty, setDebitQty] = useState<number>(1);
  const [debitDesc, setDebitDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [togglingSales, setTogglingSales] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [r, b, p, l] = await Promise.all([
      supabase.from("resellers").select("id, display_name, user_id, billing_mode, pack_sales_disabled, delivery_source").eq("id", id).maybeSingle(),
      supabase.from("reseller_pack_balances" as any).select("credits").eq("reseller_id", id).maybeSingle(),
      supabase.from("reseller_pack_purchases" as any).select("*").eq("reseller_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("reseller_pack_ledger" as any).select("*").eq("reseller_id", id).order("created_at", { ascending: false }).limit(100),
    ]);
    setReseller((r.data as any) ?? null);
    setBalance((b.data as any) ?? { credits: 0 });
    setPurchases(((p.data as any) ?? []) as Purchase[]);
    setLedger(((l.data as any) ?? []) as LedgerRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const changeMode = async (mode: string) => {
    if (!id) return;
    setSavingMode(true);
    const { error } = await invokeAuthenticatedFunction("pack-admin-adjust", {
      method: "POST",
      body: { action: "set_billing_mode", reseller_id: id, mode },
    });
    setSavingMode(false);
    if (error) return toast.error((error as any).message ?? "Falha");
    toast.success("Modo atualizado");
    load();
  };

  const credit = async () => {
    if (!id || !Number.isInteger(creditQty) || creditQty <= 0) return toast.error("Quantidade inválida");
    setBusy(true);
    const { data, error } = await invokeAuthenticatedFunction("pack-admin-adjust", {
      method: "POST",
      body: { action: "credit", reseller_id: id, credits: creditQty, description: creditDesc || undefined },
    });
    setBusy(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error ?? "Falha");
    toast.success(`+${creditQty} licenças`);
    setCreditDesc("");
    load();
  };

  const debit = async () => {
    if (!id || !Number.isInteger(debitQty) || debitQty <= 0) return toast.error("Quantidade inválida");
    setBusy(true);
    const { data, error } = await invokeAuthenticatedFunction("pack-admin-adjust", {
      method: "POST",
      body: { action: "debit", reseller_id: id, credits: debitQty, description: debitDesc || undefined },
    });
    setBusy(false);
    if (error || (data as any)?.error) return toast.error((data as any)?.error ?? "Falha");
    toast.success(`-${debitQty} licenças`);
    setDebitDesc("");
    load();
  };

  const toggleSalesDisabled = async () => {
    if (!reseller) return;
    const next = !reseller.pack_sales_disabled;
    if (next && !confirm("Desativar as vendas deste revendedor Pack? Ele verá um aviso no Dashboard.")) return;
    setTogglingSales(true);
    const { error } = await supabase.from("resellers")
      .update({ pack_sales_disabled: next })
      .eq("id", reseller.id);
    setTogglingSales(false);
    if (error) { toast.error((error as any).message ?? "Falha"); return; }
    toast.success(next ? "Vendas desativadas" : "Vendas reativadas");
    setReseller({ ...reseller, pack_sales_disabled: next });
  };

  if (loading) {
    return (
      <PageContainer><div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div></PageContainer>
    );
  }

  if (!reseller) {
    return (
      <PageContainer>
        <p className="text-center text-sm text-muted-foreground">Revendedor não encontrado.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Button variant="ghost" size="sm" onClick={() => navigate("/painel/gerente/revendedores")} className="mb-3">
        <ArrowLeft className="h-4 w-4 mr-1" /> Revendedores
      </Button>
      <PageHeader
        title={`Packs — ${reseller.display_name}`}
        description="Licenças do revendedor, compras e ajustes manuais"
      />

      {(() => {
        const totalPurchased = ledger.reduce((s, l) => s + (l.delta_credits > 0 ? l.delta_credits : 0), 0);
        const totalUsed = ledger.reduce((s, l) => s + (l.delta_credits < 0 ? -l.delta_credits : 0), 0);
        return (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">Licenças restantes</div>
                <div className="font-mono text-2xl font-black text-primary">{balance?.credits ?? 0}</div>
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
        );
      })()}

      {reseller.billing_mode === "pack" && (
        <div className="mt-6 rounded-2xl border border-border bg-card/60 p-4 md:p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 min-w-0 space-y-2">
            <SalesStatusBadge
              variant={reseller.pack_sales_disabled ? "manager_disabled" : "active"}
            />
            <p className="text-xs text-muted-foreground">
              Suspenda ou libere as vendas Pack deste revendedor. Quando desativado, ele verá um aviso no Dashboard.
            </p>
          </div>
          <Button
            variant={reseller.pack_sales_disabled ? "default" : "destructive"}
            onClick={toggleSalesDisabled}
            disabled={togglingSales}
            className="gap-2 shrink-0"
          >
            {togglingSales && <Loader2 className="h-4 w-4 animate-spin" />}
            {reseller.pack_sales_disabled ? (
              <><Play className="h-4 w-4" /> Ativar vendas</>
            ) : (
              <><Ban className="h-4 w-4" /> Desativar vendas</>
            )}
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr,1fr]">
        {/* Modo */}
        <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Modo de cobrança</div>
            <Badge variant="outline">modo atual: {reseller.billing_mode ?? "normal"}</Badge>
          </div>

          <div>
            <Label className="text-xs">Alterar modo de cobrança</Label>
            <div className="mt-1 flex items-center gap-2">
              <Select value={reseller.billing_mode ?? "normal"} onValueChange={changeMode} disabled={savingMode}>
                <SelectTrigger className="max-w-[240px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal (saldo em R$)</SelectItem>
                  <SelectItem value="subscription">Mensalista</SelectItem>
                  <SelectItem value="pack">Pack (licenças)</SelectItem>
                </SelectContent>
              </Select>
              {savingMode && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          </div>
        </div>

        {/* Ajustes */}
        <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
          <div>
            <Label className="text-xs flex items-center gap-1 mb-1"><Plus className="h-3 w-3 text-emerald-500" /> Adicionar licenças manualmente</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} value={creditQty} onChange={(e) => setCreditQty(Number(e.target.value))} className="max-w-[100px]" />
              <Input value={creditDesc} onChange={(e) => setCreditDesc(e.target.value)} placeholder="Descrição (opcional)" />
              <Button onClick={credit} disabled={busy}>Adicionar</Button>
            </div>
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1 mb-1"><Minus className="h-3 w-3 text-rose-500" /> Remover licenças manualmente</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} value={debitQty} onChange={(e) => setDebitQty(Number(e.target.value))} className="max-w-[100px]" />
              <Input value={debitDesc} onChange={(e) => setDebitDesc(e.target.value)} placeholder="Descrição (opcional)" />
              <Button variant="destructive" onClick={debit} disabled={busy}>Remover</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Compras */}
      <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
        <h3 className="font-display text-sm font-semibold mb-3">Compras</h3>
        {purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma compra ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr><th className="py-2">Data</th><th>Pacote</th><th>Licenças</th><th>Valor</th><th>Status</th></tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} className="border-t border-border/40">
                    <td className="py-2 text-xs text-muted-foreground">{formatDateTime(p.paid_at ?? p.created_at)}</td>
                    <td className="font-medium">{p.pack_name ?? "—"}</td>
                    <td className="font-mono">{p.credits}</td>
                    <td className="font-mono">{brl(p.price_cents)}</td>
                    <td>{statusBadge(p.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
        <h3 className="font-display text-sm font-semibold mb-3">Extrato de licenças</h3>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem movimentações.</p>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
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
    </PageContainer>
  );
}