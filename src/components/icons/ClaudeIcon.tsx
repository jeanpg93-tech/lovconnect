import { cn } from "@/lib/utils";

/**
 * Logo "asterisco/sparkle" do Claude (Anthropic).
 * Renderiza como SVG simples usando currentColor para herdar o tema
 * (segue o padrão dos ícones lucide do projeto).
 */
export function ClaudeIcon({ className, size }: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size ?? "1em"}
      height={size ?? "1em"}
      fill="currentColor"
      stroke="none"
      className={cn("inline-block shrink-0", className)}
      aria-hidden="true"
    >
      {/* Asterisco característico do Claude — 8 pétalas radiais */}
      <path d="M12 2c.35 0 .65.23.75.56l1.5 5.06 4.86-2.16a.78.78 0 0 1 1.01 1.01l-2.16 4.86 5.06 1.5c.74.22.74 1.28 0 1.5l-5.06 1.5 2.16 4.86a.78.78 0 0 1-1.01 1.01l-4.86-2.16-1.5 5.06a.78.78 0 0 1-1.5 0l-1.5-5.06-4.86 2.16a.78.78 0 0 1-1.01-1.01l2.16-4.86-5.06-1.5c-.74-.22-.74-1.28 0-1.5l5.06-1.5L1.88 6.47a.78.78 0 0 1 1.01-1.01l4.86 2.16 1.5-5.06A.78.78 0 0 1 12 2Z" />
    </svg>
  );
}

export default ClaudeIcon;