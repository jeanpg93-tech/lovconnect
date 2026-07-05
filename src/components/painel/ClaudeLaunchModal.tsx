import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import { useClaudePromoForReseller } from "@/hooks/useClaudePromoForReseller";
import { useResellerEnabledMethods } from "@/hooks/useResellerEnabledMethods";
import { ArrowRight, ShieldCheck, Zap, Cpu, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "lovconnect:claude_launch_modal:v13";

/**
 * Modal de lançamento do Claude — dispara UMA vez, geral, para revendedores
 * cujo nível tenha desconto na promo Claude ativa. Sem promo ou sem desconto,
 * o modal não aparece.
 */
export default function ClaudeLaunchModal() {
  const { info, loading } = useClaudePromoForReseller();
  const { claude: claudeEnabled, loading: methodsLoading } = useResellerEnabledMethods();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [hasPrices, setHasPrices] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r?.id) { setHasPrices(false); return; }
      const { count } = await supabase
        .from("claude_reseller_price_overrides")
        .select("plan_code", { count: "exact", head: true })
        .eq("reseller_id", r.id)
        .eq("is_active", true);
      setHasPrices((count ?? 0) > 0);
    })();
  }, [user]);

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
      <DialogContent className="max-w-lg overflow-hidden rounded-3xl border border-[#ff3b2f]/20 bg-[#0d0d0d] p-0 shadow-[0_0_50px_-12px_rgba(255,59,47,0.4)]">
        {/* Glows de fundo */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-[#ff3b2f]/10 blur-[100px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-[#ff8a5c]/10 blur-[80px]" />

        <div className="relative flex flex-col items-center p-8 text-center">
          {/* Badge de lançamento */}
          <div className="mb-6 animate-bounce">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#ff3b2f]/40 bg-[#1a0a0a] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#ff3b2f]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff3b2f] shadow-[0_0_8px_#ff3b2f]" />
              lançamento
            </span>
          </div>

          {/* Logo com glow pulsante — mesmo ícone do menu lateral (sparkle) */}
          <div className="group relative mb-4 h-56 w-56">
            <div className="absolute inset-0 animate-pulse rounded-full bg-[#ff3b2f] opacity-30 blur-3xl transition-opacity duration-500 group-hover:opacity-60" />
            <div className="absolute inset-4 animate-pulse rounded-full bg-[#ff8a5c] opacity-20 blur-2xl [animation-delay:400ms]" />
            <ClaudeIcon className="relative h-40 w-40 text-[#ff3b2f] drop-shadow-[0_0_20px_rgba(255,59,47,0.6)] transition-transform duration-500 group-hover:scale-105" />
          </div>

          {/* Headline */}
          <h3 className="mb-3 font-display text-3xl font-black uppercase tracking-tighter text-white">
            claude chegou.
          </h3>
          <p className="mb-8 max-w-[320px] text-sm leading-relaxed text-gray-400">
            Novo método de venda no seu painel: chaves Claude com cobrança automática
            da carteira e entrega instantânea ao cliente.
          </p>

          {/* Feature Cards */}
          <div className="mb-6 grid w-full grid-cols-3 gap-2">
            {[
              { Icon: Zap, label: "Entrega instantânea", accent: "#ff3b2f" },
              { Icon: ShieldCheck, label: "Cancelamento e reembolso", accent: "#ff8a5c" },
              { Icon: Cpu, label: "Portal do cliente", accent: "#ff3b2f" },
            ].map(({ Icon, label, accent }) => (
              <div
                key={label}
                className="group rounded-2xl border border-white/5 bg-[#1a0a0a] p-3 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-[#ff3b2f]/40 hover:shadow-[0_0_18px_rgba(255,59,47,0.25)]"
              >
                <Icon
                  className="mx-auto h-4 w-4 transition-transform group-hover:scale-110"
                  style={{ color: accent }}
                />
                <p className="mt-1.5 font-mono text-[9px] font-bold uppercase leading-tight tracking-wider text-gray-400">
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Banner promo */}
          <div className="mb-6 w-full overflow-hidden rounded-xl border border-[#ff3b2f]/20 bg-gradient-to-r from-[#ff3b2f]/10 to-[#ff8a5c]/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-left">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#ff8a5c]">
                  bônus de lançamento — nível {info.tierName}
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  {info.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-3xl font-black italic leading-none text-[#ff3b2f] drop-shadow-[0_0_12px_rgba(255,59,47,0.6)]">
                  -{info.pct}%
                </p>
                <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-gray-500">
                  por chave
                </p>
              </div>
            </div>
          </div>

          {/* CTAs — se ainda não configurou preços, direciona pra cadastrar */}
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <button
              onClick={() => go("/painel/revendedor/precos?tab=claude")}
              className="rounded-xl border border-white/10 bg-transparent py-4 font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400 transition-all duration-300 hover:border-[#ff3b2f]/40 hover:text-white"
            >
              ver preços
            </button>
            {hasPrices === false ? (
              <button
                onClick={() => go("/painel/revendedor/precos?tab=claude")}
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#ff3b2f] py-4 font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-[0_0_20px_rgba(255,59,47,0.4)] transition-all duration-300 hover:bg-[#ff5147] hover:shadow-[0_0_32px_rgba(255,59,47,0.7)]"
              >
                <span className="relative z-10 inline-flex items-center gap-2">
                  <Tag className="h-3 w-3" />
                  cadastrar preços de venda
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              </button>
            ) : (
              <button
                onClick={() => go("/painel/revendedor/claude")}
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#ff3b2f] py-4 font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-[0_0_20px_rgba(255,59,47,0.4)] transition-all duration-300 hover:bg-[#ff5147] hover:shadow-[0_0_32px_rgba(255,59,47,0.7)]"
              >
                <span className="relative z-10 inline-flex items-center gap-2">
                  gerar minha primeira chave
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}