import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Trophy, Medal, Crown, Sparkles, TrendingUp, Award, Gift, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

type Tier = {
  id: string;
  name: string;
  color: string;
  min_spent_cents: number;
  sort_order: number;
};

type Prize = {
  id: string;
  position: number;
  title: string;
  description: string;
  prize_value: string;
};

type Row = {
  reseller_id: string;
  display_name: string;
  total_spent_cents: number;
  tier?: Tier | null;
};

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"]; // gold, silver, bronze

function tierForAmount(tiers: Tier[], spent: number): Tier | null {
  const sorted = [...tiers].sort((a, b) => b.min_spent_cents - a.min_spent_cents);
  return sorted.find((t) => spent >= t.min_spent_cents) ?? tiers[0] ?? null;
}

const CountdownTimer = () => {
  const calculateTimeLeft = useCallback(() => {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const difference = endOfMonth.getTime() - now.getTime();

    if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  }, []);

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, [calculateTimeLeft]);

  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-500/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500/80 ring-1 ring-amber-500/10">
      <div className="flex items-center gap-1">
        <span>Termina em:</span>
        <div className="flex gap-1.5 font-mono tabular-nums">
          <div className="flex flex-col items-center">
            <span>{String(timeLeft.days).padStart(2, '0')}d</span>
          </div>
          <span>:</span>
          <div className="flex flex-col items-center">
            <span>{String(timeLeft.hours).padStart(2, '0')}h</span>
          </div>
          <span>:</span>
          <div className="flex flex-col items-center">
            <span>{String(timeLeft.minutes).padStart(2, '0')}m</span>
          </div>
          <span>:</span>
          <div className="flex flex-col items-center">
            <span>{String(timeLeft.seconds).padStart(2, '0')}s</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const CountdownTimerOnly = () => {

  const calculateTimeLeft = useCallback(() => {
    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const difference = endOfMonth.getTime() - now.getTime();

    if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

    return {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  }, []);

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearInterval(timer);
  }, [calculateTimeLeft]);

  return (
    <div className="flex gap-1 font-mono tabular-nums">
      <span>{String(timeLeft.days).padStart(2, '0')}d</span>
      <span>:</span>
      <span>{String(timeLeft.hours).padStart(2, '0')}h</span>
      <span>:</span>
      <span>{String(timeLeft.minutes).padStart(2, '0')}m</span>
      <span>:</span>
      <span>{String(timeLeft.seconds).padStart(2, '0')}s</span>
    </div>
  );
};



