import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

/**
 * Logo "asterisco/sparkle" do Claude (Anthropic).
 * Renderiza como SVG simples usando currentColor para herdar o tema
 * (segue o padrão dos ícones lucide do projeto).
 */
export function ClaudeIcon({ className, size, style }: { className?: string; size?: number; style?: CSSProperties }) {
  const s = size ?? 24;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Claude"
      className={cn("inline-block shrink-0", className)}
      style={style}
    >
      {/* Sparkle/asterisco do Claude — 12 raios saindo do centro */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI) / 6;
        const x1 = 12 + Math.cos(a) * 3.2;
        const y1 = 12 + Math.sin(a) * 3.2;
        const x2 = 12 + Math.cos(a) * 9;
        const y2 = 12 + Math.sin(a) * 9;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </svg>
  );
}

export default ClaudeIcon;