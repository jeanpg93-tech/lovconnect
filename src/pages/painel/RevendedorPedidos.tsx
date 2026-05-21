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
  ArrowRight, Wallet
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
      { data: licSetting }, { data: salePrices },
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
    setSelectedMethod((cur) => (methods.includes(cur) ? cur : (methods[0] ?? "flow")));

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
      ) : extensions.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-600">
            <Package className="h-8 w-8" />
          </div>
          <p className="text-sm font-medium text-zinc-500">Você ainda não tem extensões liberadas.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Extension submenu — pill nav per extension */}
          <div className="flex flex-col gap-3">
            <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 pl-1">
              Escolha a extensão para gerar licenças
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {extensions.map((e) => {
                const active = e.id === selectedExtId;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedExtId(e.id)}
                    className={cn(
                      "group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
                      active
                        ? "border-primary/40 bg-primary text-black shadow-[0_0_20px_rgba(var(--primary),0.25)]"
                        : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-primary/30 hover:text-white"
                    )}
                  >
                    <Puzzle className={cn("h-3.5 w-3.5", active ? "text-black" : "text-primary")} />
                    <span>{e.name}</span>
                  </button>
                );
              })}
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
          </div>

          {plans.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-12 text-center backdrop-blur-xl">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-zinc-600">
                <ShoppingCart className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium text-zinc-500">Nenhum plano disponível para esta extensão.</p>
            </div>
          ) : (
          /* Pricing Grid - Mobile optimized */
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
          )}
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
                { method: "GET",  path: "/planos",                  desc: "Planos disponíveis por extensão" },
                { method: "POST", path: "/licencas",                desc: "Criar licença (comprar)" },
                { method: "GET",  path: "/licencas",                desc: "Listar licenças geradas" },
                { method: "GET",  path: "/licencas/{key}",          desc: "Consultar licença" },
                { method: "POST", path: "/licencas/{key}/reset",    desc: "Resetar HWID" },
                { method: "POST", path: "/licencas/{key}/revoke",   desc: "Revogar licença" },
                { method: "POST", path: "/licencas/trial",          desc: "Gerar licença teste (15min)" },
              ];
              const fullSample = `# API de Licenças — exemplos\n# URL base: ${API_BASE}\n# Header obrigatório: X-API-Key: lov_live_xxxxxxxxxxxxxxxxxxxxxxxx\n\ncurl -X GET "${API_BASE}/planos" \\\n  -H "X-API-Key: SUA_API_KEY"\n\ncurl -X POST "${API_BASE}/licencas" \\\n  -H "X-API-Key: SUA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "extension_id": "ext_xxx",\n    "license_type": "pro_30d",\n    "display_name": "Cliente João",\n    "whatsapp": "11912345678"\n  }'`;
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
