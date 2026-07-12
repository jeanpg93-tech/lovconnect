import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Crown, Lock, Check, Sparkles, TrendingUp, Gift, Percent, Users, Zap, Trophy, Package, Tag, ArrowRight, Shield, Star, Rocket, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

type Tier = {
  id: string;
  slug: string;
  name: string;
  color: string;
  min_spent_cents: number;
  discount_percent: number;
  recharge_bonus_percent: number;
  test_keys_per_day: number;
  referral_commission_percent: number;
  sort_order: number;
  is_hidden: boolean;
};

type Plan = { license_type: string; label: string; price_cents: number; min_price_cents: number };
type Extension = { id: string; name: string };

const LICENSE_ORDER = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];
const FALLBACK_LABEL: Record<string, string> = {
  pro_1d: "Pro 1d",
  pro_7d: "Pro 7d",
  pro_15d: "Pro 15d",
  pro_30d: "Pro 30d",
  lifetime: "Vitalícia",
};

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const isBlackTier = (color: string) => color === '#111827' || color === '#000000';


export default function RevendedorNiveis() {
  const { user } = useAuth();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [currentTierId, setCurrentTierId] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  // key: extension_id|license_type -> price_cents (preço base custom do revendedor)
  const [resellerPrices, setResellerPrices] = useState<Record<string, number>>({});
  // key: extension_id|license_type -> price_cents (override Partner — fixo, ignora desconto)
  const [partnerOverrides, setPartnerOverrides] = useState<Record<string, number>>({});
  // key: tier_id|extension_id|license_type -> price_cents
  const [tierExtensionPrices, setTierExtensionPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r || cancelled) return;
      const [{ data: tierRows }, { data: state }, { data: cur }, { data: pl }, { data: activeExts }, { data: pov }, { data: tep }] = await Promise.all([
        supabase.from("reseller_tiers").select("*").eq("is_hidden", false).order("sort_order"),
        supabase.from("reseller_tier_state").select("total_spent_cents").eq("reseller_id", r.id).maybeSingle(),
        supabase.rpc("get_reseller_tier", { _reseller_id: r.id }),
        supabase.from("pricing_plans_public" as any).select("license_type,label,price_cents,min_price_cents,is_active").eq("is_active", true),
        supabase.from("extensions").select("id,name,is_active").eq("is_active", true),
        supabase.from("reseller_extension_price_overrides").select("extension_id,license_type,price_cents,is_active").eq("reseller_id", r.id),
        supabase.from("tier_extension_prices").select("tier_id,extension_id,license_type,price_cents,is_active").eq("is_active", true),
      ]);
      if (cancelled) return;
      const ts = (tierRows ?? []) as Tier[];
      setTiers(ts);
      setTotalSpent(state?.total_spent_cents ?? 0);
      const curRow: any = Array.isArray(cur) ? cur[0] : cur;
      const curId = curRow?.id ?? null;
      setCurrentTierId(curId);
      setSelectedTierId(curId ?? ts[0]?.id ?? null);

      const sortedPlans = ((pl ?? []) as Plan[])
        .filter(p => LICENSE_ORDER.includes(p.license_type))
        .sort((a, b) => LICENSE_ORDER.indexOf(a.license_type) - LICENSE_ORDER.indexOf(b.license_type));
      setPlans(sortedPlans);

      const exts = (activeExts ?? [])
        .map((e: any) => ({ id: e.id, name: e.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setExtensions(exts);

      const povMap: Record<string, number> = {};
      (pov ?? []).forEach((row: any) => {
        if (row.is_active && row.price_cents >= 0) povMap[`${row.extension_id}|${row.license_type}`] = row.price_cents;
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
    })();
    return () => { cancelled = true; };
  }, [user]);

  const currentIdx = useMemo(() => {
    const idx = tiers.findIndex((t) => t.id === currentTierId);
    if (idx === -1 && tiers.length > 0) return 0;
    return idx;
  }, [tiers, currentTierId]);

  const nextTier = currentIdx >= 0 && currentIdx < tiers.length - 1 ? tiers[currentIdx + 1] : null;
  const progressToNext = nextTier
    ? Math.min(100, Math.max(0, ((totalSpent - tiers[currentIdx].min_spent_cents) /
        (nextTier.min_spent_cents - tiers[currentIdx].min_spent_cents)) * 100))
    : 100;
  const missingForNext = nextTier ? Math.max(0, nextTier.min_spent_cents - totalSpent) : 0;

  const selected = tiers.find((t) => t.id === selectedTierId);

  if (loading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Carregando trilha de níveis...</div>
    );
  }

  if (Object.keys(partnerOverrides).length > 0) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold">Acesso Restrito</h2>
        <p className="text-muted-foreground mt-2">Você possui preços manuais (Partner) e não utiliza o sistema de níveis.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 p-4 md:p-8">
      {/* Decorative bg */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-20 bottom-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-background to-background p-8 border border-primary/10 shadow-2xl"
        >
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-[100px]" />
          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3 flex flex-col items-center sm:items-start sm:block w-full">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary border border-primary/20">
                <Rocket className="h-3 w-3 animate-bounce" /> Evolução de Carreira
              </div>
              <h1 className="font-display text-4xl font-black tracking-tight md:text-5xl lg:text-6xl text-center sm:text-left">
                Suas <span className="text-primary">Patentes</span>
              </h1>
              <p className="max-w-md text-sm font-medium text-muted-foreground leading-relaxed text-center sm:text-left">
                Aumente seu volume de depósitos para desbloquear benefícios de elite e reduzir seus custos operacionais.
              </p>
            </div>
            
            <div className="flex flex-col items-center sm:items-end gap-3 text-center sm:text-left">
              <div className="rounded-3xl border border-white/5 bg-black/40 p-6 backdrop-blur-xl shadow-inner">
                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center sm:text-left mb-1.5">Investimento Acumulado</div>
                <div className="font-display text-3xl font-black text-primary drop-shadow-glow-sm">
                  {formatBRL(totalSpent)}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Status Atual & Progresso */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="grid gap-6 md:grid-cols-2"
        >
          <Card className="group relative overflow-hidden rounded-[2.5rem] border-white/5 bg-card/40 p-8 backdrop-blur-xl transition-all hover:bg-card/50 shadow-xl">
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-glow-sm border border-primary/20 transition-transform group-hover:scale-110">
                    <Shield className="h-7 w-7" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center sm:text-left">Sua Patente Atual</div>
                    <div className="text-2xl font-black uppercase tracking-tighter text-foreground">
                      {tiers[currentIdx]?.name || "Iniciante"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 border border-emerald-500/20">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase text-emerald-500">Ativa</span>
                </div>
              </div>

              {nextTier ? (
                <div className="space-y-5">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center sm:text-left mb-1">Próxima Patente</div>
                      <div className="text-2xl font-black text-primary">{nextTier.name}</div>
                    </div>
                    <div className="text-3xl font-black">{Math.round(progressToNext)}%</div>
                  </div>
                  <div className="h-4 w-full overflow-hidden rounded-full bg-white/5 p-[4px] shadow-inner">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressToNext}%` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="h-full rounded-full bg-gradient-to-r from-primary/40 to-primary shadow-glow-sm relative"
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    </motion.div>
                  </div>
                  <p className="text-[11px] font-bold text-muted-foreground italic flex items-center gap-2">
                    <TrendingUp className="h-3 w-3" /> Faltam <span className="text-foreground font-black">{formatBRL(missingForNext)}</span> para subir de nível.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center bg-emerald-500/5 rounded-[2rem] border border-emerald-500/10">
                  <div className="h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                    <Trophy className="h-8 w-8 text-emerald-500 animate-bounce" />
                  </div>
                  <div className="text-lg font-black uppercase tracking-widest text-emerald-500">Nível Máximo Atingido</div>
                  <p className="text-[10px] text-muted-foreground uppercase mt-1 font-bold">Você está no topo da hierarquia</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="group relative overflow-hidden rounded-[2.5rem] border-primary/10 bg-primary/5 p-8 backdrop-blur-xl transition-all hover:bg-primary/10 shadow-xl">
            <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-red-glow transition-transform group-hover:rotate-6">
                  <Star className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm font-black uppercase tracking-widest">Benefícios Ativos</div>
                  <p className="text-[10px] text-muted-foreground font-bold text-center sm:text-left">Vantagens garantidas pelo seu nível atual</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-3xl bg-black/40 p-5 border border-white/5 shadow-inner group-hover:border-primary/20 transition-colors">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center sm:text-left mb-1">Desconto</div>
                  <div className="text-2xl font-black text-primary">{tiers[currentIdx]?.discount_percent || 0}%</div>
                </div>
                <div className="rounded-3xl bg-black/40 p-5 border border-white/5 shadow-inner group-hover:border-primary/20 transition-colors">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center sm:text-left mb-1">Bônus PIX</div>
                  <div className="text-2xl font-black text-primary">{tiers[currentIdx]?.recharge_bonus_percent || 0}%</div>
                </div>
              </div>

              <Button asChild variant="ghost" className="w-full h-12 rounded-2xl bg-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all border border-white/5">
                <Link to="/painel/revendedor/licencas">Ver Catálogo Completo <ArrowRight className="ml-2 h-3 w-3" /></Link>
              </Button>
            </div>
          </Card>
        </motion.div>

        {/* Trail */}
        <Card className="group relative overflow-hidden rounded-[3rem] border-white/5 bg-card/40 p-8 md:p-12 shadow-2xl backdrop-blur-xl transition-all hover:border-primary/20 border border-white/5">
          <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-primary/5 blur-[100px]" />
          
          <div className="relative z-10 mb-12 flex items-center gap-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-glow-sm border border-primary/20">
              <TrendingUp className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-display text-3xl font-black tracking-tight">Trilha de Evolução</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 text-center sm:text-left">Mapa de patentes e requisitos</p>
            </div>
          </div>

          <div className="relative px-4 pb-8">
            {/* Connecting path */}
            <div className="absolute left-24 right-24 top-12 hidden md:block h-[2px] z-0">
              <div className="h-full bg-white/5" />
              <motion.div
                initial={{ width: 0 }}
                animate={{ 
                  width: `calc(${
                    currentIdx >= 0
                      ? (currentIdx / Math.max(1, tiers.length - 1)) * 100 +
                        (nextTier ? (progressToNext / 100) * (100 / Math.max(1, tiers.length - 1)) : 0)
                      : 0
                  }%)`
                }}
                transition={{ duration: 2, ease: "easeInOut" }}
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary via-primary/60 to-accent/20 shadow-glow-sm"
              />
            </div>

            {/* Tier nodes */}
            <div className="relative z-10 grid gap-12 md:flex md:items-start md:justify-between md:gap-4">
              {tiers.map((t, i) => {
                const reached = i <= currentIdx;
                const isCurrent = t.id === currentTierId;
                const isSelected = t.id === selectedTierId;
                const locked = i > currentIdx;
                return (
                  <motion.button
                    key={t.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 * i }}
                    onClick={() => setSelectedTierId(t.id)}
                    className="group relative flex flex-1 flex-col items-center gap-6 outline-none"
                  >
                    {/* Node */}
                    <div className="relative">
                      {isCurrent && (
                        <div className="absolute inset-[-16px] animate-pulse rounded-full bg-primary/20 blur-xl" />
                      )}
                      
                      <div
                        className={cn(
                          "relative flex h-24 w-24 items-center justify-center rounded-[2.5rem] border-2 transition-all duration-500 shadow-2xl z-10",
                          reached ? "border-primary/50 bg-[#0a0a0a]" : "border-white/5 bg-[#0a0a0a] grayscale opacity-60",
                          isSelected ? "scale-110 border-primary shadow-glow-md" : "hover:scale-105"
                        )}
                        style={{
                          boxShadow: reached && isSelected ? `0 0 50px ${t.color}40` : undefined,
                        }}
                      >
                        {locked ? (
                          <Lock className="h-8 w-8 text-muted-foreground/20" />
                        ) : isCurrent ? (
                          <div className="relative">
                            <Crown className="h-10 w-10 text-primary drop-shadow-glow" />
                            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-black animate-ping" />
                          </div>
                        ) : (
                          <Check className="h-10 w-10 text-emerald-500" />
                        )}

                        {/* Floating index */}
                        <div className={cn(
                          "absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-2xl border-2 border-black font-black text-xs shadow-xl transition-all group-hover:-translate-y-1",
                          reached ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                        )}>
                          {i + 1}
                        </div>
                      </div>
                    </div>

                    {/* Label */}
                    <div className="text-center space-y-1.5 transition-all group-hover:translate-y-1">
                      <div className={cn(
                        "font-display text-sm font-black uppercase tracking-widest transition-colors",
                        reached ? "text-foreground" : "text-muted-foreground",
                        isSelected && "text-primary"
                      )}>
                        {t.name}
                      </div>
                      <div className="font-mono text-[9px] font-bold text-muted-foreground/60 uppercase tracking-tighter">
                        min. {formatBRL(t.min_spent_cents)}
                      </div>
                    </div>

                    {isCurrent && (
                      <motion.div 
                        layoutId="current-marker"
                        className="rounded-full bg-primary/20 px-4 py-1.5 border border-primary/30 shadow-glow-sm"
                      >
                        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">Sua Patente</span>
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </Card>

        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              <Card className="relative overflow-hidden rounded-[3rem] border-white/5 bg-card/60 p-8 shadow-2xl backdrop-blur-2xl transition-all hover:border-primary/20">
                <div
                  className="absolute inset-0 opacity-5"
                  style={{
                    background: `linear-gradient(135deg, ${selected.color}, transparent)`,
                  }}
                />
                
                <div className="relative">
                  <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary/10 text-primary shadow-glow-sm">
                      <Crown className="h-10 w-10" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-4xl font-black tracking-tight">{selected.name}</h3>
                        {selected.id === currentTierId && (
                          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Status Ativo</span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em]">Patente de Nível {tiers.findIndex(t => t.id === selected.id) + 1}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <RewardCard
                      icon={Percent}
                      label="Desconto de Custo"
                      value={`${Number(selected.discount_percent).toFixed(0)}%`}
                      hint="Taxa reduzida em licenças"
                      color={selected.color}
                    />
                    <RewardCard
                      icon={Zap}
                      label="Bônus de Recargas"
                      value={`${Number(selected.recharge_bonus_percent).toFixed(0)}%`}
                      hint="Saldo extra via PIX"
                      color={selected.color}
                    />
                    <RewardCard
                      icon={Sparkles}
                      label="Chaves de Teste"
                      value={`${selected.test_keys_per_day}`}
                      hint="Liberações grátis/dia"
                      color={selected.color}
                    />
                    <RewardCard
                      icon={Users}
                      label="Comissão Direta"
                      value={`${Number(selected.referral_commission_percent).toFixed(0)}%`}
                      hint="Lucro por indicações"
                      color={selected.color}
                    />
                  </div>

                  <div className="mt-10">
                    <ExtensionPricesCard
                      tier={selected}
                      plans={plans}
                      extensions={extensions}
                      tierExtensionPrices={tierExtensionPrices}
                    />
                  </div>

                  {selected.id !== currentTierId && selected.min_spent_cents > totalSpent && (
                    <div className="mt-8 overflow-hidden rounded-3xl border border-white/5 bg-black/40 p-6">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 shadow-glow-sm">
                          <Lock className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-black uppercase tracking-widest">Acesso Bloqueado</div>
                          <p className="text-xs font-bold text-muted-foreground">
                            Invista mais <span className="text-primary">{formatBRL(selected.min_spent_cents - totalSpent)}</span> para subir para esta patente.
                          </p>
                        </div>
                        <Button asChild size="sm" className="rounded-xl bg-primary text-[10px] font-black uppercase tracking-widest">
                          <Link to="/painel/revendedor/adicionar-saldo">Recarregar Agora</Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function RewardCard({
  icon: Icon,
  label,
  value,
  hint,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  hint: string;
  color: string;
}) {
  const isDark = isBlackTier(color);
  
  return (
    <div className="group relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a0a0a]/80 p-6 transition-all duration-500 hover:-translate-y-2 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5">
      {/* Background Glow */}
      <div 
        className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-10 blur-3xl transition-opacity group-hover:opacity-20"
        style={{ backgroundColor: color }}
      />
      
      <div className="relative flex flex-col items-center text-center space-y-4">
        {/* Icon Container */}
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3",
            isDark ? "bg-zinc-900 border border-white/10" : ""
          )}
          style={{ 
            backgroundColor: isDark ? undefined : `${color}15`,
            boxShadow: `0 10px 30px -10px ${isDark ? 'rgba(0,0,0,0.5)' : color + '40'}`
          }}
        >
          <Icon className="h-7 w-7" style={{ color: isDark ? "#fff" : color }} />
        </div>

        <div className="space-y-1">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">{label}</div>
          <div 
            className="font-display text-3xl font-black tracking-tight"
            style={{ color: isDark ? "#fff" : color }}
          >
            {value}
          </div>
          <div className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">{hint}</div>
        </div>
      </div>

      {/* Bottom accent line */}
      <div 
        className="absolute bottom-0 left-0 h-1 w-0 bg-primary transition-all duration-500 group-hover:w-full"
        style={{ backgroundColor: isDark ? undefined : color }}
      />
    </div>
  );
}

function ExtensionPricesCard({
  tier,
  plans,
  extensions,
  tierExtensionPrices,
}: {
  tier: Tier;
  plans: Plan[];
  extensions: Extension[];
  tierExtensionPrices: Record<string, number>;
}) {
  const discountPct = Number(tier.discount_percent ?? 0);
  const computePrice = (p: Plan, extId: string) => {
    // Prioridade 1: Preço definido por Nível para esta extensão
    const tk = `${tier.id}|${extId}|${p.license_type}`;
    if (tierExtensionPrices[tk] !== undefined && tierExtensionPrices[tk] >= 0) {
      return { price: tierExtensionPrices[tk] };
    }

    // Fallback: Desconto sobre o preço base
    const min = Number(p.min_price_cents ?? 0);
    const final = Math.max(min, Math.round(p.price_cents * (1 - discountPct / 100)));
    return { price: final };
  };

  if (extensions.length === 0 || plans.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
        <Package className="mx-auto mb-2 h-5 w-5 opacity-50" />
        Nenhuma extensão liberada para você ainda. Peça ao gerente para liberar.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Tag className="h-4 w-4" style={{ color: isBlackTier(tier.color) ? "#000000" : tier.color }} />
        <h4 
          className={cn(
            "font-display text-sm font-bold uppercase tracking-wider",
            isBlackTier(tier.color) && "bg-black text-white px-2 py-0.5 rounded"
          )} 
          style={{ color: isBlackTier(tier.color) ? undefined : tier.color }}
        >
          Preços neste nível
        </h4>
        <span className="text-[10px] text-muted-foreground">
          {discountPct > 0 ? `(${discountPct}% de desconto aplicado)` : "(preço base)"}
        </span>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-white/5 bg-black/40 shadow-inner">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-b border-white/5">
                <th className="px-6 py-4">Software / Extensão</th>
                {plans.map((p) => (
                  <th key={p.license_type} className="px-4 py-4 text-center">
                    {p.label || FALLBACK_LABEL[p.license_type] || p.license_type}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {extensions.map((ext) => (
                <tr
                  key={ext.id}
                  className="group transition-colors hover:bg-primary/[0.02]"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-all">
                        <Package className="h-4 w-4" />
                      </div>
                      <span className="font-bold tracking-tight">{ext.name}</span>
                    </div>
                  </td>
                  {plans.map((p) => {
                    const { price } = computePrice(p, ext.id);
                    return (
                      <td key={p.license_type} className="px-4 py-4 text-center">
                        <div className="font-display text-sm font-black text-foreground group-hover:text-primary transition-colors">
                          {formatBRL(price)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
