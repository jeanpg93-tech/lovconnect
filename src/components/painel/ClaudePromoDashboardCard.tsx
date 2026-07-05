import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import { useClaudePromoForReseller } from "@/hooks/useClaudePromoForReseller";
import { useResellerEnabledMethods } from "@/hooks/useResellerEnabledMethods";
import { ArrowRight, Timer } from "lucide-react";

function useCountdown(endsAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { d, h, m, s };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function ClaudePromoDashboardCard() {
  const { info } = useClaudePromoForReseller();
  const { claude: claudeEnabled, loading } = useResellerEnabledMethods();
  const countdown = useCountdown(info?.endsAt ?? null);
  if (loading || !claudeEnabled || !info) return null;

  return (
    <div className="relative w-full group">
      {/* Glow externo */}
      <div className="pointer-events-none absolute -inset-0.5 rounded-xl bg-primary/20 blur-xl opacity-60 group-hover:opacity-90 transition-opacity" />

      <div className="relative overflow-hidden rounded-xl border border-primary/40 bg-card/90 backdrop-blur-sm shadow-red-glow-sm">
        {/* Linha superior de destaque */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* Grid decorativo sutil */}
        <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-20" />

        <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                promoção ativa
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <ClaudeIcon className="h-3 w-3 text-amber-500" /> claude
              </span>
              <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {info.name}
              </span>
            </div>

            <div className="space-y-1">
              <h2 className="font-display text-3xl md:text-4xl font-black italic uppercase leading-none tracking-tighter">
                <span className="bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent">
                  {info.pct}% de desconto
                </span>
              </h2>
              <p className="font-mono text-[11px] md:text-xs uppercase tracking-wider text-muted-foreground">
                no custo Claude debitado da sua carteira ·{" "}
                <span className="text-foreground">nível {info.tierName}</span>
              </p>
            </div>

            {countdown && (
              <div className="flex items-center gap-2">
                <Timer className="h-3.5 w-3.5 text-primary" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  termina em
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                  {countdown.d > 0 && <>{countdown.d}d </>}
                  {pad(countdown.h)}
                  <span className="text-primary">:</span>
                  {pad(countdown.m)}
                  <span className="text-primary">:</span>
                  {pad(countdown.s)}
                </span>
              </div>
            )}
          </div>

          <Link
            to="/painel/revendedor/claude"
            className="group/btn inline-flex h-fit shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 font-mono text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-red-glow-sm transition-all hover:bg-primary/90 active:scale-95"
          >
            <ClaudeIcon className="h-4 w-4" />
            gerar chave claude
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}