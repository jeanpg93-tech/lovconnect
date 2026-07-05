import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import { useClaudePromoForReseller } from "@/hooks/useClaudePromoForReseller";
import { useResellerEnabledMethods } from "@/hooks/useResellerEnabledMethods";
import { ArrowRight, ShieldCheck, Zap, Cpu } from "lucide-react";

const STORAGE_KEY = "lovconnect:claude_launch_modal:v4";

/**
 * Modal de lançamento do Claude — dispara UMA vez, geral, para revendedores
 * cujo nível tenha desconto na promo Claude ativa. Sem promo ou sem desconto,
 * o modal não aparece.
 */
export default function ClaudeLaunchModal() {
  const { info, loading } = useClaudePromoForReseller();
  const { claude: claudeEnabled, loading: methodsLoading } = useResellerEnabledMethods();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || methodsLoading || !info || !claudeEnabled) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setOpen(true), 600);
    return () => clearTimeout(t);
  }, [loading, methodsLoading, info, claudeEnabled]);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {}
    setOpen(false);
  };

  const go = (path: string) => {
    dismiss();
    navigate(path);
  };

  if (!info || !claudeEnabled) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss();
      }}
    >
      <DialogContent className="max-w-lg overflow-hidden border-border/60 bg-card/95 p-0 backdrop-blur-sm">
        {/* Glow decorativo */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-20" />

        <div className="relative space-y-6 p-7">
          <div className="space-y-3 text-center">
            <div className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              lançamento
            </div>
            <div className="flex items-center justify-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500 shadow-red-glow-sm">
                <ClaudeIcon className="h-7 w-7" />
              </span>
            </div>
            <h3 className="font-display text-3xl font-black uppercase tracking-tighter">
              claude chegou.
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Novo método de venda no seu painel: chaves Claude com cobrança automática
              da carteira e entrega instantânea ao cliente.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { Icon: Zap, label: "Entrega instantânea" },
              { Icon: ShieldCheck, label: "Cancelamento e reembolso" },
              { Icon: Cpu, label: "Portal do cliente" },
            ].map(({ Icon, label }) => (
              <div
                key={label}
                className="rounded-lg border border-border/60 bg-background/40 p-3 text-center"
              >
                <Icon className="mx-auto h-4 w-4 text-primary" />
                <p className="mt-1.5 font-mono text-[9px] font-bold uppercase leading-tight tracking-wider text-muted-foreground">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Destaque da promo */}
          <div className="relative overflow-hidden rounded-lg border border-primary/40 bg-primary/5 p-4">
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  bônus de lançamento — nível {info.tierName}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">
                  {info.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-3xl font-black italic leading-none text-primary">
                  -{info.pct}%
                </p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  por chave
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              onClick={() => go("/painel/revendedor/precos?tab=claude")}
              className="rounded-md border border-border/60 bg-background/40 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
            >
              ver preços
            </button>
            <button
              onClick={() => go("/painel/revendedor/claude")}
              className="group inline-flex items-center justify-center gap-2 rounded-md bg-primary py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-red-glow-sm transition-all hover:bg-primary/90"
            >
              gerar minha primeira chave
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}