// v4.0.1 - Removendo referências LovMain Unlimited
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { 
  Loader2, ShoppingCart, KeyRound, Copy, ChevronDown, FlaskConical, 
  RefreshCcw, Ban, Trash2, MoreVertical, Sparkles, Crown, Package,
  BookOpen, Zap, Globe, Terminal, FileDown, Puzzle, ShieldCheck
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Plan = { license_type: string; label: string; price_cents: number; cost_cents: number; min_price_cents?: number; is_active: boolean };
type Tier = { id: string; discount_percent: number; name: string; color: string; min_spent_cents: number; test_keys_per_day?: number } | null;
type TierRow = { id: string; name: string; color: string; min_spent_cents: number; discount_percent: number; sort_order: number; is_active: boolean };
type TierState = { total_spent_cents: number } | null;
type Order = {
  id: string; license_type: string; price_cents: number; status: string;
  license_key: string | null; created_at: string; is_test: boolean;
};

const FALLBACK_LABEL: Record<string, string> = {
  pro_1d: "Pro 1 dia",
  pro_7d: "Pro 7 dias",
  pro_15d: "Pro 15 dias",
  pro_30d: "Pro 30 dias",
  lifetime: "Vitalícia",
  trial: "Teste 15min",
};

const ORDER = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];

// Plano sintético usado apenas para abrir o modal de teste grátis
const TRIAL_PLAN: Plan = {
  license_type: "trial",
  label: "Teste 15min",
  price_cents: 0,
  cost_cents: 0,
  is_active: true,
};

