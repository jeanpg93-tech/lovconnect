import { cn } from "@/lib/utils";
import claudeLogo from "@/assets/claude-logo.png.asset.json";

/**
 * Logo "asterisco/sparkle" do Claude (Anthropic).
 * Renderiza como SVG simples usando currentColor para herdar o tema
 * (segue o padrão dos ícones lucide do projeto).
 */
export function ClaudeIcon({ className, size }: { className?: string; size?: number }) {
  return (
    <img
      src={claudeLogo.url}
      alt="Claude"
      width={size}
      height={size}
      className={cn("inline-block shrink-0 object-contain select-none", className)}
      draggable={false}
    />
  );
}

export default ClaudeIcon;