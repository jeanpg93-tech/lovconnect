import { CSSProperties } from "react";

export type VisualEffect =
  | "none"
  | "snow"
  | "confetti"
  | "fireflies"
  | "bubbles"
  | "matrix"
  | "hearts"
  | "sparkles"
  | "leaves"
  | "neon";

type Props = {
  effect: VisualEffect;
  color: string;
  /** Use absolute positioning instead of fixed (for in-editor preview) */
  scoped?: boolean;
};

/**
 * Real-time decorative visual effects rendered above the background but below content.
 * Pure CSS / DOM — no canvas, no JS animation loop.
 */
export function StorefrontVisualEffects({ effect, color, scoped = false }: Props) {
  if (effect === "none") return null;

  const wrapperCls = scoped
    ? "pointer-events-none absolute inset-0 z-[5] overflow-hidden"
    : "pointer-events-none fixed inset-0 z-[5] overflow-hidden";

  // Helper: simple deterministic pseudo-random (consistent SSR-friendly placement)
  const rand = (seed: number) => {
    const x = Math.sin(seed * 9999) * 10000;
    return x - Math.floor(x);
  };

  if (effect === "snow") {
    return (
      <div aria-hidden className={wrapperCls}>
        <style>{`
          @keyframes sve-snow-fall { 0%{transform:translateY(-10vh) translateX(0)} 100%{transform:translateY(110vh) translateX(20px)} }
          .sve-snow { position:absolute; top:0; border-radius:9999px; background:#fff; opacity:.85; box-shadow:0 0 4px #fff; animation: sve-snow-fall linear infinite; }
        `}</style>
        {Array.from({ length: 60 }).map((_, i) => {
          const size = 2 + (i % 4);
          return (
            <div key={i} className="sve-snow" style={{
              left: `${(i * 7.3) % 100}%`,
              width: size, height: size,
              animationDuration: `${8 + (i % 7)}s`,
              animationDelay: `${-(i % 10)}s`,
              opacity: 0.4 + rand(i) * 0.6,
            }} />
          );
        })}
      </div>
    );
  }

  if (effect === "confetti") {
    const palette = [color, "#facc15", "#10b981", "#f43f5e", "#3b82f6", "#a855f7"];
    return (
      <div aria-hidden className={wrapperCls}>
        <style>{`
          @keyframes sve-conf-fall { 0%{transform:translateY(-10vh) rotate(0deg)} 100%{transform:translateY(110vh) rotate(720deg)} }
          .sve-conf { position:absolute; top:0; animation: sve-conf-fall linear infinite; }
        `}</style>
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="sve-conf" style={{
            left: `${(i * 9.1) % 100}%`,
            width: 6 + (i % 4), height: 10 + (i % 5),
            background: palette[i % palette.length],
            borderRadius: i % 3 === 0 ? "9999px" : "2px",
            animationDuration: `${5 + (i % 6)}s`,
            animationDelay: `${-(i % 8)}s`,
          }} />
        ))}
      </div>
    );
  }

  if (effect === "fireflies") {
    return (
      <div aria-hidden className={wrapperCls}>
        <style>{`
          @keyframes sve-fly-1 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(40px,-30px)} }
          @keyframes sve-fly-2 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(-30px,40px)} }
          @keyframes sve-fly-3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(20px,50px)} }
          @keyframes sve-glow { 0%,100%{opacity:.2} 50%{opacity:1} }
          .sve-fly { position:absolute; border-radius:9999px; }
        `}</style>
        {Array.from({ length: 25 }).map((_, i) => {
          const dur = 6 + (i % 5);
          const anim = `sve-fly-${(i % 3) + 1}`;
          return (
            <div key={i} className="sve-fly" style={{
              top: `${(i * 13.7) % 90 + 5}%`,
              left: `${(i * 17.3) % 90 + 5}%`,
              width: 4, height: 4,
              background: color,
              boxShadow: `0 0 12px ${color}, 0 0 24px ${color}88`,
              animation: `${anim} ${dur}s ease-in-out infinite, sve-glow ${2 + (i % 3)}s ease-in-out infinite`,
              animationDelay: `${-(i % 5)}s, ${-(i % 4)}s`,
            }} />
          );
        })}
      </div>
    );
  }

  if (effect === "bubbles") {
    return (
      <div aria-hidden className={wrapperCls}>
        <style>{`
          @keyframes sve-bubble-rise { 0%{transform:translateY(0) scale(.6); opacity:0} 15%{opacity:.6} 100%{transform:translateY(-110vh) scale(1.2); opacity:0} }
          .sve-bubble { position:absolute; bottom:-40px; border-radius:9999px; border:1.5px solid ${color}88; background:${color}22; animation: sve-bubble-rise linear infinite; }
        `}</style>
        {Array.from({ length: 30 }).map((_, i) => {
          const size = 12 + (i % 6) * 8;
          return (
            <div key={i} className="sve-bubble" style={{
              left: `${(i * 11.7) % 100}%`,
              width: size, height: size,
              animationDuration: `${10 + (i % 8)}s`,
              animationDelay: `${-(i % 9)}s`,
            }} />
          );
        })}
      </div>
    );
  }

  if (effect === "matrix") {
    const chars = "01アカサタナハマヤラワABC$#@%";
    return (
      <div aria-hidden className={wrapperCls}>
        <style>{`
          @keyframes sve-matrix-fall { 0%{transform:translateY(-100%)} 100%{transform:translateY(110vh)} }
          .sve-matrix-col { position:absolute; top:0; font-family: 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.1; writing-mode: vertical-rl; text-orientation: upright; color:${color}; text-shadow: 0 0 6px ${color}; opacity:.7; animation: sve-matrix-fall linear infinite; white-space: nowrap; }
        `}</style>
        {Array.from({ length: 20 }).map((_, i) => {
          let str = "";
          for (let j = 0; j < 25; j++) str += chars[Math.floor(rand(i * 100 + j) * chars.length)];
          return (
            <div key={i} className="sve-matrix-col" style={{
              left: `${(i * 5.3) % 100}%`,
              animationDuration: `${6 + (i % 6)}s`,
              animationDelay: `${-(i % 8)}s`,
            }}>{str}</div>
          );
        })}
      </div>
    );
  }

  if (effect === "hearts") {
    return (
      <div aria-hidden className={wrapperCls}>
        <style>{`
          @keyframes sve-heart-rise { 0%{transform:translateY(0) scale(.5); opacity:0} 15%{opacity:1} 100%{transform:translateY(-110vh) scale(1.1); opacity:0} }
          .sve-heart { position:absolute; bottom:-40px; font-size: 22px; animation: sve-heart-rise linear infinite; filter: drop-shadow(0 0 4px ${color}); }
        `}</style>
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} className="sve-heart" style={{
            left: `${(i * 13.1) % 100}%`,
            fontSize: `${16 + (i % 4) * 6}px`,
            animationDuration: `${8 + (i % 7)}s`,
            animationDelay: `${-(i % 8)}s`,
          }}>❤</div>
        ))}
      </div>
    );
  }

  if (effect === "sparkles") {
    return (
      <div aria-hidden className={wrapperCls}>
        <style>{`
          @keyframes sve-spark { 0%,100%{transform:scale(0) rotate(0deg); opacity:0} 50%{transform:scale(1) rotate(180deg); opacity:1} }
          .sve-spark { position:absolute; color:${color}; font-size:18px; animation: sve-spark ease-in-out infinite; text-shadow: 0 0 8px ${color}; }
        `}</style>
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} className="sve-spark" style={{
            top: `${(i * 13.7) % 95}%`,
            left: `${(i * 19.3) % 95}%`,
            animationDuration: `${2 + (i % 4)}s`,
            animationDelay: `${-(i % 6) * 0.5}s`,
            fontSize: `${12 + (i % 4) * 4}px`,
          }}>✦</div>
        ))}
      </div>
    );
  }

  if (effect === "leaves") {
    return (
      <div aria-hidden className={wrapperCls}>
        <style>{`
          @keyframes sve-leaf { 0%{transform:translate(0,-10vh) rotate(0deg)} 50%{transform:translate(30px,55vh) rotate(180deg)} 100%{transform:translate(-20px,110vh) rotate(360deg)} }
          .sve-leaf { position:absolute; top:0; font-size:22px; animation: sve-leaf linear infinite; }
        `}</style>
        {Array.from({ length: 22 }).map((_, i) => {
          const emojis = ["🍃","🌿","🍂"];
          return (
            <div key={i} className="sve-leaf" style={{
              left: `${(i * 11.3) % 100}%`,
              fontSize: `${16 + (i % 4) * 6}px`,
              animationDuration: `${10 + (i % 8)}s`,
              animationDelay: `${-(i % 9)}s`,
            }}>{emojis[i % emojis.length]}</div>
          );
        })}
      </div>
    );
  }

  // neon — pulsing scan line
  return (
    <div aria-hidden className={wrapperCls}>
      <style>{`
        @keyframes sve-neon-scan { 0%{transform:translateY(-10vh)} 100%{transform:translateY(110vh)} }
        @keyframes sve-neon-pulse { 0%,100%{opacity:.3} 50%{opacity:.8} }
      `}</style>
      <div style={{
        position:"absolute", left:0, right:0, height:"4px",
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        boxShadow: `0 0 24px ${color}, 0 0 48px ${color}88`,
        animation: "sve-neon-scan 6s linear infinite",
      } as CSSProperties} />
      <div style={{
        position:"absolute", inset:0,
        background: `linear-gradient(180deg, transparent, ${color}11, transparent)`,
        animation: "sve-neon-pulse 3s ease-in-out infinite",
      } as CSSProperties} />
    </div>
  );
}

export const VISUAL_EFFECTS: { value: VisualEffect; label: string; emoji: string; desc: string }[] = [
  { value: "none",      label: "Nenhum",     emoji: "∅",  desc: "Sem efeito" },
  { value: "snow",      label: "Neve",       emoji: "❄️", desc: "Flocos caindo" },
  { value: "confetti",  label: "Confete",    emoji: "🎉", desc: "Festa colorida" },
  { value: "fireflies", label: "Vagalumes",  emoji: "✨", desc: "Pontos brilhantes" },
  { value: "bubbles",   label: "Bolhas",     emoji: "🫧", desc: "Bolhas subindo" },
  { value: "matrix",    label: "Matrix",     emoji: "💾", desc: "Código caindo" },
  { value: "hearts",    label: "Corações",   emoji: "❤️", desc: "Amor no ar" },
  { value: "sparkles",  label: "Brilhos",    emoji: "✦",  desc: "Brilhos pulsantes" },
  { value: "leaves",    label: "Folhas",     emoji: "🍃", desc: "Folhas caindo" },
  { value: "neon",      label: "Neon",       emoji: "⚡", desc: "Linha de scan" },
];
