import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { ArrowLeft, Plus, Loader2, Copy, Ban, CheckCircle2, QrCode, Calendar, Repeat, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const formatBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);

const formatDate = (s: string | null) => {
  if (!s) return "—";
  try {
    return new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR");
  } catch { return s; }
};

type Reseller = {
  id: string; display_name: string; user_id: string;
  billing_mode: string | null;
  subscription_blocked: boolean | null;
  subscription_onboarding_completed: boolean | null;
};

type Charge = {
  id: string; reseller_id: string; kind: string; description: string | null;
  amount_cents: number; due_date: string; status: string;
  provider: string | null; provider_charge_id: string | null;
  pix_payload: string | null; pix_qr_base64: string | null;
  paid_at: string | null; cancelled_at: string | null;
  is_onboarding: boolean | null; created_at: string;
};

type Recurrence = {
  id: string; reseller_id: string; amount_cents: number; day_of_month: number;
  description: string | null; warning_days_before: number;
  is_active: boolean; next_generation_date: string | null;
};

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

const kindLabel = (k: string) => k === "monthly" ? "Mensalidade" : k === "installment" ? "Parcela" : "Avulsa";

export default function GerenteRevendedorMensalidade() {
  const params = useParams<{ id: string }>();
  const { pathname } = useLocation();
  // PanelRoutes renders this component outside of a <Route> with the :id pattern,
  // so useParams returns {}. Fall back to parsing the id from the pathname.
  const id =
    params.id ??
    pathname.match(/\/revendedores\/([^/]+)\/mensalidade/)?.[1];
  const navigate = useNavigate();
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);

  // New charge dialog
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<string>("monthly");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [description, setDescription] = useState("");
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [creating, setCreating] = useState(false);

  // PIX view dialog
  const [pixCharge, setPixCharge] = useState<Charge | null>(null);

  // Recurrence dialog
  const [recOpen, setRecOpen] = useState(false);
  const [recAmount, setRecAmount] = useState("");
  const [recDay, setRecDay] = useState("3");
  const [recDesc, setRecDesc] = useState("Mensalidade");
  const [recWarn, setRecWarn] = useState("5");
  const [recSaving, setRecSaving] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: r }, { data: c }, { data: rec }] = await Promise.all([
      supabase.from("resellers").select("id, display_name, user_id, billing_mode, subscription_blocked, subscription_onboarding_completed").eq("id", id).maybeSingle(),
      supabase.from("reseller_subscription_charges").select("*").eq("reseller_id", id).order("created_at", { ascending: false }),
      supabase.from("reseller_subscription_recurrences").select("*").eq("reseller_id", id).order("created_at", { ascending: false }),
    ]);
    setReseller(r as any);
    setCharges((c ?? []) as any);
    setRecurrences((rec ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Realtime: refresh on charge changes
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`sub-charges-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_subscription_charges", filter: `reseller_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_subscription_recurrences", filter: `reseller_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const computeNextGeneration = (dom: number): string => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();
    const todayDay = today.getDate();
    let target = new Date(y, m, dom);
    if (dom <= todayDay) target = new Date(y, m + 1, dom);
    return target.toISOString().slice(0, 10);
  };

  const submitRecurrence = async () => {
    if (!reseller) return;
    const cents = Math.round(parseFloat(recAmount.replace(",", ".")) * 100);
    const dom = parseInt(recDay, 10);
    const warn = parseInt(recWarn, 10);
    if (!Number.isFinite(cents) || cents < 100) { toast.error("Valor inválido"); return; }
    if (!Number.isInteger(dom) || dom < 1 || dom > 28) { toast.error("Dia deve estar entre 1 e 28"); return; }
    setRecSaving(true);
    const { error } = await supabase.from("reseller_subscription_recurrences").insert({
      reseller_id: reseller.id,
      amount_cents: cents,
      day_of_month: dom,
      description: recDesc || "Mensalidade",
      warning_days_before: Number.isFinite(warn) ? warn : 5,
      is_active: true,
      next_generation_date: computeNextGeneration(dom),
    });
    setRecSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Recorrência criada");
    setRecOpen(false);
    setRecAmount(""); setRecDay("3"); setRecDesc("Mensalidade"); setRecWarn("5");
    load();
  };

  const toggleRecurrence = async (r: Recurrence) => {
    const { error } = await supabase.from("reseller_subscription_recurrences")
      .update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success(r.is_active ? "Pausada" : "Ativada"); load(); }
  };

  const deleteRecurrence = async (r: Recurrence) => {
    if (!confirm("Excluir esta recorrência? As cobranças já geradas serão mantidas.")) return;
    const { error } = await supabase.from("reseller_subscription_recurrences").delete().eq("id", r.id);
    if (error) toast.error(error.message); else { toast.success("Excluída"); load(); }
  };

  const toggleBillingMode = async (checked: boolean) => {
    if (!reseller) return;
    setSavingMode(true);
    const newMode = checked ? "subscription" : "normal";
    const patch: any = { billing_mode: newMode };
    // Initial blocked state when enabling subscription and onboarding not yet completed
    if (checked && !reseller.subscription_onboarding_completed) patch.subscription_blocked = true;
    if (!checked) { patch.subscription_blocked = false; patch.subscription_blocked_at = null; }
    const { error } = await supabase.from("resellers").update(patch).eq("id", reseller.id);
    if (error) toast.error(error.message); else {
      toast.success(checked ? "Modo Mensalista ativado" : "Modo Mensalista desativado");
      setReseller({ ...reseller, ...patch });
    }
    setSavingMode(false);
  };

  const submitCharge = async () => {
    if (!reseller) return;
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 100) { toast.error("Valor inválido"); return; }
    if (!dueDate) { toast.error("Vencimento obrigatório"); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("subscription-create-charge", {
      body: {
        reseller_id: reseller.id,
        kind,
        amount_cents: cents,
        due_date: dueDate,
        description: description || (kind === "monthly" ? "Mensalidade" : kind === "installment" ? "Parcela" : "Cobrança avulsa"),
        is_onboarding: isOnboarding,
      },
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Erro ao criar cobrança");
      return;
    }
    toast.success("Cobrança criada com PIX");
    setOpen(false);
    setAmount(""); setDescription(""); setIsOnboarding(false);
    await load();
    const newCharge = charges.find(c => c.id === (data as any).charge_id);
    if (newCharge) setPixCharge(newCharge);
  };

  const cancelCharge = async (c: Charge) => {
    if (!confirm("Cancelar esta cobrança?")) return;
    const { error } = await supabase.functions.invoke("subscription-cancel-charge", {
      body: { charge_id: c.id },
    });
    if (error) toast.error(error.message); else { toast.success("Cobrança cancelada"); load(); }
  };

  const markPaidManual = async (c: Charge) => {
    if (!confirm("Marcar como paga manualmente?")) return;
    const { error } = await supabase.from("reseller_subscription_charges")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    // Unblock + complete onboarding if applicable
    if (reseller) {
      const patch: any = { subscription_blocked: false, subscription_blocked_at: null };
      if (c.is_onboarding) patch.subscription_onboarding_completed = true;
      await supabase.from("resellers").update(patch).eq("id", reseller.id);
    }
    toast.success("Marcada como paga");
    load();
  };

  const copy = (txt: string | null) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    toast.success("Copiado!");
  };

  const totals = useMemo(() => {
    let pending = 0, paid = 0, overdue = 0;
    for (const c of charges) {
      if (c.status === "pending") pending += c.amount_cents;
      if (c.status === "paid") paid += c.amount_cents;
      if (c.status === "overdue") overdue += c.amount_cents;
    }
    return { pending, paid, overdue };
  }, [charges]);

  const isSubscription = reseller?.billing_mode === "subscription";

  return (
    <PageContainer>
      <PageHeader
        title="Mensalidade do Revendedor"
        description={reseller ? `@${reseller.display_name}` : "Carregando..."}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate("/painel/gerente/revendedores")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : !reseller ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Revendedor não encontrado.</div>
      ) : (
        <div className="space-y-6">
          {/* Toggle modo mensalista */}
          <div className="rounded-2xl border border-border bg-card/60 p-4 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="font-bold text-foreground flex items-center gap-2">
                Modo Mensalista
                {isSubscription && <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/30">Ativo</Badge>}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Quando ativo, o revendedor paga uma mensalidade fixa em vez de comprar saldo. Gera chaves sem custo nem promoções.
                {isSubscription && !reseller.subscription_onboarding_completed && " · Aguardando 1º pagamento (onboarding bloqueia o painel)."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {savingMode && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch checked={isSubscription} onCheckedChange={toggleBillingMode} disabled={savingMode} />
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-[10px] uppercase font-bold tracking-widest text-amber-500">Pendente</p>
              <p className="font-mono text-xl font-black text-amber-400 mt-1">{formatBRL(totals.pending)}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Recebido</p>
              <p className="font-mono text-xl font-black text-emerald-400 mt-1">{formatBRL(totals.paid)}</p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-[10px] uppercase font-bold tracking-widest text-rose-500">Vencido</p>
              <p className="font-mono text-xl font-black text-rose-400 mt-1">{formatBRL(totals.overdue)}</p>
            </div>
          </div>

          {/* Recurrences */}
          <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 md:p-6 border-b border-white/5">
              <div>
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-violet-400" /> Recorrências
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Cobranças geradas automaticamente todo mês no dia configurado.
                </p>
              </div>
              <Button onClick={() => setRecOpen(true)} size="sm" variant="outline" className="gap-2" disabled={!isSubscription}>
                <Plus className="h-4 w-4" /> Nova recorrência
              </Button>
            </div>
            {!isSubscription ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Ative o modo mensalista para configurar recorrências.</div>
            ) : recurrences.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma recorrência configurada.</div>
            ) : (
              <div className="divide-y divide-white/5">
                {recurrences.map((r) => (
                  <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-primary">{formatBRL(r.amount_cents)}</span>
                        <Badge variant="outline" className="text-[10px]">dia {r.day_of_month}</Badge>
                        {r.is_active
                          ? <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]">Ativa</Badge>
                          : <Badge className="bg-slate-500/15 text-slate-400 border-slate-500/30 text-[10px]">Pausada</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{r.description ?? "Mensalidade"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Próxima geração: {formatDate(r.next_generation_date)} · aviso {r.warning_days_before}d antes
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="secondary" onClick={() => toggleRecurrence(r)} className="gap-1">
                        {r.is_active ? <><Pause className="h-3 w-3" /> Pausar</> : <><Play className="h-3 w-3" /> Ativar</>}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteRecurrence(r)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Charges list (continued) */}
          <div className="rounded-2xl border border-border bg-card/60 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 md:p-6 border-b border-white/5">
              <h3 className="font-bold text-foreground">Cobranças</h3>
              <Button onClick={() => setOpen(true)} size="sm" className="gap-2" disabled={!isSubscription}>
                <Plus className="h-4 w-4" /> Nova cobrança
              </Button>
            </div>

            {!isSubscription ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Ative o modo mensalista para criar cobranças.</div>
            ) : charges.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma cobrança ainda.</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/60">
                      <tr>
                        <th className="px-6 py-3 text-left">Tipo</th>
                        <th className="px-6 py-3 text-left">Descrição</th>
                        <th className="px-6 py-3 text-right">Valor</th>
                        <th className="px-6 py-3 text-left">Vencimento</th>
                        <th className="px-6 py-3 text-left">Status</th>
                        <th className="px-6 py-3 text-center">Ações</th>
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
                          <td className="px-6 py-3">
                            <div className="flex justify-center gap-1">
                              {(c.status === "pending" || c.status === "overdue") && c.pix_payload && (
                                <Button size="sm" variant="ghost" onClick={() => setPixCharge(c)} title="Ver PIX"><QrCode className="h-4 w-4" /></Button>
                              )}
                              {(c.status === "pending" || c.status === "overdue") && (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => markPaidManual(c)} title="Marcar paga"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => cancelCharge(c)} title="Cancelar"><Ban className="h-4 w-4 text-destructive" /></Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-white/5">
                  {charges.map((c) => (
                    <div key={c.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{kindLabel(c.kind)}</span>
                            {c.is_onboarding && <Badge variant="outline" className="text-[9px]">Onboarding</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{c.description ?? "—"}</p>
                          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(c.due_date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-primary">{formatBRL(c.amount_cents)}</p>
                          <div className="mt-1">{statusBadge(c.status)}</div>
                        </div>
                      </div>
                      {(c.status === "pending" || c.status === "overdue") && (
                        <div className="flex gap-2">
                          {c.pix_payload && (
                            <Button size="sm" variant="secondary" className="flex-1 gap-2" onClick={() => setPixCharge(c)}><QrCode className="h-4 w-4" />PIX</Button>
                          )}
                          <Button size="sm" variant="secondary" className="flex-1 gap-2" onClick={() => markPaidManual(c)}><CheckCircle2 className="h-4 w-4 text-emerald-500" />Paga</Button>
                          <Button size="sm" variant="destructive" onClick={() => cancelCharge(c)}><Ban className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* New charge dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>Nova cobrança</DialogTitle>
            <DialogDescription>Cria a cobrança e gera o PIX automaticamente via MisticPay.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensalidade</SelectItem>
                  <SelectItem value="installment">Parcela</SelectItem>
                  <SelectItem value="one_off">Avulsa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250,00" inputMode="decimal" />
            </div>
            <div>
              <Label className="text-xs">Vencimento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: 1ª parcela inicial" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Switch checked={isOnboarding} onCheckedChange={setIsOnboarding} id="onb" />
              <Label htmlFor="onb" className="text-xs cursor-pointer">Cobrança de onboarding (desbloqueia painel ao pagar)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submitCharge} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Criar cobrança
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PIX view dialog */}
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
                <Button size="icon" variant="secondary" onClick={() => copy(pixCharge.pix_payload)}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPixCharge(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recurrence dialog */}
      <Dialog open={recOpen} onOpenChange={setRecOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>Nova recorrência</DialogTitle>
            <DialogDescription>
              Cobrança gerada automaticamente todo mês no dia escolhido. O painel cria a cobrança com PIX MisticPay e envia notificação interna ao revendedor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Valor (R$)</Label>
              <Input value={recAmount} onChange={(e) => setRecAmount(e.target.value)} placeholder="500,00" inputMode="decimal" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Dia do mês (1–28)</Label>
                <Input type="number" min={1} max={28} value={recDay} onChange={(e) => setRecDay(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Avisar N dias antes</Label>
                <Input type="number" min={0} max={30} value={recWarn} onChange={(e) => setRecWarn(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={2} value={recDesc} onChange={(e) => setRecDesc(e.target.value)} placeholder="Mensalidade do painel" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setRecOpen(false)}>Cancelar</Button>
            <Button onClick={submitRecurrence} disabled={recSaving}>
              {recSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Criar recorrência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}