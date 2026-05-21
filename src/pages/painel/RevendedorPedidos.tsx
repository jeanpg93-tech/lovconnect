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
  BookOpen, Zap, Globe, Terminal, FileDown, Puzzle, ShieldCheck,
  ArrowRight, Wallet, Search
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
type MethodId = "flow" | "lovax";
type PackId = "1d" | "7d" | "30d" | "90d" | "365d" | "lifetime";
type Pack = { id: PackId; label: string; desc: string };
type LicMethodPlan = {
  method: MethodId;
  pack: Pack;
  cost_cents: number;     // preço do nível (definido pelo gerente)
  sale_cents: number | null; // preço de venda do revendedor (override)
};

const METHOD_LABEL: Record<MethodId, string> = { flow: "Flow", lovax: "Lovax" };

const BASE_PACKS: Pack[] = [
  { id: "1d", label: "1 dia", desc: "Acesso por 24h" },
  { id: "7d", label: "7 dias", desc: "Acesso semanal" },
  { id: "30d", label: "30 dias", desc: "Acesso mensal" },
  { id: "lifetime", label: "Vitalícia", desc: "Acesso permanente" },
];
const PACKS_BY_METHOD: Record<MethodId, Pack[]> = {
  flow: BASE_PACKS,
  lovax: [
    { id: "1d", label: "1 dia", desc: "Acesso por 24h" },
    { id: "7d", label: "7 dias", desc: "Acesso semanal" },
    { id: "30d", label: "30 dias", desc: "Acesso mensal" },
    { id: "90d", label: "90 dias", desc: "Acesso trimestral" },
    { id: "365d", label: "365 dias", desc: "Acesso anual" },
    { id: "lifetime", label: "Vitalícia", desc: "Acesso permanente" },
  ],
};
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

  // Métodos / pacotes (modelo licencas.valores) — preços por nível setados pelo gerente
  // valores: method -> pack_id -> tier_id -> BRL
  const [licValores, setLicValores] = useState<Record<string, Record<string, Record<string, number>>>>({});
  // override de venda do revendedor: method|pack_id -> cents
  const [resellerSalePrices, setResellerSalePrices] = useState<Record<string, number>>({});
  const [availableMethods, setAvailableMethods] = useState<MethodId[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<MethodId>("flow");
  // Método habilitado pelo gerente (compartilhado via app_settings).
  // Apenas esse método pode ser usado para gerar licenças.
  const [enabledMethod, setEnabledMethod] = useState<MethodId | null>(null);

  const [open, setOpen] = useState<Plan | null>(null);
  // contexto da compra atual quando é via método/pack
  const [openMethodCtx, setOpenMethodCtx] = useState<{ method: MethodId; pack: Pack; cost_cents: number } | null>(null);
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
      { data: licSetting }, { data: salePrices }, { data: deliverySetting },
    ] = await Promise.all([
      supabase.from("pricing_plans").select("license_type,label,price_cents,cost_cents,min_price_cents,is_active").eq("is_active", true),
      supabase.from("profiles").select("id,email,display_name").eq("reseller_id", r.id),
      supabase.from("orders").select("id,license_type,price_cents,status,license_key,created_at,is_test").eq("reseller_id", r.id).order("created_at", { ascending: false }).limit(20),
      supabase.rpc("get_reseller_tier", { _reseller_id: r.id }),
      supabase.from("reseller_tiers").select("id,name,color,min_spent_cents,discount_percent,sort_order,is_active").eq("is_active", true).order("min_spent_cents", { ascending: true }),
      supabase.from("reseller_tier_state").select("total_spent_cents").eq("reseller_id", r.id).maybeSingle(),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("reseller_id", r.id).eq("is_test", true).gte("created_at", sinceToday),
      // Preços definidos pelo gerente (modelo licencas.valores)
      supabase.from("app_settings").select("value").eq("key", "licencas.valores").maybeSingle(),
      // Preço de venda do revendedor (sale price) por método/pack
      supabase.from("reseller_license_prices").select("method,pack_id,price_cents").eq("reseller_id", r.id),
      // Método de entrega habilitado pelo gerente
      supabase.from("app_settings").select("value").eq("key", "licencas.delivery.method").maybeSingle(),
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

    const valores = (licSetting?.value ?? {}) as Record<string, any>;
    setLicValores(valores as any);
    const methods = (Object.keys(valores).filter((m) => m === "flow" || m === "lovax") as MethodId[]);
    setAvailableMethods(methods);

    const enabledRaw = (deliverySetting?.value as any)?.method;
    const enabled: MethodId | null =
      enabledRaw === "flow" || enabledRaw === "lovax" ? enabledRaw : null;
    setEnabledMethod(enabled);
    // Força a seleção para o método habilitado (se houver e estiver disponível)
    setSelectedMethod((cur) => {
      if (enabled && methods.includes(enabled)) return enabled;
      return methods.includes(cur) ? cur : (methods[0] ?? "flow");
    });

    const saleMap: Record<string, number> = {};
    (salePrices ?? []).forEach((row: any) => {
      saleMap[`${row.method}|${row.pack_id}`] = row.price_cents;
    });
    setResellerSalePrices(saleMap);

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
  // Custo (preço do gerente) para um pacote do método, no nível atual — em cents
  const getCostCents = (method: MethodId, pack: PackId): number => {
    if (!tier?.id) return 0;
    const brl = Number(licValores?.[method]?.[pack]?.[tier.id] ?? 0);
    return Math.round(brl * 100);
  };
  // Preço de venda definido pelo revendedor (override) — em cents
  const getSaleCents = (method: MethodId, pack: PackId): number | null => {
    const v = resellerSalePrices[`${method}|${pack}`];
    return v && v > 0 ? v : null;
  };

  const onlyDigits = (s: string) => s.replace(/\D+/g, "");

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Minhas Licenças — listagem completa (toggle "Ver todas")
  const [allOrders, setAllOrders] = useState<Order[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [licSearch, setLicSearch] = useState("");
  const [licStatusFilter, setLicStatusFilter] = useState<string>("all");

  const loadAllOrders = async () => {
    if (!resellerId) return;
    setLoadingAll(true);
    const { data } = await supabase
      .from("orders")
      .select("id,license_type,price_cents,status,license_key,created_at,is_test")
      .eq("reseller_id", resellerId)
      .order("created_at", { ascending: false })
      .limit(1000);
    setAllOrders((data ?? []) as Order[]);
    setLoadingAll(false);
  };

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
    if (allOrders) loadAllOrders();
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
    const usingMethodCtx = !!openMethodCtx && !isTest;
    const { data, error } = usingMethodCtx
      ? await supabase.functions.invoke("place-method-license-order", {
          body: {
            method: openMethodCtx!.method,
            pack_id: openMethodCtx!.pack.id,
            client_id: clientId === "none" ? null : clientId,
            display_name: name,
            whatsapp: wa,
          },
        })
      : await supabase.functions.invoke("place-reseller-order", {
          body: {
            license_type: open.license_type,
            extension_id: null,
            client_id: clientId === "none" ? null : clientId,
            display_name: name,
            whatsapp: wa,
            is_test: isTest,
            method: isTest ? selectedMethod : undefined,
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
    setOpenMethodCtx(null);
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
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent p-6 sm:p-10 backdrop-blur-xl">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-56 w-56 rounded-full bg-blue-500/5 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.04),transparent_60%)]" />

          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 backdrop-blur-sm w-fit">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Entrega instantânea</span>
              </div>

              <div className="space-y-3">
                <h1 className="font-display text-4xl md:text-5xl font-black tracking-tighter leading-[1.05] text-white">
                  Licenças das suas <span className="italic text-primary">extensões</span>
                </h1>
                <p className="text-sm md:text-base text-zinc-400 leading-relaxed max-w-xl">
                  Compre, gere e gerencie chaves para Flow, Lovax e todas as extensões liberadas — direto do seu saldo, com preço definido pelo seu nível.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {availableMethods.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300"
                  >
                    <Puzzle className="h-3 w-3 text-primary" />
                    {METHOD_LABEL[m]}
                  </span>
                ))}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-sm p-4 transition-all hover:border-primary/40">
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                <div className="relative flex items-center gap-2 mb-2">
                  <Puzzle className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em]">Métodos</span>
                </div>
                <div className="relative text-2xl md:text-3xl font-black tabular-nums tracking-tight text-white">
                  {availableMethods.length}
                </div>
                <div className="relative mt-1 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                  disponíveis
                </div>
              </div>

              <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-sm p-4 transition-all hover:border-primary/40">
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                <div className="relative flex items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Crown className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em] truncate">Seu nível</span>
                  </div>
                  {tier && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider shrink-0"
                      style={{
                        backgroundColor: `${tier.color}1f`,
                        color: tier.color,
                      }}
                    >
                      {discountPct > 0 ? `-${discountPct}%` : "Ativo"}
                    </span>
                  )}
                </div>
                <div className="relative text-2xl md:text-3xl font-black tracking-tight text-white">
                  {tier?.name ?? "—"}
                </div>
                <div className="relative mt-1 text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                  desconto aplicado
                </div>
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="plans" className="space-y-6">
          <div className="flex items-center justify-center">
            <TabsList className="bg-transparent h-12 gap-2 sm:gap-8 px-0 w-full sm:w-auto justify-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <TabsTrigger value="plans" className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-xs sm:text-sm transition-all px-3 sm:px-4">
                Planos
              </TabsTrigger>
              <TabsTrigger value="instructions" className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-xs sm:text-sm transition-all px-3 sm:px-4">
                Instruções
              </TabsTrigger>
              <TabsTrigger value="api" className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-xs sm:text-sm transition-all px-3 sm:px-4">
                API's
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="plans" className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 outline-none">

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : availableMethods.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-600">
            <Package className="h-8 w-8" />
          </div>
          <p className="text-sm font-medium text-zinc-500">O gerente ainda não definiu preços de licenças.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3">
            <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 pl-1">
              Escolha o método para gerar licenças
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {availableMethods.map((m) => {
                const active = m === selectedMethod;
                const disabled = !!enabledMethod && m !== enabledMethod;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { if (!disabled) setSelectedMethod(m); }}
                    disabled={disabled}
                    title={disabled ? "Método desabilitado pelo gerente no momento" : undefined}
                    className={cn(
                      "group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
                      active
                        ? "border-primary/40 bg-primary text-black shadow-[0_0_20px_rgba(var(--primary),0.25)]"
                        : disabled
                          ? "border-white/5 bg-white/[0.02] text-zinc-600 cursor-not-allowed opacity-60"
                          : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-primary/30 hover:text-white"
                    )}
                  >
                    <Puzzle className={cn("h-3.5 w-3.5", active ? "text-black" : disabled ? "text-zinc-600" : "text-primary")} />
                    <span>{METHOD_LABEL[m]}</span>
                    {disabled && (
                      <span className="ml-1 rounded-full border border-white/10 bg-white/5 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-zinc-500">
                        Indisponível
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {enabledMethod && (
              <p className="pl-1 text-[10px] text-zinc-500">
                Apenas o método <span className="font-bold text-zinc-300">{METHOD_LABEL[enabledMethod]}</span> está habilitado pelo gerente no momento.
              </p>
            )}
          </div>

          {(() => {
            const packs = PACKS_BY_METHOD[selectedMethod];
            const visible = packs.filter((pk) => getCostCents(selectedMethod, pk.id) > 0);
            if (visible.length === 0) {
              return (
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center backdrop-blur-xl">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-600">
                    <ShoppingCart className="h-8 w-8" />
                  </div>
                  <p className="text-sm font-medium text-zinc-500">Nenhum preço definido para este método no seu nível.</p>
                </div>
              );
            }
            return (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {(() => {
                  const dailyLimit = resellerId === '97959674-f4bd-4eb3-9fa1-37cd115a77df'
                    ? 50
                    : Number(tier?.test_keys_per_day ?? 10);
                  const used = testsLast24h;
                  const remaining = Math.max(0, dailyLimit - used);
                  const blocked = dailyLimit <= 0 || remaining <= 0;
                  return (
                    <Card className="group relative overflow-hidden border-primary/30 bg-[#161618] transition-all hover:border-primary/50 hover:shadow-[0_0_30px_rgba(var(--primary),0.1)]">
                      <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-transparent" />
                      <div className="relative p-4 sm:p-5">
                        <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0">
                          <div className="flex flex-1 flex-col sm:mb-6">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30 sm:hidden">
                                <Sparkles className="h-4 w-4" />
                              </div>
                              <h3 className="font-display text-sm font-bold tracking-tight text-white sm:text-lg sm:font-black">
                                Teste 15min
                              </h3>
                            </div>
                            <p className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-primary sm:block mt-1">
                              Licença trial gratuita
                            </p>
                            <div className="mt-2 space-y-1 sm:hidden">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Preço</span>
                                <span className="font-display text-lg font-black text-primary">Grátis</span>
                              </div>
                              <div className="flex items-center justify-between border-t border-white/5 pt-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Restantes</span>
                                <span className="font-mono text-[10px] font-bold text-primary">{remaining}/{dailyLimit}</span>
                              </div>
                            </div>
                          </div>
                          <div className="hidden flex-col sm:mb-6 sm:flex">
                            <div className="space-y-3">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Preço</span>
                                <div className="flex items-baseline gap-2">
                                  <span className="font-display text-3xl font-black tracking-tight text-primary">Grátis</span>
                                </div>
                              </div>
                              <div className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Restantes hoje</span>
                                  <span className="font-mono text-xs font-bold text-primary">{remaining}/{dailyLimit}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <Button
                            onClick={() => openOrder(TRIAL_PLAN, true)}
                            disabled={blocked}
                            className="relative h-11 px-6 font-bold transition-all sm:h-12 sm:w-full overflow-hidden bg-primary text-black hover:bg-primary/90 disabled:opacity-50"
                          >
                            <div className="relative flex items-center justify-center gap-2">
                              <Sparkles className="h-4 w-4" />
                              <span className="text-xs uppercase tracking-widest sm:text-sm">
                                {blocked ? "Esgotado" : "Gerar Teste"}
                              </span>
                            </div>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })()}
                {visible.map((pk) => {
                  const cost = getCostCents(selectedMethod, pk.id);
                  const sale = getSaleCents(selectedMethod, pk.id);
                  const displayPrice = sale ?? cost;
                  const showSale = !!sale;
                  return (
                    <Card key={pk.id} className="group relative overflow-hidden border-white/5 bg-[#161618] transition-all hover:border-primary/30 hover:shadow-[0_0_30px_rgba(var(--primary),0.05)]">
                      <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      <div className="relative p-4 sm:p-5">
                        <div className="flex flex-row items-center justify-between gap-4 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0">
                          <div className="flex flex-1 flex-col sm:mb-6">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-400 ring-1 ring-white/10 sm:hidden">
                                <KeyRound className="h-4 w-4" />
                              </div>
                              <h3 className="font-display text-sm font-bold tracking-tight text-white sm:text-lg sm:font-black">
                                {pk.label}
                              </h3>
                            </div>
                            <p className="hidden text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 sm:block mt-1">
                              {pk.desc}
                            </p>
                            <div className="mt-2 space-y-1 sm:hidden">
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{showSale ? "Venda" : "Preço"}</span>
                                <span className="font-display text-lg font-black text-white">{fmt(displayPrice)}</span>
                              </div>
                              <div className="flex items-center justify-between border-t border-white/5 pt-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Custo</span>
                                <span className="font-mono text-[10px] font-bold text-primary">{fmt(cost)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="hidden flex-col sm:mb-6 sm:flex">
                            <div className="space-y-3">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{showSale ? "Preço de venda" : "Preço sugerido"}</span>
                                <div className="flex items-baseline gap-2">
                                  <span className="font-display text-3xl font-black tracking-tight text-white">{fmt(displayPrice)}</span>
                                </div>
                              </div>
                              <div className="rounded-lg bg-white/5 p-2 ring-1 ring-white/10">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">Custo (seu nível)</span>
                                  <span className="font-mono text-xs font-bold text-primary">{fmt(cost)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              setOpenMethodCtx({ method: selectedMethod, pack: pk, cost_cents: cost });
                              setIsTest(false);
                              setOpen({
                                license_type: `${selectedMethod}_${pk.id}`,
                                label: `${METHOD_LABEL[selectedMethod]} · ${pk.label}`,
                                price_cents: cost,
                                cost_cents: cost,
                                is_active: true,
                              });
                            }}
                            className="relative h-11 px-6 font-bold transition-all sm:h-12 sm:w-full overflow-hidden bg-white/5 text-white hover:bg-primary hover:text-black"
                          >
                            <div className="relative flex items-center justify-center gap-2">
                              <ShoppingCart className="h-4 w-4" />
                              <span className="text-xs uppercase tracking-widest sm:text-sm">Gerar</span>
                            </div>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

                    </TabsContent>

          <TabsContent value="instructions" className="animate-in fade-in slide-in-from-bottom-8 duration-700 outline-none">
            <div className="space-y-6">
              <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                <div className="relative flex items-start gap-4 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Como usar</span>
                    <h3 className="font-display text-2xl font-bold tracking-tight">Guia rápido das licenças</h3>
                    <p className="text-sm text-muted-foreground mt-1">Passo a passo para comprar, entregar e gerenciar licenças das extensões.</p>
                  </div>
                </div>
                <ol className="space-y-3">
                  {[
                    { t: "Escolha a extensão", d: "Na aba Planos, selecione qual extensão será licenciada (Flow, Lovax, etc.)." },
                    { t: "Escolha o pacote", d: "Cada plano (1 dia, 7, 15, 30 dias ou vitalícia) usa o preço definido pelo gerente conforme o seu nível." },
                    { t: "Atribua a um cliente (opcional)", d: "Informe nome e WhatsApp do cliente para vincular a licença e enviar a chave automaticamente." },
                    { t: "Confirme o pedido", d: "O valor é debitado do seu saldo e a chave é gerada na hora." },
                    { t: "Gerencie a licença", d: "Use as ações (Resetar HWID, Revogar) na tabela 'Últimos pedidos' sempre que precisar." },
                  ].map((s, i) => (
                    <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-background/40 border border-border">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary text-[11px] font-black">{i + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{s.t}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.d}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
                  <div className="flex items-center gap-2 text-primary"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">Teste grátis</span></div>
                  <p className="text-sm font-semibold">Licença TRIAL de 15 minutos</p>
                  <p className="text-xs text-muted-foreground">Use o botão "Gerar Teste" no topo da aba Planos para criar uma chave gratuita por 15 minutos. O limite diário depende do seu nível.</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
                  <div className="flex items-center gap-2 text-primary"><ShieldCheck className="h-4 w-4" /><span className="text-[10px] font-black uppercase tracking-widest">Resetar HWID</span></div>
                  <p className="text-sm font-semibold">Cliente trocou de máquina?</p>
                  <p className="text-xs text-muted-foreground">Em "Últimos pedidos", abra o menu da licença e clique em "Resetar HWID" para liberar o uso em outro dispositivo.</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="api" className="animate-in fade-in slide-in-from-bottom-8 duration-700 outline-none">
            {(() => {
              const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reseller-api`;
              const endpoints = [
                { method: "GET",  path: "/status",                  desc: "Saúde da API" },
                { method: "GET",  path: "/saldo",                   desc: "Saldo atual em centavos" },
                { method: "GET",  path: "/metodos",                 desc: "Lista métodos (Flow/Lovax) com pacotes e preços" },
                { method: "POST", path: "/licencas",                desc: "Gerar licença unificada — body: { metodo, pacote, display_name, whatsapp? }" },
                { method: "POST", path: "/licencas-trial",          desc: "Gerar trial 15min — body: { metodo, display_name }" },
                { method: "POST", path: "/reset-hwid",              desc: "Resetar HWID — body: { license_key }" },
                { method: "POST", path: "/revoke-license",          desc: "Revogar licença — body: { license_key }" },
                { method: "POST", path: "/delete-license",          desc: "Excluir licença — body: { license_key }" },
              ];
              const fullSample = `# API Unificada de Licenças — Flow + Lovax em 1 só endpoint\n# URL base: ${API_BASE}\n# Header obrigatório: X-API-Key: SUA_CHAVE\n\n# 1) Listar métodos disponíveis com preços\ncurl -X GET "${API_BASE}/metodos" \\\n  -H "X-API-Key: SUA_API_KEY"\n\n# 2) Gerar licença (escolha 'flow' ou 'lovax')\ncurl -X POST "${API_BASE}/licencas" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "metodo": "flow",\n    "pacote": "30d",\n    "display_name": "Cliente João",\n    "whatsapp": "11912345678"\n  }'\n\n# 3) Gerar trial gratuito de 15min\ncurl -X POST "${API_BASE}/licencas-trial" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "metodo": "lovax", "display_name": "Teste Cliente" }'`;
              return (
                <div className="grid lg:grid-cols-1 gap-6">
                  <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card p-5 sm:p-8 space-y-6 transition-all hover:border-primary/40">
                    <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
                    <div className="relative flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
                          <Puzzle className="h-6 w-6" />
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Revendedores</span>
                          <h3 className="font-display text-2xl font-bold tracking-tight">API de Licenças</h3>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">Online</span>
                    </div>

                    <p className="relative text-sm text-muted-foreground font-medium leading-relaxed">
                      Gere, consulte e gerencie licenças das suas extensões via REST. Use o header <code className="font-mono text-primary">X-API-Key</code> em todas as requisições. Sua chave fica em "API de Chaves" no menu lateral.
                    </p>

                    <div className="relative space-y-3">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">URL base</span>
                      </div>
                      <div className="p-4 rounded-xl bg-secondary border border-border font-mono text-[11px] break-all">
                        {API_BASE}
                      </div>
                    </div>

                    <div className="relative space-y-2">
                      <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Endpoints disponíveis</span>
                      </div>
                      <div className="rounded-xl border border-border overflow-hidden">
                        {endpoints.map((e, i) => (
                          <div key={i} className={cn("flex items-center gap-3 px-3 py-2.5 text-xs", i !== endpoints.length - 1 && "border-b border-border")}>
                            <span className={cn(
                              "px-2 py-0.5 rounded-md font-mono text-[9px] font-black tracking-wider shrink-0 w-12 text-center",
                              e.method === "GET" ? "bg-emerald-500/10 text-emerald-500" : "bg-primary/10 text-primary"
                            )}>{e.method}</span>
                            <code className="font-mono text-[11px] text-foreground truncate">{e.path}</code>
                            <span className="ml-auto text-[10px] text-muted-foreground truncate hidden sm:inline">{e.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="relative flex flex-wrap gap-2 pt-2">
                      <Button variant="outline" className="h-10 px-4 rounded-xl text-xs font-bold" asChild>
                        <a href="/docs/apis-revendedor.pdf" target="_blank" rel="noopener noreferrer">
                          <FileDown className="h-3.5 w-3.5 mr-2" /> PDF
                        </a>
                      </Button>
                      <Button className="h-10 px-4 rounded-xl bg-primary text-white text-xs font-bold" onClick={() => { navigator.clipboard?.writeText(API_BASE); toast.success("URL base copiada!"); }}>
                        <Copy className="h-3.5 w-3.5 mr-2" /> URL base
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-10 px-4 rounded-xl text-xs font-bold"
                        onClick={() => { navigator.clipboard?.writeText(fullSample); toast.success("Cópia completa copiada!"); }}
                      >
                        <Copy className="h-3.5 w-3.5 mr-2" /> Cópia completa
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </TabsContent>
        </Tabs>

      {/* Minhas Licenças — gerencie todas as chaves geradas */}
      {(() => {
        const list = allOrders ?? orders;
        const filtered = list.filter((o) => {
          if (licStatusFilter !== "all" && o.status !== licStatusFilter) return false;
          if (licSearch.trim()) {
            const q = licSearch.trim().toLowerCase();
            return (o.license_key ?? "").toLowerCase().includes(q) ||
              (o.license_type ?? "").toLowerCase().includes(q);
          }
          return true;
        });
        const fmtDate = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
        return (
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-8 space-y-5">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/30">
                  <KeyRound className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Gerenciar acessos</span>
                  <h3 className="font-display text-2xl font-bold tracking-tight">Minhas Licenças</h3>
                  <p className="text-sm text-muted-foreground mt-1">Todas as chaves geradas — copie, resete HWID, revogue ou exclua.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {allOrders ? (
                  <Button variant="outline" size="sm" className="h-9 text-xs font-bold" onClick={() => setAllOrders(null)}>
                    Mostrar apenas recentes
                  </Button>
                ) : (
                  <Button size="sm" className="h-9 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90" onClick={loadAllOrders} disabled={loadingAll}>
                    {loadingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Ver todas as chaves
                  </Button>
                )}
              </div>
            </div>

            <div className="relative flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={licSearch}
                  onChange={(e) => setLicSearch(e.target.value)}
                  placeholder="Buscar por chave ou tipo…"
                  className="pl-9 h-9 text-xs"
                />
              </div>
              <Select value={licStatusFilter} onValueChange={setLicStatusFilter}>
                <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="completed">Concluídas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                  <SelectItem value="revoked">Revogadas</SelectItem>
                  <SelectItem value="deleted">Excluídas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="relative rounded-xl border border-border overflow-hidden">
              {filtered.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  Nenhuma licença encontrada.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((o) => (
                    <div key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4 text-xs hover:bg-background/40 transition-colors">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-[11px] font-bold text-foreground truncate max-w-[260px]">
                            {o.license_key ?? "—"}
                          </code>
                          {o.license_key && (
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard?.writeText(o.license_key!); toast.success("Chave copiada"); }}
                              className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-primary transition"
                              title="Copiar chave"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          )}
                          {o.is_test && (
                            <Badge variant="outline" className="text-[9px] font-bold uppercase border-amber-500/30 bg-amber-500/10 text-amber-500">Teste</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className="font-semibold">{FALLBACK_LABEL[o.license_type] ?? o.license_type}</span>
                          <span>·</span>
                          <span>{fmtDate(o.created_at)}</span>
                        </div>
                      </div>
                      <div className="shrink-0">{statusBadge(o.status)}</div>
                      <div className="shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={!o.license_key || actionLoading?.startsWith(o.id)}>
                              {actionLoading?.startsWith(o.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreVertical className="h-3.5 w-3.5" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => runLicenseAction(o, "reset-hwid", "Resetar HWID desta licença?")}>
                              <RefreshCcw className="h-3.5 w-3.5 mr-2" /> Resetar HWID
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => runLicenseAction(o, "revoke-license", "Revogar esta licença? O cliente perderá o acesso.")}>
                              <Ban className="h-3.5 w-3.5 mr-2" /> Revogar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => runLicenseAction(o, "delete-license", "Excluir esta licença? Esta ação é irreversível.")}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!allOrders && orders.length >= 20 && (
              <p className="relative text-[11px] text-muted-foreground text-center">
                Mostrando apenas as 20 mais recentes. Clique em "Ver todas as chaves" para listar tudo.
              </p>
            )}
          </div>
        );
      })()}

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
                const price = openMethodCtx?.cost_cents ?? open.price_cents;
                const methodName = openMethodCtx ? METHOD_LABEL[openMethodCtx.method] : null;
                return (
                  <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total a debitar</span>
                      <span className="font-mono text-lg font-semibold text-primary">{fmt(price)}</span>
                    </div>
                    {methodName && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Método: <span className="font-medium text-foreground">{methodName}</span>
                      </div>
                    )}
                    {tier && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Preço do seu nível: <span className="font-medium text-foreground">{tier.name}</span>
                      </div>
                    )}
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