export default function RevendedorRanking() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [myResellerId, setMyResellerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [
        { data: me }, 
        { data: rankingData }, 
        { data: tierRows }, 
        { data: prizesRows }
      ] = await Promise.all([
        supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("get_reseller_ranking_v2", { start_date: startOfMonth.toISOString() }),
        supabase.from("reseller_tiers").select("id, name, color, min_spent_cents, sort_order").eq("is_hidden", false).order("sort_order"),
        supabase.from("ranking_prizes").select("*").eq("is_active", true).order("position", { ascending: true })
      ]);
      
      if (cancelled) return;

      setMyResellerId(me?.id ?? null);
      const tiers = (tierRows ?? []) as Tier[];
      setPrizes((prizesRows ?? []) as Prize[]);

      const list: Row[] = (rankingData ?? []).map((r: any) => ({
        reseller_id: r.reseller_id,
        display_name: r.display_name,
        total_spent_cents: Number(r.total_spent_cents),
        tier: tierForAmount(tiers, Number(r.total_spent_cents)),
      }));

      setRows(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const myPosition = useMemo(() => {
    if (!myResellerId) return null;
    const idx = rows.findIndex((r) => r.reseller_id === myResellerId);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, myResellerId]);

  const myRow = useMemo(
    () => rows.find((r) => r.reseller_id === myResellerId) ?? null,
    [rows, myResellerId]
  );

  const top3 = rows.slice(0, 3);
  const realRest = rows.slice(3);

  // Sempre exibir 5 posições nos "demais" — preenche com fictícios se faltar
  const lastRealSpent = realRest.length > 0
    ? realRest[realRest.length - 1].total_spent_cents
    : (top3[top3.length - 1]?.total_spent_cents ?? 0);
  
  const rest: (Row & { __fake?: boolean })[] = [...realRest];

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando ranking...</div>;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A0A0B] p-4 md:p-8">
      {/* Decorative bg */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-20 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -right-20 bottom-40 h-[600px] w-[600px] rounded-full bg-blue-500/5 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/3 blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-2 text-center md:text-left"
        >
          <div className="inline-flex items-center justify-center gap-2 md:justify-start">
            <Trophy className="h-6 w-6 text-primary" />
            <h1 className="font-display text-3xl font-bold md:text-4xl">Ranking de Vendas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Os top revendedores da plataforma. Suba de posição adicionando saldo!
          </p>
        </motion.div>
        {/* Countdown Card */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card className="flex flex-col items-center justify-between gap-3 border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent p-4 backdrop-blur-xl sm:flex-row">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">Termina em</p>
                <p className="text-xs text-zinc-400">Encerramento da competição mensal</p>
              </div>
            </div>
            <div className="text-base font-bold text-white sm:text-lg">
              <CountdownTimerOnly />
            </div>
          </Card>
        </motion.div>

        {/* Monthly Info & Prizes Card */}
        <div className="grid gap-6 lg:grid-cols-3">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1"
          >
            <Card className="flex h-full flex-col justify-center border-white/5 bg-white/[0.02] backdrop-blur-xl p-6 transition-all hover:bg-white/[0.04]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
                  <Calendar className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-lg font-bold text-white">Ranking Mensal</h3>
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-500/80">Competição de {new Date().toLocaleString('pt-BR', { month: 'long' })}</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-zinc-400">
                Os depósitos são computados mensalmente. O pódio atual reflete o desempenho deste mês.
              </p>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Card className="relative overflow-hidden border-white/5 bg-white/[0.02] backdrop-blur-xl p-6 transition-all hover:bg-white/[0.04]">
              <div className="relative">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Gift className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">Premiações deste mês</h3>
                </div>
                
                <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                  {prizes.length > 0 ? (
                    <>
                      {/* 1º LUGAR - Full width on mobile, 1/3 on desktop */}
                      <div key={prizes[0].id} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-primary/30 hover:bg-white/[0.04]">
                        <div className="absolute -right-4 -bottom-4 h-16 w-16 opacity-5 transition-transform group-hover:scale-110">
                          <Trophy className="h-full w-full text-amber-500" />
                        </div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{prizes[0].position}º LUGAR</span>
                          <Trophy className="h-4 w-4 text-amber-500 transition-transform group-hover:scale-110" />
                        </div>
                        <div className="text-lg font-black tracking-tight text-primary">{prizes[0].prize_value}</div>
                        <div className="mt-1 text-[11px] font-medium leading-tight text-zinc-400">{prizes[0].title}</div>
                      </div>

                      {/* 2º e 3º LUGAR - Side by side on mobile */}
                      <div className="grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-2">
                        {prizes.slice(1, 3).map((p) => (
                          <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-primary/30 hover:bg-white/[0.04]">
                            <div className="absolute -right-4 -bottom-4 h-16 w-16 opacity-5 transition-transform group-hover:scale-110">
                              <Medal className={cn("h-full w-full", p.position === 2 ? "text-slate-400" : "text-amber-700")} />
                            </div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{p.position}º LUGAR</span>
                              <Trophy className={cn("h-4 w-4 transition-transform group-hover:scale-110", p.position === 2 ? "text-slate-400" : "text-amber-700")} />
                            </div>
                            <div className="text-lg font-black tracking-tight text-primary">{p.prize_value}</div>
                            <div className="mt-1 text-[11px] font-medium leading-tight text-zinc-400">{p.title}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="col-span-3 py-6 text-center">
                      <p className="text-sm font-medium text-zinc-500">As premiações serão definidas em breve.</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* My position card & CTA */}
        {myRow && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="grid gap-4 lg:grid-cols-2"
          >
            <Card className="relative overflow-hidden border-primary/20 bg-white/[0.03] backdrop-blur-2xl p-5 ring-1 ring-white/10">
              <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-[60px]" />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/30 shadow-[0_0_15px_rgba(var(--primary),0.15)]">
                    <Award className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Posição</div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-2xl font-black text-white">{myPosition ? `#${myPosition}` : "—"}</span>
                      <span className="text-[10px] text-zinc-500">de {rows.length}</span>
                    </div>
                  </div>
                </div>

                <div className="h-8 w-px bg-white/10" />

                <div className="flex flex-col">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Depósitos</div>
                  <div className="font-display text-xl font-black text-white">{formatBRL(myRow.total_spent_cents)}</div>
                </div>

                {myRow.tier && (
                  <div
                    className="hidden items-center gap-1.5 rounded-lg border border-white/5 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider sm:flex"
                    style={{ color: myRow.tier.color }}
                  >
                    <Crown className="h-3 w-3" /> {myRow.tier.name}
                  </div>
                )}
              </div>
            </Card>

            {myPosition && myPosition > 1 && rows[0] && (
              <Card className="flex items-center justify-between gap-4 overflow-hidden border-amber-500/20 bg-amber-500/5 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-3 pl-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500/70">Próximo Nível</p>
                    <p className="text-xs font-medium text-white/90">
                      Faltam <span className="font-bold text-amber-400">{formatBRL(rows[0].total_spent_cents - myRow.total_spent_cents + 1000)}</span> para o 1º
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => window.location.href = `/painel/deposito?amount=${(rows[0].total_spent_cents - myRow.total_spent_cents + 1000) / 100}`}
                  className="group flex h-10 shrink-0 items-center gap-2 rounded-lg bg-amber-500 px-4 text-[13px] font-bold text-black transition-all hover:bg-amber-400 active:scale-[0.96] shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                >
                  <span>Depositar</span>
                  <TrendingUp className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </Card>
            )}
          </motion.div>
        )}

        {/* Pódio Top 3 */}
        {top3.length > 0 && (
          <Card className="relative overflow-hidden border-white/5 bg-white/[0.01] p-6 md:p-10">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-50" />
            <div className="relative mb-10 flex items-center justify-center gap-3">
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
              <h2 className="font-display text-2xl font-black tracking-tight text-white uppercase">O Pódio da Vitória</h2>
              <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            </div>

            <div className="grid grid-cols-3 gap-3 md:gap-6">
              {[1, 0, 2].map((podiumIdx, i) => {
                const r = top3[podiumIdx];
                if (!r) return <div key={i} />;
                const rank = podiumIdx + 1;
                const color = RANK_COLORS[podiumIdx];
                const heights = ["h-40 md:h-48", "h-56 md:h-72", "h-32 md:h-40"];
                const height = heights[i];
                const isMe = r.reseller_id === myResellerId;
                return (
                  <motion.div
                    key={r.reseller_id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 + i * 0.1, type: "spring", stiffness: 100 }}
                    className="flex flex-col items-center"
                  >
                    {/* Avatar/medal */}
                    <div className="relative mb-4">
                      {rank === 1 && (
                        <>
                          <span className="absolute inset-0 animate-ping rounded-full bg-amber-500/20 opacity-40 blur-xl" />
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2">
                            <motion.div
                              animate={{ y: [0, -5, 0] }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              <Crown className="h-10 w-10 text-amber-500 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
                            </motion.div>
                          </div>
                        </>
                      )}
                      <div
                        className="relative flex h-20 w-20 items-center justify-center rounded-3xl border-2 shadow-2xl md:h-28 md:w-28 transition-transform hover:scale-105"
                        style={{
                          borderColor: `${color}40`,
                          backgroundColor: `${color}10`,
                          boxShadow: `0 0 40px ${color}20`,
                        }}
                      >
                        <Medal className="h-10 w-10 md:h-14 md:w-14" style={{ color }} />
                        <div
                          className="absolute -bottom-2 flex h-8 w-8 items-center justify-center rounded-xl border-2 border-background text-sm font-black shadow-xl"
                          style={{ backgroundColor: color, color: "#000" }}
                        >
                          {rank}
                        </div>
                      </div>
                    </div>

                    {/* Name */}
                    <div className="mt-2 max-w-full text-center">
                      <div
                        className={cn(
                          "truncate font-display text-base font-black leading-tight text-white md:text-lg",
                          isMe && "text-primary"
                        )}
                      >
                        {(() => {
                          const parts = r.display_name.trim().split(/\s+/);
                          const first = parts[0] ?? "";
                          const rest = parts.slice(1).join(" ");
                          return (
                            <>
                              <span>{first}</span>
                              {rest && (
                                <>
                                  {" "}
                                  <span className="select-none blur-[4px] opacity-50" aria-hidden>
                                    {rest}
                                  </span>
                                </>
                              )}
                            </>
                          );
                        })()}
                        {isMe && <span className="block text-[10px] font-bold text-primary/80 uppercase tracking-tighter">(Você)</span>}
                      </div>
                      <div className="mt-1 font-mono text-xs font-bold text-zinc-400">
                        {formatBRL(r.total_spent_cents)}
                      </div>
                    </div>

                    {/* Pedestal */}
                    <div
                      className={cn(
                        "relative mt-6 w-full rounded-2xl border-x border-t transition-all",
                        height
                      )}
                      style={{
                        borderColor: `${color}30`,
                        background: `linear-gradient(180deg, ${color}20 0%, transparent 100%)`,
                      }}
                    >
                      <div
                        className="flex h-full items-start justify-center pt-4 font-display text-4xl font-black md:pt-6 md:text-6xl opacity-40 select-none"
                        style={{ color }}
                      >
                        {rank}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Lista do restante */}
        {rest.length > 0 && (
          <Card className="relative overflow-hidden border-white/5 bg-white/[0.01] p-6 md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
                <TrendingUp className="h-4 w-4" />
              </div>
              <h2 className="font-display text-lg font-bold text-white uppercase tracking-tight">Demais posições</h2>
            </div>

            <div className="grid gap-2">
              {rest.map((r, i) => {
                const rank = i + 4;
                const isMe = r.reseller_id === myResellerId;
                return (
                  <motion.div
                    key={r.reseller_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.5) }}
                    className={cn(
                      "group flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.05] hover:border-white/10 sm:flex-row sm:items-center sm:gap-4",
                      isMe && "border-primary/40 bg-primary/5 hover:bg-primary/10"
                    )}
                  >
                    <div className="flex items-center gap-3 sm:contents">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-base font-black transition-transform group-hover:scale-110 sm:h-12 sm:w-12 sm:text-lg",
                          isMe ? "bg-primary text-black" : "bg-zinc-900 text-zinc-500"
                        )}
                      >
                        {rank}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate font-bold text-white", isMe && "text-primary")}>
                          {(() => {
                            const parts = r.display_name.trim().split(/\s+/);
                            const first = parts[0] ?? "";
                            const restName = parts.slice(1).join(" ");
                            return (
                              <>
                                <span>{first}</span>
                                {restName && (
                                  <span className="ml-1 select-none blur-[4px] opacity-30" aria-hidden>
                                    {restName}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                          {isMe && <span className="ml-2 text-[10px] font-black uppercase text-primary/70 tracking-tighter">(Você)</span>}
                        </div>
                        {r.tier && (
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider sm:mt-1" style={{ color: r.tier.color }}>
                            <Crown className="h-3 w-3" /> {r.tier.name}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between border-t border-white/5 pt-3 sm:border-0 sm:pt-0 sm:text-right">
                      <div className="sm:hidden text-[9px] font-bold uppercase tracking-widest text-zinc-600">Total Vendido</div>
                      <div>
                        <div className="font-display text-base font-black text-white">{formatBRL(r.total_spent_cents)}</div>
                        <div className="hidden sm:block text-[9px] font-bold uppercase tracking-widest text-zinc-600">Total Vendido</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Card>
        )}

        {rows.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            Ainda não há vendas registradas no ranking.
          </Card>
        )}
      </div>
    </div>
  );
}