export default function RevendedorPedidos() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tier, setTier] = useState<Tier>(null);
  const [allTiers, setAllTiers] = useState<TierRow[]>([]);
  const [tierState, setTierState] = useState<TierState>(null);
  const [clients, setClients] = useState<{ id: string; email: string; display_name: string | null }[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [testsLast24h, setTestsLast24h] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Extensões + overrides de preço
  const [extensions, setExtensions] = useState<{ id: string; name: string }[]>([]);
  const [selectedExtId, setSelectedExtId] = useState<string>("");
  // override por nível Partner: extId|license_type -> cents
  const [partnerOverrides, setPartnerOverrides] = useState<Record<string, number>>({});
  // preço por revendedor (preço base custom): extId|license_type -> cents
  const [resellerPrices, setResellerPrices] = useState<Record<string, number>>({});
  // Preços por nível e extensão: tierId|extId|license_type -> cents
  const [tierExtensionPrices, setTierExtensionPrices] = useState<Record<string, number>>({});

  const [open, setOpen] = useState<Plan | null>(null);
  const [isTest, setIsTest] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [clientId, setClientId] = useState<string>("none");
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [matchedCustomer, setMatchedCustomer] = useState<{ display_name: string } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  const openOrder = (p: Plan, test: boolean) => {
    setIsTest(test);
    setOpen(p);
  };

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sinceToday = todayStart.toISOString();
    const [
      { data: pl }, { data: cs }, { data: os }, { data: t }, { data: tiers }, { data: ts }, { count: testCount },
      { data: activeExts }, { data: rep }, { data: pov }, { data: tep },
    ] = await Promise.all([
      supabase.from("pricing_plans").select("license_type,label,price_cents,cost_cents,min_price_cents,is_active").eq("is_active", true),
      supabase.from("profiles").select("id,email,display_name").eq("reseller_id", r.id),
      supabase.from("orders").select("id,license_type,price_cents,status,license_key,created_at,is_test").eq("reseller_id", r.id).order("created_at", { ascending: false }).limit(20),
      supabase.rpc("get_reseller_tier", { _reseller_id: r.id }),
      supabase.from("reseller_tiers").select("id,name,color,min_spent_cents,discount_percent,sort_order,is_active").eq("is_active", true).order("min_spent_cents", { ascending: true }),
      supabase.from("reseller_tier_state").select("total_spent_cents").eq("reseller_id", r.id).maybeSingle(),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("reseller_id", r.id).eq("is_test", true).gte("created_at", sinceToday),
      // Todas as extensões ativas
      supabase.from("extensions").select("id,name,is_active").eq("is_active", true),
      // preços por revendedor (custom)
      supabase
        .from("reseller_extension_prices")
        .select("extension_id,license_type,price_cents,is_active")
        .eq("reseller_id", r.id),
      // overrides do nível Partner para esse revendedor
      supabase
        .from("reseller_extension_price_overrides")
        .select("extension_id,license_type,price_cents,is_active")
        .eq("reseller_id", r.id),
      // Preços por nível e extensão
      supabase
        .from("tier_extension_prices")
        .select("tier_id,extension_id,license_type,price_cents,is_active")
        .eq("is_active", true),
    ]);
    const sorted = ((pl ?? []) as Plan[])
      .filter(p => ORDER.includes(p.license_type))
      .sort((a, b) => ORDER.indexOf(a.license_type) - ORDER.indexOf(b.license_type));
    setPlans(sorted);
    setClients(cs ?? []);
    setOrders(os ?? []);
    setTier((t as any) ?? null);
    setAllTiers((tiers ?? []) as TierRow[]);
    setTierState((ts as any) ?? { total_spent_cents: 0 });
    setTestsLast24h(testCount ?? 0);

    // Prepara lista de extensões (todas as ativas)
    const exts = (activeExts ?? [])
      .map((e: any) => ({ id: e.id, name: e.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    setExtensions(exts);
    setSelectedExtId((cur) => cur && exts.some((e) => e.id === cur) ? cur : (exts[0]?.id ?? ""));
    setSelectedExtId((cur) => cur && exts.some((e) => e.id === cur) ? cur : (exts[0]?.id ?? ""));

    const repMap: Record<string, number> = {};
    (rep ?? []).forEach((row: any) => {
      if (row.is_active && row.price_cents > 0) {
        repMap[`${row.extension_id}|${row.license_type}`] = row.price_cents;
      }
    });
    setResellerPrices(repMap);

    const povMap: Record<string, number> = {};
    (pov ?? []).forEach((row: any) => {
      if (row.is_active && row.price_cents >= 0) {
        povMap[`${row.extension_id}|${row.license_type}`] = row.price_cents;
      }
    });
    setPartnerOverrides(povMap);

    const tepMap: Record<string, number> = {};
    (tep ?? []).forEach((row: any) => {
      if (row.is_active && row.price_cents >= 0) {
        tepMap[`${row.tier_id}|${row.extension_id}|${row.license_type}`] = row.price_cents;
      }
    });
    setTierExtensionPrices(tepMap);

    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const discountPct = Number(tier?.discount_percent ?? 0);
  const applyDiscount = (cents: number, minCents = 0) =>
    Math.round(cents * (1 - discountPct / 100));

  // Replica a lógica da edge function:
  // 1) override individual (Partner) → preço fixo, ignora desconto e piso
  // 2) preço por revendedor (custom) → aplica desconto, respeita piso
  // 3) plano global → aplica desconto, respeita piso
  // Retorna { price, base, source }
  const computePrice = (p: Plan, extId: string | null) => {
    const lt = p.license_type;
    if (extId) {
      const k = `${extId}|${lt}`;
      // Prioridade 1: Preço manual específico para este revendedor/extensão (Partner Override)
      if (partnerOverrides[k] !== undefined && partnerOverrides[k] >= 0) {
        const c = partnerOverrides[k];
        return { price: c, base: c, source: "partner" as const };
      }

      // Prioridade 1.5: Preço definido por Nível para esta extensão
      if (tier?.id) {
        const tk = `${tier.id}|${k}`;
        if (tierExtensionPrices[tk] !== undefined && tierExtensionPrices[tk] >= 0) {
          const c = tierExtensionPrices[tk];
          // Preços definidos por nível já consideram o desconto
          return { price: c, base: c, source: "tier" as const };
        }
      }

      // Prioridade 2: Preço customizado para o revendedor específico
      const rp = resellerPrices[k];
      if (rp && rp > 0) {
        const final = applyDiscount(rp);
        return {
          price: final,
          base: rp,
          source: "reseller" as const,
        };
      }
    }
    // Prioridade 3: Preço padrão do Plano (Preço LP) + Desconto do Nível
    const final = applyDiscount(p.price_cents);
    return {
      price: final,
      base: p.price_cents,
      source: "plan" as const,
    };
  };

  const onlyDigits = (s: string) => s.replace(/\D+/g, "");

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const runLicenseAction = async (
    o: Order,
    action: "reset-hwid" | "revoke-license" | "delete-license",
    confirmMsg?: string,
  ) => {
    if (!o.license_key) return toast.error("Pedido sem chave de licença");
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActionLoading(`${o.id}:${action}`);
    const { data, error } = await supabase.functions.invoke("reseller-license-action", {
      body: { action, license_key: o.license_key, order_id: o.id },
    });
    setActionLoading(null);
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error ?? error?.message ?? "Falha na ação";
      return toast.error(msg);
    }
    if (action === "reset-hwid") toast.success("HWID resetado");
    if (action === "revoke-license") toast.success("Licença revogada");
    if (action === "delete-license") toast.success("Licença excluída");
    load();
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      completed: { label: "Concluída", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
      pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
      failed: { label: "Falhou", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
      revoked: { label: "Revogada", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
      deleted: { label: "Excluída", cls: "bg-zinc-800 text-zinc-500 border-white/5" },
    };
    const v = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
    return <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", v.cls)}>{v.label}</Badge>;
  };

  // Lookup automático por whatsapp: se já existir contato registrado, puxa o nome
  useEffect(() => {
    if (!resellerId || !open) {
      setMatchedCustomer(null);
      return;
    }
    const wa = onlyDigits(whatsapp);
    if (wa.length < 10 || wa.length > 13) {
      setMatchedCustomer(null);
      return;
    }
    let cancelled = false;
    setLookingUp(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("reseller_customers")
        .select("display_name")
        .eq("reseller_id", resellerId)
        .eq("whatsapp", wa)
        .maybeSingle();
      if (cancelled) return;
      setLookingUp(false);
      if (data?.display_name) {
        setMatchedCustomer({ display_name: data.display_name });
        setDisplayName(data.display_name);
      } else {
        setMatchedCustomer(null);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); setLookingUp(false); };
  }, [whatsapp, resellerId, open]);

  const submit = async () => {
    if (!open) return;
    const name = displayName.trim();
    const wa = onlyDigits(whatsapp);
    if (name.length < 2) {
      toast.error("Informe o nome exibido na licença");
      return;
    }
    if (!isTest && (wa.length < 10 || wa.length > 13)) {
      toast.error("Informe um WhatsApp válido (com DDD)");
      return;
    }
    if (isTest && wa && (wa.length < 10 || wa.length > 13)) {
      toast.error("WhatsApp inválido (deixe em branco ou informe DDD + número)");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("place-reseller-order", {
      body: {
        license_type: open.license_type,
        extension_id: selectedExtId || null,
        client_id: clientId === "none" ? null : clientId,
        display_name: name,
        whatsapp: wa,
        is_test: isTest,
      },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Falha no pedido");
      return;
    }
    const res = data as any;
    toast.success(isTest ? "Licença teste gerada (grátis)" : "Pedido concluído");
    if (res?.name_was_replaced) {
      toast.info(`Nome do contato mantido como "${res.display_name}" (já cadastrado para esse WhatsApp).`);
    }
    if (res?.license_key) {
      navigator.clipboard.writeText(res.license_key).catch(() => {});
      toast.success("Chave copiada para a área de transferência");
    }
    setOpen(null);
    setIsTest(false);
    setClientId("none");
    setDisplayName("");
    setWhatsapp("");
    setMatchedCustomer(null);
    load();
  };

  return (
    <div className="relative min-h-screen space-y-6 overflow-hidden pb-10">
      {/* Decorative background like Indique e Ganhe */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-20 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -right-20 bottom-40 h-[600px] w-[600px] rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      <div className="relative space-y-6">
        <PageHeader 
          title="Fazer pedido" 
          description="Compre licenças usando seu saldo. A entrega é instantânea." 
        />

        {tier && allTiers.length > 0 && Object.keys(partnerOverrides).length === 0 && (() => {
          const spent = tierState?.total_spent_cents ?? 0;
          const currentIdx = allTiers.findIndex((x) => x.id === tier.id);
          const currentTierRow = currentIdx >= 0 ? allTiers[currentIdx] : undefined;
          const nextTier = currentIdx >= 0 ? allTiers[currentIdx + 1] : undefined;
          const toNext = nextTier ? Math.max(0, nextTier.min_spent_cents - spent) : 0;
          const currentMin = currentTierRow?.min_spent_cents ?? 0;
          const range = nextTier ? nextTier.min_spent_cents - currentMin : 0;
          const progress = nextTier && range > 0
            ? Math.min(100, Math.max(0, ((spent - currentMin) / range) * 100))
            : 100;
          return (
            <div className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 backdrop-blur-xl">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2 ring-background"
                style={{ backgroundColor: tier.color, boxShadow: `0 0 15px ${tier.color}55` }}
              >
                <Crown className="h-4 w-4 text-black/80" />
              </span>
              <div className="flex flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center justify-between sm:block">
                  <span className="font-display text-sm font-bold text-white tracking-wide">{tier.name}</span>
                  <span className="sm:hidden text-[10px] font-mono text-zinc-500">Saldo: {fmt(spent)}</span>
                </div>
                {nextTier ? (
                  <div className="flex flex-1 items-center gap-3">
                    <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000"
                        style={{
                          width: `${progress}%`,
                          background: `linear-gradient(90deg, ${tier.color}, ${nextTier.color})`,
                        }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-[10px] font-medium text-zinc-400">
                      Falta <span className="font-mono text-white">{fmt(toNext)}</span> para <span style={{ color: nextTier.color }}>{nextTier.name}</span>
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center gap-3">
                    <div className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-primary/40 to-primary" />
                    <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-primary">Nível Máximo</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Card destacado: Teste grátis 15min */}
        {(() => {
          const dailyLimit = resellerId === '97959674-f4bd-4eb3-9fa1-37cd115a77df' 
            ? 50 
            : Number(tier?.test_keys_per_day ?? 10);
          const used = testsLast24h;
          const remaining = Math.max(0, dailyLimit - used);
          const blocked = dailyLimit <= 0 || remaining <= 0;
          return (
            <Card className="group relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 backdrop-blur-xl">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.2)] transition-transform group-hover:scale-105">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-lg font-black text-white">Teste Grátis 15 Minutos</h3>
                      <Badge className="bg-primary text-[10px] font-bold text-black uppercase">Grátis</Badge>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed max-w-md">
                      Gere uma licença <span className="text-primary font-bold">TRIAL</span> de 15min para seus clientes conhecerem o sistema sem custo.
                    </p>
                    <div className="pt-1 flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("h-1.5 w-1.5 rounded-full", blocked ? "bg-rose-500" : "bg-emerald-500")} />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          {remaining}/{dailyLimit} Restantes
                        </span>
                      </div>
                      <span className="text-[9px] text-zinc-600 uppercase tracking-tighter">Reseta a cada 24h</span>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => openOrder(TRIAL_PLAN, true)}
                  disabled={blocked}
                  className="h-12 w-full bg-primary font-bold text-black hover:bg-primary/90 active:scale-[0.98] sm:h-11 sm:w-auto sm:px-8 disabled:opacity-50 shadow-[0_0_20px_rgba(var(--primary),0.3)]"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {blocked ? "Limite atingido" : "Gerar Teste"}
                </Button>
              </div>
            </Card>
          );
        })()}

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-600">
            <ShoppingCart className="h-8 w-8" />
          </div>
          <p className="text-sm font-medium text-zinc-500">Nenhum plano disponível ainda.</p>
        </div>
      ) : extensions.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-600">
            <Package className="h-8 w-8" />
          </div>
          <p className="text-sm font-medium text-zinc-500">Você ainda não tem extensões liberadas.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Extension selector - Premium style */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-md space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 pl-1">
                Escolha o Produto
              </Label>
              <Select value={selectedExtId} onValueChange={setSelectedExtId}>
                <SelectTrigger className="h-12 border-white/10 bg-white/5 backdrop-blur-xl focus:ring-primary/20">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0F0F11] backdrop-blur-xl">
                  {extensions.map((e) => (
                    <SelectItem key={e.id} value={e.id} className="focus:bg-primary focus:text-black">
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {selectedExtId && (() => {
              const hasPartner = plans.some((p) => partnerOverrides[`${selectedExtId}|${p.license_type}`] !== undefined);
              const hasCustom = plans.some((p) => resellerPrices[`${selectedExtId}|${p.license_type}`] > 0);
              if (hasPartner || hasCustom) {
                return (
                  <Badge variant="outline" className="h-7 border-primary/30 bg-primary/10 px-3 text-[10px] font-bold text-primary uppercase animate-pulse">
                    ✨ Benefícios Exclusivos Ativos
                  </Badge>
                );
              }
              return null;
            })()}
          </div>

          {/* Pricing Grid - Mobile optimized */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {plans.map((p) => {
              const { price: final, base, source } = computePrice(p, selectedExtId);
              const currentIdx = tier ? allTiers.findIndex((x) => x.id === tier.id) : -1;
              const upcomingTiers = currentIdx >= 0 ? allTiers.slice(currentIdx + 1) : allTiers;
              const isOpen = !!expanded[p.license_type];
              const showStrike = source !== "partner" && discountPct > 0;
              
              return (
                <Card 
                  key={p.license_type}
                  className={cn(
                    "group relative overflow-hidden border-white/5 bg-[#161618] transition-all hover:border-primary/30 hover:shadow-[0_0_30px_rgba(var(--primary),0.05)]",
                    source === "partner" && "border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent",
                    source === "reseller" && "border-blue-500/20 bg-gradient-to-br from-blue-500/[0.03] to-transparent"
                  )}
                >
                  {/* Glassmorphism Effect on Hover */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  
                  <div className="relative p-4 sm:p-5">
                    {/* Layout Mobile: Horizontal | Layout Desktop: Vertical */}
                    <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0">
                      
                      {/* Info Section */}
                      <div className="flex flex-1 flex-col sm:mb-6">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-400 ring-1 ring-white/10 transition-colors group-hover:bg-primary/10 group-hover:text-primary group-hover:ring-primary/20 sm:hidden",
                            source === "partner" && "bg-primary/10 text-primary ring-primary/20"
                          )}>
                            <KeyRound className="h-4 w-4" />
                          </div>
                          <div className="space-y-0.5">
                            <h3 className="font-display text-sm font-bold tracking-tight text-white sm:text-lg sm:font-black">
                              {p.label ?? FALLBACK_LABEL[p.license_type] ?? p.license_type}
                            </h3>
                            {source === "partner" && (
                              <div className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 ring-1 ring-primary/20 sm:hidden">
                                <Sparkles className="h-2.5 w-2.5 text-primary" />
                                <span className="text-[8px] font-bold text-primary uppercase">Partner</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <p className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 sm:block">
                          {p.license_type}
                        </p>
                        
                        {/* Price Section Mobile */}
                        <div className="mt-2 space-y-1 sm:hidden">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Preço Venda</span>
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-display text-lg font-black text-white">{fmt(final)}</span>
                              {showStrike && base !== final && (
                                <span className="text-[10px] font-medium text-zinc-500 line-through">{fmt(base)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between border-t border-white/5 pt-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Custo</span>
                            <span className="font-mono text-[10px] font-bold text-primary">{fmt(final)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Price Section Desktop */}
                      <div className="hidden flex-col sm:mb-6 sm:flex">
                        <div className="space-y-3">
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Preço Sugerido</span>
                            <div className="flex items-baseline gap-2">
                              <span className="font-display text-3xl font-black tracking-tight text-white">{fmt(final)}</span>
                              {showStrike && base !== final && (
                                <span className="text-sm font-medium text-zinc-500 line-through">{fmt(base)}</span>
                              )}
                            </div>
                          </div>
                          
                          <div className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Custo Total</span>
                              <span className="font-mono text-xs font-bold text-primary">{fmt(final)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          {source === "partner" ? (
                            <Badge className="bg-primary text-[10px] font-black text-black uppercase">
                              Preço Partner
                            </Badge>
                          ) : discountPct > 0 ? (
                            <span className="text-[10px] font-bold text-primary">
                              -{discountPct}% de desconto aplicado
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Buy Button */}
                      <Button
                        onClick={() => openOrder(p, false)}
                        className={cn(
                          "relative h-11 px-6 font-bold transition-all sm:h-12 sm:w-full overflow-hidden",
                          source === "partner" 
                            ? "bg-primary text-black hover:bg-primary/90 shadow-[0_10px_20px_-10px_rgba(var(--primary),0.5)]" 
                            : "bg-white/5 text-white hover:bg-primary hover:text-black"
                        )}
                      >
                        <div className="relative flex items-center justify-center gap-2">
                          <ShoppingCart className="h-4 w-4" />
                          <span className="text-xs uppercase tracking-widest sm:text-sm">Comprar</span>
                        </div>
                      </Button>
                    </div>

                    {source !== "partner" && upcomingTiers.length > 0 && (
                      <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
                        <button
                          onClick={() => setExpanded({ ...expanded, [p.license_type]: !isOpen })}
                          className="flex w-full items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-widest text-zinc-500 transition-colors hover:text-primary"
                        >
                          Tabela de Descontos
                          <ChevronDown className={cn("h-3 w-3 transition-transform duration-300", isOpen && "rotate-180")} />
                        </button>
                        
                        {isOpen && (
                          <div className="space-y-2 rounded-xl bg-black/20 p-3 ring-1 ring-white/5 animate-in fade-in zoom-in-95 duration-300">
                            {upcomingTiers.map((nt) => {
                              const ntPrice = Math.round(base * (1 - Number(nt.discount_percent) / 100));
                              return (
                                <div key={nt.id} className="flex items-center justify-between text-[10px]">
                                  <div className="flex items-center gap-2 text-zinc-400">
                                    <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: nt.color }} />
                                    <span>{nt.name}</span>
                                  </div>
                                  <span className="font-mono font-bold text-white">{fmt(ntPrice)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-xl md:block">
        <div className="border-b border-white/5 px-6 py-4">
          <h3 className="font-display text-sm font-black uppercase tracking-widest text-white">Últimos pedidos</h3>
        </div>
        {orders.length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-500">Nenhum pedido realizado ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 bg-white/[0.03]">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Data</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tipo</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Status</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Chave</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500">Valor</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((o) => {
                  const canManage = !!o.license_key && !["deleted", "failed", "refunded"].includes(o.status);
                  const isBusy = actionLoading?.startsWith(`${o.id}:`);
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="px-6 py-4 text-xs text-zinc-400">{new Date(o.created_at).toLocaleString("pt-BR")}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-zinc-300">{FALLBACK_LABEL[o.license_type] ?? o.license_type}</span>
                          {o.is_test && (
                            <Badge variant="outline" className="border-primary/20 bg-primary/10 text-[9px] font-bold text-primary uppercase">Teste</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">{statusBadge(o.status)}</td>
                      <td className="px-6 py-4">
                        {o.license_key ? (
                          <button
                            onClick={() => { navigator.clipboard.writeText(o.license_key!); toast.success("Chave copiada"); }}
                            className="group flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 transition-all hover:bg-white/10"
                          >
                            <span className="font-mono text-[11px] text-zinc-400">{o.license_key.slice(0, 12)}…</span>
                            <Copy className="h-3 w-3 text-zinc-600 transition-colors group-hover:text-primary" />
                          </button>
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {o.is_test ? <span className="text-[10px] font-bold uppercase text-primary">Grátis</span> : <span className="font-mono font-bold text-white">{fmt(o.price_cents)}</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {canManage ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 border border-white/5 bg-white/5 text-zinc-400" disabled={isBusy}>
                                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 border-white/10 bg-[#0F0F11]">
                              <DropdownMenuItem className="text-xs" onClick={() => runLicenseAction(o, "reset-hwid", "Resetar HWID?")}>
                                <RefreshCcw className="mr-2 h-3.5 w-3.5" /> Resetar HWID
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-white/5" />
                              <DropdownMenuItem className="text-xs text-rose-500" onClick={() => runLicenseAction(o, "revoke-license", "Revogar permanentemente?")}>
                                <Ban className="mr-2 h-3.5 w-3.5" /> Revogar licença
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : <span className="text-zinc-600">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile Card View for Last Orders */}
      <div className="space-y-4 md:hidden">
        <div className="px-1 pt-4 pb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-black uppercase tracking-widest text-white">Últimos pedidos</h3>
          <span className="text-[10px] font-bold text-zinc-600 uppercase">{orders.length} Total</span>
        </div>
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
            <p className="text-xs text-zinc-500">Nenhum pedido realizado.</p>
          </div>
        ) : (
          orders.map((o) => {
            const isBusy = actionLoading?.startsWith(`${o.id}:`);
            const canManage = !!o.license_key && !["deleted", "failed", "refunded"].includes(o.status);
            return (
              <Card key={o.id} className="border-white/5 bg-white/[0.02] p-4 active:scale-[0.98] transition-all">
                <div className="mb-3 flex items-start justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
                    <div className="flex items-center gap-2">
                      <h4 className="font-display text-sm font-bold text-white">{FALLBACK_LABEL[o.license_type] ?? o.license_type}</h4>
                      {o.is_test && <Badge className="bg-primary px-1.5 py-0 text-[8px] font-black text-black uppercase">Teste</Badge>}
                    </div>
                  </div>
                  {statusBadge(o.status)}
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl bg-white/[0.03] p-3">
                  <div>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">Chave</p>
                    {o.license_key ? (
                      <button 
                        onClick={() => { navigator.clipboard.writeText(o.license_key!); toast.success("Copiada"); }}
                        className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-300"
                      >
                        <span className="truncate">{o.license_key.slice(0, 10)}...</span>
                        <Copy className="h-3 w-3 text-zinc-600" />
                      </button>
                    ) : <span className="text-xs text-zinc-600">—</span>}
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-zinc-600">Valor</p>
                    <p className="font-mono text-xs font-black text-white">{o.is_test ? "GRÁTIS" : fmt(o.price_cents)}</p>
                  </div>
                </div>

                {canManage && (
                  <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/5 pt-3">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 bg-white/5 text-[10px] font-bold text-zinc-400"
                      onClick={() => runLicenseAction(o, "reset-hwid", "Resetar HWID?")}
                      disabled={isBusy}
                    >
                      Resetar HWID
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 bg-rose-500/10 text-[10px] font-bold text-rose-500"
                      onClick={() => runLicenseAction(o, "revoke-license", "Revogar licença?")}
                      disabled={isBusy}
                    >
                      Revogar
                    </Button>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {isTest ? "Gerar teste — " : "Comprar — "}
              {open?.label ?? (open && FALLBACK_LABEL[open.license_type])}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isTest ? (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5 text-primary" /> Licença teste
                  </span>
                  <span className="font-mono text-lg font-semibold text-primary">Grátis</span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Não debita do seu saldo. Limite a cada 24h conforme seu nível.
                </div>
              </div>
            ) : (
              (() => {
                if (!open) return null;
                const { price, base, source } = computePrice(open, selectedExtId);
                const extName = extensions.find((e) => e.id === selectedExtId)?.name;
                return (
                  <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total a debitar</span>
                      <span className="font-mono text-lg font-semibold text-primary">{fmt(price)}</span>
                    </div>
                    {extName && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Extensão: <span className="font-medium text-foreground">{extName}</span>
                      </div>
                    )}
                    {source === "partner" ? (
                      <div className="mt-1 text-[11px] text-primary">
                        ✨ Preço Partner exclusivo (sem desconto adicional)
                      </div>
                    ) : source === "reseller" ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Preço personalizado {fmt(base)}{discountPct > 0 ? ` · desconto ${discountPct}% nível ${tier?.name}` : ""}
                      </div>
                    ) : discountPct > 0 ? (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Preço base {fmt(base)} · desconto {discountPct}% nível {tier?.name}
                      </div>
                    ) : null}
                  </div>
                );
              })()
            )}
            <div className="space-y-1.5">
              <Label>Atribuir a um cliente (opcional)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Não atribuir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Apenas gerar chave —</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.display_name ?? c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>
                WhatsApp do cliente {isTest ? <span className="text-muted-foreground text-[10px] uppercase">opcional</span> : <span className="text-destructive">*</span>}
              </Label>
              <Input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Ex: 11 91234-5678"
                inputMode="tel"
                required={!isTest}
              />
              <p className="text-[11px] text-muted-foreground">
                {isTest
                  ? "Se informado, enviamos a chave por WhatsApp. Pode deixar em branco."
                  : "Apenas números (DDD + número). Cada WhatsApp é vinculado a um único contato."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>
                Nome exibido na licença <span className="text-destructive">*</span>
                {lookingUp && <span className="ml-2 text-[10px] text-muted-foreground">verificando…</span>}
              </Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Cliente João"
                required
                disabled={!!matchedCustomer}
              />
              {matchedCustomer ? (
                <p className="text-[11px] text-emerald-500">
                  Contato já cadastrado — usando o nome <span className="font-semibold">{matchedCustomer.display_name}</span>.
                </p>
              ) : (
                whatsapp && onlyDigits(whatsapp).length >= 10 && (
                  <p className="text-[11px] text-muted-foreground">Novo contato — será salvo automaticamente.</p>
                )
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : (isTest ? "Gerar teste grátis" : "Confirmar pedido")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}
