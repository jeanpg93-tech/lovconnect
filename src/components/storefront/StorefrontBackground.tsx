import { CSSProperties } from "react";

type Props = {
  effect: "none" | "grid" | "circles" | "flames" | "dots" | "waves" | "aurora" | "stars" | "mesh" | "rays";
  color: string;
};

/**
 * Decorative full-bleed background for the public storefront.
 * Sits behind the page content (z-index 0) and is purely visual.
 */
export function StorefrontBackground({ effect, color }: Props) {
  if (effect === "none") return null;

  if (effect === "grid") {
    const style: CSSProperties = {
      backgroundImage: `
        linear-gradient(${color}22 1px, transparent 1px),
        linear-gradient(90deg, ${color}22 1px, transparent 1px)
      `,
      backgroundSize: "44px 44px",
      maskImage:
        "radial-gradient(ellipse at center, black 40%, transparent 80%)",
      WebkitMaskImage:
        "radial-gradient(ellipse at center, black 40%, transparent 80%)",
    };
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={style}
      />
    );
  }

  if (effect === "circles") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full blur-3xl opacity-40 animate-pulse"
          style={{ background: `radial-gradient(circle, ${color}66, transparent 70%)` }}
        />
        <div
          className="absolute top-1/3 -right-40 h-[520px] w-[520px] rounded-full blur-3xl opacity-30"
          style={{ background: `radial-gradient(circle, ${color}55, transparent 70%)` }}
        />
        <div
          className="absolute bottom-[-200px] left-1/3 h-[380px] w-[380px] rounded-full blur-3xl opacity-30"
          style={{ background: `radial-gradient(circle, ${color}44, transparent 70%)` }}
        />
      </div>
    );
  }

  if (effect === "dots") {
    const style: CSSProperties = {
      backgroundImage: `radial-gradient(${color}33 1.4px, transparent 1.8px)`,
      backgroundSize: "22px 22px",
      maskImage: "radial-gradient(ellipse at center, black 50%, transparent 85%)",
      WebkitMaskImage: "radial-gradient(ellipse at center, black 50%, transparent 85%)",
    };
    return <div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={style} />;
  }

  if (effect === "waves") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <style>{`
          @keyframes sf-wave-shift { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
          .sf-wave { position:absolute; left:0; width:200%; height:240px; background-repeat:repeat-x; animation: sf-wave-shift linear infinite; }
        `}</style>
        <div className="sf-wave" style={{ bottom: "10%", animationDuration: "20s", opacity: 0.45,
          backgroundImage: `radial-gradient(circle at 50% 100%, ${color}55 0 60px, transparent 62px)`, backgroundSize: "240px 240px" }} />
        <div className="sf-wave" style={{ bottom: "-10%", animationDuration: "30s", animationDirection: "reverse", opacity: 0.3,
          backgroundImage: `radial-gradient(circle at 50% 100%, ${color}77 0 80px, transparent 82px)`, backgroundSize: "320px 320px" }} />
      </div>
    );
  }

  if (effect === "aurora") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <style>{`
          @keyframes sf-aur { 0%,100%{transform:translate(0,0) rotate(0deg)} 50%{transform:translate(40px,-20px) rotate(8deg)} }
          .sf-aur { position:absolute; filter: blur(100px); mix-blend-mode: screen; animation: sf-aur 14s ease-in-out infinite; border-radius: 50%; }
        `}</style>
        <div className="sf-aur" style={{ top: "-20%", left: "-10%", width: "70%", height: "60%",
          background: `linear-gradient(120deg, ${color}88, transparent 70%)` }} />
        <div className="sf-aur" style={{ bottom: "-30%", right: "-10%", width: "80%", height: "70%", animationDelay: "4s",
          background: `linear-gradient(300deg, ${color}66, transparent 70%)` }} />
        <div className="sf-aur" style={{ top: "30%", left: "30%", width: "50%", height: "50%", animationDelay: "7s",
          background: `linear-gradient(60deg, ${color}55, transparent 70%)` }} />
      </div>
    );
  }

  if (effect === "stars") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <style>{`
          @keyframes sf-twinkle { 0%,100%{opacity:.15} 50%{opacity:1} }
          .sf-star { position:absolute; border-radius:9999px; animation: sf-twinkle ease-in-out infinite; }
        `}</style>
        {Array.from({ length: 80 }).map((_, i) => {
          const top = (i * 53) % 100, left = (i * 37) % 100;
          const size = 1 + ((i * 7) % 3);
          return <div key={i} className="sf-star" style={{
            top: `${top}%`, left: `${left}%`, width: size, height: size,
            background: color, boxShadow: `0 0 8px ${color}`,
            animationDuration: `${2 + (i % 5)}s`, animationDelay: `${(i % 7) * 0.4}s`
          }} />;
        })}
      </div>
    );
  }

  if (effect === "mesh") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0" style={{
          background: `radial-gradient(at 20% 20%, ${color}55, transparent 50%),
                       radial-gradient(at 80% 10%, ${color}33, transparent 55%),
                       radial-gradient(at 70% 85%, ${color}66, transparent 55%),
                       radial-gradient(at 10% 80%, ${color}44, transparent 50%)`,
          filter: "blur(40px)",
        }} />
      </div>
    );
  }

  if (effect === "rays") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <style>{`
          @keyframes sf-ray-spin { from{transform:translate(-50%,-50%) rotate(0deg)} to{transform:translate(-50%,-50%) rotate(360deg)} }
        `}</style>
        <div className="absolute left-1/2 top-1/2 w-[200vmax] h-[200vmax] opacity-30"
          style={{
            background: `repeating-conic-gradient(from 0deg, ${color}33 0deg 6deg, transparent 6deg 18deg)`,
            animation: "sf-ray-spin 90s linear infinite",
            maskImage: "radial-gradient(circle, black 5%, transparent 55%)",
            WebkitMaskImage: "radial-gradient(circle, black 5%, transparent 55%)",
          }} />
      </div>
    );
  }

  // flames
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <style>{`
        @keyframes sf-flame-rise {
          0%   { transform: translateY(0) scale(1); opacity: 0.0; }
          15%  { opacity: 0.55; }
          70%  { opacity: 0.35; }
          100% { transform: translateY(-110vh) scale(0.4); opacity: 0; }
        }
        @keyframes sf-flame-flicker {
          0%, 100% { filter: blur(32px) hue-rotate(0deg); }
          50%      { filter: blur(48px) hue-rotate(15deg); }
        }
        .sf-flame {
          position: absolute;
          bottom: -120px;
          width: 220px;
          height: 220px;
          border-radius: 9999px;
          mix-blend-mode: screen;
          animation: sf-flame-rise linear infinite, sf-flame-flicker ease-in-out infinite;
        }
      `}</style>
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background: `linear-gradient(to top, ${color}33, transparent)`,
        }}
      />
      {[
        { left: "8%",  delay: "0s",   dur: "9s",  size: 220, hue: color },
        { left: "22%", delay: "2.5s", dur: "11s", size: 180, hue: color },
        { left: "40%", delay: "1s",   dur: "8s",  size: 260, hue: color },
        { left: "58%", delay: "3.5s", dur: "10s", size: 200, hue: color },
        { left: "74%", delay: "0.8s", dur: "12s", size: 240, hue: color },
        { left: "88%", delay: "2s",   dur: "9.5s",size: 180, hue: color },
      ].map((f, i) => (
        <div
          key={i}
          className="sf-flame"
          style={{
            left: f.left,
            width: f.size,
            height: f.size,
            background: `radial-gradient(circle at 50% 60%, ${f.hue}cc 0%, ${f.hue}66 35%, transparent 70%)`,
            animationDuration: `${f.dur}, 2.4s`,
            animationDelay: `${f.delay}, 0s`,
          }}
        />
      ))}
    </div>
  );
}
