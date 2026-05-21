import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Wallet, Copy, CheckCircle2, X, Crown, Zap, Gift, ShieldCheck,
  TrendingUp, ArrowDownRight, ArrowUpRight, Sparkles, QrCode, AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import RevendedorTransacoes from "./RevendedorTransacoes";

type Tx = { id: string; amount_cents: number; kind: string; description: string | null; created_at: string };
type Tier = { id: string; slug: string; name: string; color: string; min_spent_cents: number; discount_percent: number; recharge_bonus_percent: number; sort_order: number; is_active: boolean };
type Intent = {
  intent_id: string;
  qr_code_base64: string | null;
  copy_paste: string | null;
  amount_cents: number;
  bonus_cents: number;
};

const PRESETS = [20, 50, 100, 200, 500, 1000];

const KIND_META: Record<string, { label: string; cls: string; icon: any }> = {
  recharge:    { label: "Recargas",  cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: ArrowDownRight },
  bonus:       { label: "Bônus",    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",      icon: Gift },
  order:       { label: "Pedido",   cls: "bg-rose-500/15 text-rose-400 border-rose-500/30",         icon: ArrowUpRight },
  refund:      { label: "Estorno",  cls: "bg-sky-500/15 text-sky-400 border-sky-500/30",            icon: ArrowDownRight },
  adjustment:  { label: "Ajuste",   cls: "bg-violet-500/15 text-violet-400 border-violet-500/30",   icon: Zap },
};

export default function RevendedorAdicionarSaldo() {
  const { user } = useAuth();
  const [balanceCents, setBalanceCents] = useState(0);
  const [amount, setAmount] = useState("50,00");
  const [doc, setDoc] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [paid, setPaid] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [currentTier, setCurrentTier] = useState<Tier | null>(null);
  const [totalSpentCents, setTotalSpentCents] = useState(0);
  const [flowStep, setFlowStep] = useState<"idle" | "generating" | "warning" | "qrcode">("idle");
  const pollRef = useRef<number | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);
    const [{ data: b }, { data: t }, { data: tiersData }, { data: tierState }, { data: ct }] = await Promise.all([
      supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", r.id).maybeSingle(),
      supabase.from("balance_transactions").select("*").eq("reseller_id", r.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("reseller_tiers").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("reseller_tier_state").select("total_spent_cents").eq("reseller_id", r.id).maybeSingle(),
      supabase.rpc("get_reseller_tier", { _reseller_id: r.id }),
    ]);
    setBalanceCents(b?.balance_cents ?? 0);
    setTxs(t ?? []);
    setTiers((tiersData as Tier[]) ?? []);
    setTotalSpentCents(tierState?.total_spent_cents ?? 0);
    const tierRow: any = Array.isArray(ct) ? ct[0] : ct;
    setCurrentTier((tierRow as Tier) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  // Realtime: atualiza barra de nível e saldo quando o banco muda
  useEffect(() => {
    if (!resellerId) return;
    const ch = supabase
      .channel(`saldo-${resellerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_tier_state", filter: `reseller_id=eq.${resellerId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_balances", filter: `reseller_id=eq.${resellerId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "balance_transactions", filter: `reseller_id=eq.${resellerId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [resellerId]);

  const handleCheckout = async () => {
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!cents || cents < 100) return toast.error("Valor mínimo R$ 1,00");
    if (!resellerId) return;
    setSubmitting(true);
    setPaid(false);
    setIntent(null);
    setFlowStep("generating");
    const startedAt = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("misticpay-create-recharge", {
        body: { amount_cents: cents, payer_document: doc.replace(/\D/g, "") || undefined },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      // Garante mínimo de 1.8s na tela "Gerando" para a animação fazer sentido
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1800) await new Promise((r) => setTimeout(r, 1800 - elapsed));
      setIntent(data as Intent);
      setFlowStep("warning");
      startPolling((data as Intent).intent_id);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar pagamento");
      setFlowStep("idle");
    } finally {
      setSubmitting(false);
    }
  };

  const startPolling = (intentId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase.from("recharge_intents").select("status").eq("id", intentId).maybeSingle();
      if (data?.status === "paid") {
        setPaid(true);
        if (pollRef.current) window.clearInterval(pollRef.current);
        toast.success("Pagamento confirmado!");
        load();
      } else if (data?.status === "failed") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        toast.error("Pagamento falhou ou foi cancelado");
      }
    }, 3000);
  };

  const copyPix = async () => {
    if (!intent?.copy_paste) return;
    await navigator.clipboard.writeText(intent.copy_paste);
    toast.success("Código PIX copiado");
  };

  const closeModal = () => {
    setIntent(null);
    setPaid(false);
    setFlowStep("idle");
    if (pollRef.current) window.clearInterval(pollRef.current);
  };

  const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Cálculos derivados
  const amountCents = useMemo(() => {
    const v = parseFloat((amount || "").replace(",", "."));
    return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : 0;
  }, [amount]);

  const bonusPct = currentTier ? Number(currentTier.recharge_bonus_percent ?? 0) : 0;
  const bonusCents = Math.round((amountCents * bonusPct) / 100);
  const totalCents = amountCents + bonusCents;

  const tierProgress = useMemo(() => {
    if (tiers.length === 0) return null;
    const idx = tiers.findIndex((t) => currentTier && t.id === currentTier.id);
    const next = idx >= 0 ? tiers[idx + 1] : tiers[0];
    const base = idx >= 0 ? tiers[idx]?.min_spent_cents ?? 0 : 0;
    const target = next?.min_spent_cents ?? totalSpentCents;
    const pct = next ? Math.min(100, Math.max(0, ((totalSpentCents - base) / Math.max(1, target - base)) * 100)) : 100;
    return { idx, next, base, target, pct };
  }, [tiers, currentTier, totalSpentCents]);

  return (
    <div className="space-y-6">
      <div className="hidden sm:block">
        <PageHeader
          title="Adicionar saldo"
          description="Recarregue seu saldo via PIX e ganhe bônus de acordo com seu nível."
        />
      </div>

      {/* Hero: Saldo + Recargas */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Card de saldo */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 lg:col-span-2">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" /> Saldo na Plataforma
            </div>
            <div className="mt-3 flex items-center justify-center sm:items-end sm:justify-start gap-2">
              <div className="font-display text-4xl font-bold tracking-tight">
                {loading ? "—" : fmt(balanceCents)}
              </div>
            </div>

            {currentTier && (
              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ borderColor: currentTier.color, color: currentTier.color, backgroundColor: `${currentTier.color}15` }}
                >
                  <Crown className="h-3 w-3" /> {currentTier.name}
                </span>
                {bonusPct > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    <Gift className="h-3 w-3" /> +{bonusPct}% em recargas
                  </span>
                )}
                {Number(currentTier.discount_percent) > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                    <TrendingUp className="h-3 w-3" /> -{Number(currentTier.discount_percent)}% em pedidos
                  </span>
                )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-center sm:justify-start gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Pagamento seguro via PIX (Mystic Pay)
            </div>
          </div>
        </div>

        {/* Card de recargas */}
        <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm lg:col-span-3">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between sm:text-left gap-3">
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 font-display text-base font-semibold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Zap className="h-4 w-4" />
                </span>
                Recarregar agora
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground text-center sm:text-left">
                Recarga instantâneo após confirmação do PIX.
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$)</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  R$
                </span>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50,00"
                  className="h-11 pl-9 font-display text-base font-semibold tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CPF do pagador <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                value={doc}
                onChange={(e) => setDoc(e.target.value)}
                placeholder="000.000.000-00"
                className="h-11"
              />
            </div>
          </div>

          {/* Presets */}
          <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-1.5">
            {PRESETS.map((v) => {
              const selected = amountCents === v * 100;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(`${v},00`)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-background/50 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  R$ {v}
                </button>
              );
            })}
          </div>

          {/* Resumo do bônus */}
          {amountCents > 0 && (
            <div className="mt-4 rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Você paga</span>
                <span className="font-mono font-medium tabular-nums">{fmt(amountCents)}</span>
              </div>
              {bonusCents > 0 && (
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <Gift className="h-3 w-3" /> Bônus {bonusPct}%
                  </span>
                  <span className="font-mono font-medium tabular-nums text-emerald-400">+ {fmt(bonusCents)}</span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Você recebe</span>
                <span className="font-display text-lg font-bold tabular-nums">{fmt(totalCents)}</span>
              </div>
            </div>
          )}

          <Button
            onClick={handleCheckout}
            disabled={submitting || amountCents < 100}
            size="lg"
            className="mt-4 h-12 w-full bg-primary text-base font-semibold text-primary-foreground shadow-red-sm hover:bg-primary/90"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <QrCode className="mr-2 h-5 w-5" />
            )}
            Gerar PIX
          </Button>
        </div>
      </div>

      {/* Sequência de níveis */}
      {tiers.length > 0 && (
        <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm">
          <div className="flex flex-col flex-wrap items-center text-center sm:flex-row sm:items-end sm:justify-between sm:text-left gap-4">
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <Crown className="h-3.5 w-3.5 text-primary" /> Sequência de níveis
              </div>
              <div className="mt-1 font-display text-lg font-semibold text-center sm:text-left">
                Suba de nível e ganhe mais
              </div>
              <div className="text-xs text-muted-foreground text-center sm:text-left">
                Quanto mais você gasta, maior seu desconto e bônus de recargas.
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground text-center sm:text-right">Total gasto</div>
              <div className="font-display text-xl font-bold tabular-nums text-center sm:text-right">{fmt(totalSpentCents)}</div>
            </div>
          </div>

          {tierProgress && (
            <div className="mt-5">
              <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between text-xs text-muted-foreground">
                {tierProgress.next ? (
                  <>
                    <span>
                      Faltam{" "}
                      <span className="font-mono font-semibold text-foreground tabular-nums">
                        {fmt(Math.max(0, tierProgress.target - totalSpentCents))}
                      </span>{" "}
                      para{" "}
                      <span style={{ color: tierProgress.next.color }} className="font-semibold">
                        {tierProgress.next.name}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-foreground">{tierProgress.pct.toFixed(0)}%</span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    Você atingiu o nível máximo 🏆
                  </span>
                )}
              </div>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${tierProgress.pct}%`,
                    backgroundColor: tierProgress.next?.color ?? currentTier?.color ?? "hsl(var(--primary))",
                    boxShadow: `0 0 12px ${tierProgress.next?.color ?? currentTier?.color ?? "hsl(var(--primary))"}80`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-3 grid-cols-2">
            {tiers.map((t) => {
              const isCurrent = currentTier?.id === t.id;
              const reached = totalSpentCents >= t.min_spent_cents;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "relative rounded-xl border p-4 transition-all",
                    isCurrent && "ring-2 ring-offset-2 ring-offset-background scale-[1.02]",
                    !isCurrent && reached && "opacity-100",
                    !reached && "opacity-50",
                  )}
                  style={{
                    borderColor: t.color,
                    backgroundColor: isCurrent ? `${t.color}15` : `${t.color}05`,
                    // @ts-ignore — CSS var for ring color
                    "--tw-ring-color": t.color,
                  } as React.CSSProperties}
                >
                  {isCurrent && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-background px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: t.color, border: `1px solid ${t.color}` }}>
                      Você está aqui
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 font-display text-sm font-bold uppercase" style={{ color: t.color }}>
                    <Crown className="h-3.5 w-3.5" /> {t.name}
                  </div>
                  <div className="mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">A partir de</div>
                  <div className="font-mono text-sm font-semibold tabular-nums">{fmt(t.min_spent_cents)}</div>
                  <div className="mt-3 space-y-1.5 border-t border-border/40 pt-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <TrendingUp className="h-3 w-3" /> Desconto
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: t.color }}>
                        {Number(t.discount_percent)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Gift className="h-3 w-3" /> Bônus recargas
                      </span>
                      <span className="font-semibold tabular-nums" style={{ color: t.color }}>
                        {Number(t.recharge_bonus_percent)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal PIX */}
      {flowStep !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            {flowStep !== "generating" && (
              <button
                onClick={closeModal}
                className="absolute right-3 top-3 z-10 text-muted-foreground hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            {/* Stepper */}
            <div className="flex items-center justify-center gap-1.5 border-b border-border bg-background/40 px-6 py-3">
              {(["generating", "warning", "qrcode"] as const).map((s) => {
                const order = ["generating", "warning", "qrcode"];
                const currentIdx = paid ? 2 : order.indexOf(flowStep);
                const idx = order.indexOf(s);
                const active = idx === currentIdx;
                const done = idx < currentIdx;
                return (
                  <div
                    key={s}
                    className={cn(
                      "h-1.5 w-8 rounded-full transition-all",
                      done ? "bg-primary" : active ? "bg-primary/60" : "bg-muted",
                    )}
                  />
                );
              })}
            </div>

            <div className="p-6">
              {/* STEP 1: Gerando PIX */}
              {flowStep === "generating" && (
                <div key="generating" className="animate-slide-in-right py-8 text-center">
                  <div className="relative mx-auto h-28 w-28">
                    <div className="absolute inset-0 animate-pix-orbit rounded-full border-2 border-dashed border-primary/40" />
                    <div className="absolute inset-2 animate-pulse-red rounded-full border border-primary/30" />
                    <div className="absolute inset-4 flex items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-red">
                      <QrCode className="h-9 w-9" />
                    </div>
                  </div>

                  <div className="mx-auto mt-6 flex h-6 items-end justify-center gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className="block h-full w-1.5 origin-bottom rounded-full bg-primary/70 animate-pix-bar"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                  </div>

                  <div className="mt-5 font-display text-xl font-semibold">Gerando seu PIX</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Estamos preparando o pagamento de{" "}
                    <span className="font-mono font-semibold text-foreground tabular-nums">{fmt(amountCents)}</span>...
                  </div>

                  <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Conexão segura com Mystic Pay
                  </div>
                </div>
              )}

              {/* STEP 2: Aviso */}
              {flowStep === "warning" && intent && (
                <div key="warning" className="animate-slide-in-right py-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10">
                    <AlertTriangle className="h-8 w-8 text-amber-400" />
                  </div>
                  <div className="mt-4 font-display text-xl font-semibold">Aviso importante</div>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Como a <span className="font-semibold text-foreground">Mystic Pay</span> ainda é uma plataforma nova,
                    alguns bancos podem exibir um alerta de{" "}
                    <span className="font-semibold text-amber-400">"possível fraude ou golpe"</span> ao confirmar o PIX.
                  </p>
                  <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    É <span className="font-semibold text-foreground">seguro prosseguir</span> — basta confirmar a operação
                    normalmente no seu app bancário.
                  </p>

                  <div className="mt-5 rounded-lg border border-border bg-background/40 p-3 text-left">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Valor a pagar</span>
                      <span className="font-mono font-semibold tabular-nums">{fmt(intent.amount_cents)}</span>
                    </div>
                    {intent.bonus_cents > 0 && (
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <Gift className="h-3 w-3" /> Bônus
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-emerald-400">
                          + {fmt(intent.bonus_cents)}
                        </span>
                      </div>
                    )}
                  </div>

                  <Button
                    className="mt-5 h-11 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
                    onClick={() => setFlowStep("qrcode")}
                  >
                    Entendi, ver QR Code
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* STEP 3: QR Code */}
              {flowStep === "qrcode" && intent && !paid && (
                <div key="qrcode" className="animate-slide-in-right">
                  <div className="text-center">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      <QrCode className="h-3 w-3" /> Últimos detalhes · pague com PIX
                    </div>
                    <div className="mt-3 font-display text-3xl font-bold tabular-nums">{fmt(intent.amount_cents)}</div>
                    {intent.bonus_cents > 0 && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-400">
                        <Gift className="h-3 w-3" /> + Bônus de {fmt(intent.bonus_cents)}
                      </div>
                    )}
                  </div>
                  {intent.qr_code_base64 && (
                    <div className="mt-5 flex justify-center">
                      <img
                        src={intent.qr_code_base64}
                        alt="QR Code PIX"
                        className="h-56 w-56 rounded-xl border border-border bg-white p-2"
                      />
                    </div>
                  )}
                  {intent.copy_paste && (
                    <div className="mt-4 space-y-1.5">
                      <Label className="text-xs">PIX Copia e Cola</Label>
                      <div className="flex gap-2">
                        <Input readOnly value={intent.copy_paste} className="font-mono text-xs" />
                        <Button variant="outline" size="icon" onClick={copyPix}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex items-center justify-center gap-2 rounded-md border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    Aguardando pagamento...
                  </div>
                </div>
              )}

              {/* Pago */}
              {paid && intent && (
                <div key="paid" className="animate-slide-in-right py-6 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                  </div>
                  <div className="mt-3 font-display text-xl font-semibold">Pagamento confirmado!</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">
                      {fmt(intent.amount_cents + intent.bonus_cents)}
                    </span>{" "}
                    creditado no seu saldo.
                  </div>
                  <Button className="mt-5 w-full" onClick={closeModal}>Fechar</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Movimentações — usando a tela completa de Transações */}
      <RevendedorTransacoes />
    </div>
  );
}
