import { cn } from "@/lib/utils";
import claudeLogo from "@/assets/claude-logo.png.asset.json";

/**
 * Logo "asterisco/sparkle" do Claude (Anthropic).
 * Renderiza como SVG simples usando currentColor para herdar o tema
 * (segue o padrão dos ícones lucide do projeto).
 */
export function ClaudeIcon({ className, size }: { className?: string; size?: number }) {
  const px = size ?? "1em";
  return (
    <img
      src={claudeLogo.url}
      alt="Claude"
      width={typeof px === "number" ? px : undefined}
      height={typeof px === "number" ? px : undefined}
      style={typeof px === "string" ? { width: px, height: px } : undefined}
      className={cn("inline-block shrink-0 object-contain select-none", className)}
      draggable={false}
    />
  );
}

export default ClaudeIcon;