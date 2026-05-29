import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Loader2, QrCode, Copy, AlertTriangle, AlertCircle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const formatBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);

const formatDate = (s: string | null) => {
  if (!s) return "—";
  try { return new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR"); }
  catch { return s; }
};

const daysUntil = (s: string) => {
  try {
    const d = new Date(s + "T12:00:00").getTime();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((d - today.getTime()) / 86400000);
  } catch { return 999; }
};

type Charge = {
  id: string; kind: string; description: string | null;
  amount_cents: number; due_date: string; status: string;
  pix_payload: string | null; pix_qr_base64: string | null;
  paid_at: string | null; cancelled_at: string | null;
  is_onboarding: boolean | null; created_at: string;
};

const kindLabel = (k: string) =>
  k === "monthly" ? "Mensalidade" : k === "installment" ? "Parcela" : "Avulsa";

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
    paid: { label: "Paga", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    overdue: { label: "Vencida", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
    cancelled: { label: "Cancelada", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  };
  const m = map[status] ?? map.pending;
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", m.cls)}>{m.label}</span>;
};

export default function RevendedorCobrancas() {
  const { user } = useAuth();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [pixCharge, setPixCharge] = useState<Charge | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase
      .from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    const { data } = await supabase
      .from("reseller_subscription_charges")
      .select("*")
      .eq("reseller_id", (r as any).id)
      .order("created_at", { ascending: false });
    setCharges((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-charges-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_subscription_charges" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const copy = (txt: string | null) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    toast.success("PIX copiado!");
  };

  // Top alert: most urgent pending charge
  const alert = useMemo(() => {
    const opens = charges.filter((c) => c.status === "pending" || c.status === "overdue");
    if (opens.length === 0) return null;
    const overdue = opens.find((c) => c.status === "overdue" || daysUntil(c.due_date) < 0);
    if (overdue) return { kind: "overdue" as const, charge: overdue };
    const soon = opens
      .map((c) => ({ c, d: daysUntil(c.due_date) }))
      .filter((x) => x.d <= 5)
      .sort((a, b) => a.d - b.d)[0];
    if (soon) return { kind: "warning" as const, charge: soon.c, days: soon.d };
    return null;
  }, [charges]);

  const totals = useMemo(() => {
    let pending = 0, paid = 0;
    for (const c of charges) {
      if (c.status === "pending" || c.status === "overdue") pending += c.amount_cents;
      if (c.status === "paid") paid += c.amount_cents;
    }
    return { pending, paid };
  }, [charges]);

  return (
    <PageContainer>
      <PageHeader title="Minhas Cobranças" description="Suas mensalidades e parcelas" />

      {alert && (
        <div className={cn(
          "mb-5 rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3",
          alert.kind === "overdue"
            ? "border-rose-500/40 bg-rose-500/10"
            : "border-amber-500/40 bg-amber-500/10",
        )}>
          {alert.kind === "overdue" ? <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" /> : <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />}
          <div className="flex-1 text-sm">
            <p className={cn("font-bold", alert.kind === "overdue" ? "text-rose-300" : "text-amber-300")}>
              {alert.kind === "overdue"
                ? `Cobrança vencida — ${formatBRL(alert.charge.amount_cents)}`
                : `Vence em ${alert.days} dia${alert.days === 1 ? "" : "s"} — ${formatBRL(alert.charge.amount_cents)}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {alert.charge.description ?? kindLabel(alert.charge.kind)} · vencimento {formatDate(alert.charge.due_date)}
            </p>
          </div>
          {alert.charge.pix_payload && (
            <Button size="sm" onClick={() => setPixCharge(alert.charge)} className="gap-2 w-full sm:w-auto">
              <QrCode className="h-4 w-4" /> Pagar agora
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-[10px] uppercase font-bold tracking-widest text-amber-500">Em aberto</p>
          <p className="font-mono text-xl font-black text-amber-400 mt-1">{formatBRL(totals.pending)}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Pago</p>
          <p className="font-mono text-xl font-black text-emerald-400 mt-1">{formatBRL(totals.paid)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : charges.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma cobrança ainda.</div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/60">
                  <tr>
                    <th className="px-6 py-3 text-left">Tipo</th>
                    <th className="px-6 py-3 text-left">Descrição</th>
                    <th className="px-6 py-3 text-right">Valor</th>
                    <th className="px-6 py-3 text-left">Vencimento</th>
                    <th className="px-6 py-3 text-left">Status</th>
                    <th className="px-6 py-3 text-center">Pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {charges.map((c) => (
                    <tr key={c.id} className="hover:bg-white/5">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">{kindLabel(c.kind)}</span>
                          {c.is_onboarding && <Badge variant="outline" className="text-[9px]">Onboarding</Badge>}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground/80 max-w-xs truncate">{c.description ?? "—"}</td>
                      <td className="px-6 py-3 text-right font-mono font-bold">{formatBRL(c.amount_cents)}</td>
                      <td className="px-6 py-3 text-muted-foreground/80">{formatDate(c.due_date)}</td>
                      <td className="px-6 py-3">{statusBadge(c.status)}</td>
                      <td className="px-6 py-3 text-center">
                        {(c.status === "pending" || c.status === "overdue") && c.pix_payload && (
                          <Button size="sm" variant="secondary" onClick={() => setPixCharge(c)} className="gap-2">
                            <QrCode className="h-4 w-4" /> PIX
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-white/5">
              {charges.map((c) => (
                <div key={c.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{kindLabel(c.kind)}</span>
                        {c.is_onboarding && <Badge variant="outline" className="text-[9px]">Onboarding</Badge>}
                      </div>
                      {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(c.due_date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-primary">{formatBRL(c.amount_cents)}</p>
                      <div className="mt-1">{statusBadge(c.status)}</div>
                    </div>
                  </div>
                  {(c.status === "pending" || c.status === "overdue") && c.pix_payload && (
                    <Button size="sm" className="w-full gap-2" onClick={() => setPixCharge(c)}>
                      <QrCode className="h-4 w-4" /> Pagar com PIX
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!pixCharge} onOpenChange={(v) => !v && setPixCharge(null)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>PIX — {pixCharge && formatBRL(pixCharge.amount_cents)}</DialogTitle>
            <DialogDescription>{pixCharge?.description ?? ""}</DialogDescription>
          </DialogHeader>
          {pixCharge?.pix_qr_base64 && (
            <div className="flex justify-center">
              <img
                src={pixCharge.pix_qr_base64.startsWith("data:") ? pixCharge.pix_qr_base64 : `data:image/png;base64,${pixCharge.pix_qr_base64}`}
                alt="QR Code PIX"
                className="w-full max-w-[280px] aspect-square mx-auto rounded-lg bg-white p-2"
              />
            </div>
          )}
          {pixCharge?.pix_payload && (
            <div className="space-y-2">
              <Label className="text-xs">Copia e cola</Label>
              <div className="flex gap-2">
                <Input value={pixCharge.pix_payload} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="secondary" onClick={() => copy(pixCharge.pix_payload)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPixCharge(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}