import { CSSProperties, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { KeyRound, Coins } from "lucide-react";
import { StorefrontVisualEffects, type VisualEffect } from "./StorefrontVisualEffects";

type Props = {
  effect: "none" | "grid" | "circles" | "flames" | "dots" | "waves" | "aurora" | "stars" | "mesh" | "rays";
  layout: "grid" | "list";
  color: string;
  storeName: string;
  tagline?: string | null;
  logoUrl?: string | null;
  showExtensions?: boolean;
  showProducts?: boolean;
  showFreeTrial?: boolean;
  showCredits?: boolean;
  visualEffect?: VisualEffect;
};

const SAMPLE = [
  { label: "Pro 7 dias", price: "R$ 19,90" },
  { label: "Pro 30 dias", price: "R$ 49,90" },
  { label: "Vitalícia", price: "R$ 199,00" },
];

/**
 * Contained, in-editor preview of the public storefront's look & feel.
 * Background effects are scoped to this card (not fixed to viewport).
 */
export function StorefrontPreview({
  effect, layout, color, storeName, tagline, logoUrl,
  showExtensions = true, showProducts = true, showFreeTrial = true, showCredits = true,
  visualEffect = "none",
}: Props) {
  const [activeTab, setActiveTab] = useState<"extension" | "recharge">("extension");

  useEffect(() => {
    if (!showExtensions && showCredits) {
      setActiveTab("recharge");
    } else if (showExtensions && !showCredits) {
      setActiveTab("extension");
    }
  }, [showExtensions, showCredits]);
  return (
    <div
      className="relative overflow-hidden rounded-xl border bg-background"
      style={{ minHeight: 360 }}
    >
      <ScopedBackground effect={effect} color={color} />
      <StorefrontVisualEffects effect={visualEffect} color={color} scoped />
      <div className="relative z-10 p-6 text-center space-y-4">
        <div className="flex flex-col items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-12 w-12 rounded-full object-cover border" />
          ) : (
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
              style={{ background: color }}
            >
              {(storeName || "L").charAt(0).toUpperCase()}
            </div>
          )}
          <h3 className="text-lg font-semibold">{storeName || "Sua Loja"}</h3>
          {tagline && <p className="text-xs text-muted-foreground">{tagline}</p>}
        </div>

        <div className="space-y-6">
          {showExtensions && showCredits && (
            <div className="flex gap-2 bg-muted/50 p-1 rounded-xl">
              <button 
                onClick={() => setActiveTab("extension")}
                className={cn(
                  "flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all",
                  activeTab === "extension" ? "bg-card shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <KeyRound className={cn("h-3 w-3 mb-0.5", activeTab === "extension" ? "text-primary" : "text-muted-foreground")} />
                <span className="text-[9px] font-bold uppercase tracking-tight">Chaves</span>
              </button>
              <button 
                onClick={() => setActiveTab("recharge")}
                className={cn(
                  "flex-1 flex flex-col items-center py-1.5 rounded-lg transition-all",
                  activeTab === "recharge" ? "bg-card shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Coins className={cn("h-3 w-3 mb-0.5", activeTab === "recharge" ? "text-primary" : "text-muted-foreground")} />
                <span className="text-[9px] font-bold uppercase tracking-tight">Recarga</span>
              </button>
            </div>
          )}

          {activeTab === "extension" && showExtensions && (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-left">Extensões</div>
              <div
                className={cn(
                  "mx-auto w-full",
                  layout === "grid"
                    ? "grid grid-cols-1 sm:grid-cols-3 gap-3"
                    : "flex flex-col gap-2",
                )}
              >
                {SAMPLE.map((p) => (
                  <div
                    key={p.label}
                    className={cn(
                      "rounded-lg border bg-card/80 backdrop-blur p-3 text-left",
                      layout === "list" && "flex items-center justify-between",
                    )}
                  >
                    <div className="text-sm font-medium">{p.label}</div>
                    <div
                      className={cn("text-sm font-bold", layout === "grid" && "mt-1")}
                      style={{ color }}
                    >
                      {p.price}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "recharge" && (showProducts || showCredits) && (
            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground text-left">Recargas e Itens</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {showProducts && (
                  <div className="rounded-lg border bg-card/80 backdrop-blur p-2 text-left flex items-center justify-between">
                    <div className="text-xs font-medium">Produto Especial</div>
                    <div className="text-xs font-bold" style={{ color }}>R$ 29,90</div>
                  </div>
                )}
                {showCredits && (
                  <div className="rounded-lg border bg-card/80 backdrop-blur p-2 text-left flex items-center justify-between">
                    <div className="text-xs font-medium">Recarga 50 Créditos</div>
                    <div className="text-xs font-bold" style={{ color }}>R$ 45,00</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {showFreeTrial && (
            <div className="pt-2">
              <div className="w-full py-2 rounded-lg text-xs font-bold border-2 border-dashed border-muted-foreground/30 text-muted-foreground/60">
                Teste Grátis Disponível
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScopedBackground({
  effect, color,
}: { effect: Props["effect"]; color: string }) {
  if (effect === "none") return null;

  if (effect === "grid") {
    const style: CSSProperties = {
      backgroundImage: `
        linear-gradient(${color}33 1px, transparent 1px),
        linear-gradient(90deg, ${color}33 1px, transparent 1px)
      `,
      backgroundSize: "32px 32px",
      maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
      WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
    };
    return <div aria-hidden className="absolute inset-0 z-0" style={style} />;
  }

  if (effect === "circles") {
    return (
      <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-16 -left-16 h-56 w-56 rounded-full blur-3xl opacity-50 animate-pulse"
          style={{ background: `radial-gradient(circle, ${color}66, transparent 70%)` }}
        />
        <div
          className="absolute top-1/3 -right-20 h-72 w-72 rounded-full blur-3xl opacity-40"
          style={{ background: `radial-gradient(circle, ${color}55, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full blur-3xl opacity-40"
          style={{ background: `radial-gradient(circle, ${color}44, transparent 70%)` }}
        />
      </div>
    );
  }

  if (effect === "dots") {
    const style: CSSProperties = {
      backgroundImage: `radial-gradient(${color}55 1.2px, transparent 1.6px)`,
      backgroundSize: "18px 18px",
      maskImage: "radial-gradient(ellipse at center, black 50%, transparent 85%)",
      WebkitMaskImage: "radial-gradient(ellipse at center, black 50%, transparent 85%)",
    };
    return <div aria-hidden className="absolute inset-0 z-0" style={style} />;
  }

  if (effect === "waves") {
    return (
      <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
        <style>{`
          @keyframes sfp-wave-shift { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
          .sfp-wave { position:absolute; left:0; width:200%; height:120px; background-repeat:repeat-x; animation: sfp-wave-shift linear infinite; }
        `}</style>
        <div className="sfp-wave" style={{ bottom: 20, animationDuration: "14s", opacity: 0.5,
          backgroundImage: `radial-gradient(circle at 50% 100%, ${color}55 0 30px, transparent 31px)`, backgroundSize: "120px 120px" }} />
        <div className="sfp-wave" style={{ bottom: -20, animationDuration: "22s", animationDirection: "reverse", opacity: 0.35,
          backgroundImage: `radial-gradient(circle at 50% 100%, ${color}77 0 40px, transparent 41px)`, backgroundSize: "160px 160px" }} />
      </div>
    );
  }

  if (effect === "aurora") {
    return (
      <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
        <style>{`
          @keyframes sfp-aur { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(20px,-10px) rotate(8deg)} }
          .sfp-aur { position:absolute; filter: blur(60px); mix-blend-mode: screen; animation: sfp-aur 12s ease-in-out infinite; }
        `}</style>
        <div className="sfp-aur" style={{ top: "-20%", left: "-10%", width: "70%", height: "60%",
          background: `linear-gradient(120deg, ${color}88, transparent 70%)`, borderRadius: "50%" }} />
        <div className="sfp-aur" style={{ bottom: "-30%", right: "-10%", width: "80%", height: "70%", animationDelay: "3s",
          background: `linear-gradient(300deg, ${color}66, transparent 70%)`, borderRadius: "50%" }} />
      </div>
    );
  }

  if (effect === "stars") {
    return (
      <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
        <style>{`
          @keyframes sfp-twinkle { 0%,100%{opacity:.2} 50%{opacity:1} }
          .sfp-star { position:absolute; border-radius:9999px; animation: sfp-twinkle ease-in-out infinite; }
        `}</style>
        {Array.from({ length: 30 }).map((_, i) => {
          const top = (i * 53) % 100, left = (i * 37) % 100;
          const size = 1 + ((i * 7) % 3);
          return <div key={i} className="sfp-star" style={{
            top: `${top}%`, left: `${left}%`, width: size, height: size,
            background: color, boxShadow: `0 0 6px ${color}`,
            animationDuration: `${2 + (i % 4)}s`, animationDelay: `${(i % 5) * 0.4}s`
          }} />;
        })}
      </div>
    );
  }

  if (effect === "mesh") {
    return (
      <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0" style={{
          background: `radial-gradient(at 20% 20%, ${color}55, transparent 50%),
                       radial-gradient(at 80% 10%, ${color}33, transparent 55%),
                       radial-gradient(at 70% 85%, ${color}66, transparent 55%),
                       radial-gradient(at 10% 80%, ${color}44, transparent 50%)`,
          filter: "blur(20px)",
        }} />
      </div>
    );
  }

  if (effect === "rays") {
    return (
      <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
        <style>{`
          @keyframes sfp-ray-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        `}</style>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] opacity-40"
          style={{
            background: `repeating-conic-gradient(from 0deg, ${color}33 0deg 8deg, transparent 8deg 24deg)`,
            animation: "sfp-ray-spin 60s linear infinite",
            maskImage: "radial-gradient(circle, black 10%, transparent 60%)",
            WebkitMaskImage: "radial-gradient(circle, black 10%, transparent 60%)",
          }} />
      </div>
    );
  }

  // flames
  return (
    <div aria-hidden className="absolute inset-0 z-0 overflow-hidden">
      <style>{`
        @keyframes sfp-flame-rise {
          0%   { transform: translateY(0) scale(1); opacity: 0; }
          15%  { opacity: 0.55; }
          70%  { opacity: 0.35; }
          100% { transform: translateY(-360px) scale(0.4); opacity: 0; }
        }
        .sfp-flame {
          position: absolute;
          bottom: -60px;
          border-radius: 9999px;
          mix-blend-mode: screen;
          filter: blur(20px);
          animation: sfp-flame-rise linear infinite;
        }
      `}</style>
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: `linear-gradient(to top, ${color}33, transparent)` }}
      />
      {[
        { left: "10%", delay: "0s",   dur: "6s",  size: 110 },
        { left: "30%", delay: "1.5s", dur: "7s",  size: 90  },
        { left: "50%", delay: "0.8s", dur: "5.5s",size: 130 },
        { left: "70%", delay: "2.2s", dur: "6.5s",size: 100 },
        { left: "88%", delay: "1s",   dur: "7.5s",size: 90  },
      ].map((f, i) => (
        <div
          key={i}
          className="sfp-flame"
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            background: `radial-gradient(circle at 50% 60%, ${color}cc 0%, ${color}66 35%, transparent 70%)`,
            animationDuration: f.dur,
            animationDelay: f.delay,
          }}
        />
      ))}
    </div>
  );
}
