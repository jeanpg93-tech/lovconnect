import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PartyPopper, Sparkles, Rocket } from "lucide-react";

interface Props {
  userId: string;
  status: string | null;
}

/**
 * Detecta a transição de activation_status → "active" e exibe UMA VEZ
 * uma tela de parabéns com confetes. Persiste em localStorage por usuário.
 */
export function ActivationCelebration({ userId, status }: Props) {
  const storageKey = `activation_celebrated_v1_${userId}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status !== "active" || !userId) return;
    try {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, new Date().toISOString());
      setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [status, userId, storageKey]);

  const confetti = useMemo(() => {
    const colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899"];
    return Array.from({ length: 60 }).map((_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.4 + Math.random() * 1.8,
      color: colors[i % colors.length],
      size: 6 + Math.random() * 8,
      rotate: Math.random() * 360,
    }));
  }, [open]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md overflow-hidden border-primary/40 p-0">
        {/* Confetes */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span
              key={i}
              className="absolute -top-4 block rounded-sm"
              style={{
                left: `${c.left}%`,
                width: c.size,
                height: c.size * 0.4,
                background: c.color,
                transform: `rotate(${c.rotate}deg)`,
                animation: `confetti-fall ${c.duration}s linear ${c.delay}s infinite`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center gap-4 bg-gradient-to-b from-primary/10 via-background to-background p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-primary/15 shadow-lg animate-scale-in">
            <PartyPopper className="h-8 w-8 text-primary" />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            <Sparkles className="h-3 w-3" /> painel liberado
          </span>

          <h2 className="font-display text-2xl font-bold uppercase tracking-tight animate-fade-in">
            Parabéns! 🎉
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground animate-fade-in">
            Seu painel de revendedor está <strong className="text-foreground">100% ativo</strong>.
            Você já pode gerar chaves, vender licenças e começar a faturar agora mesmo.
          </p>

          <Button className="mt-2 w-full gap-2" onClick={() => setOpen(false)}>
            <Rocket className="h-4 w-4" /> Vamos começar
          </Button>
        </div>

        <style>{`
          @keyframes confetti-fall {
            0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
            100% { transform: translateY(520px) rotate(720deg); opacity: 0; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}