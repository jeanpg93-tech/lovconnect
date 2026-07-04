import { useState } from "react";
import { Eye, EyeOff, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  label?: string;
  className?: string;
};

function mask(v: string) {
  if (!v) return "";
  const tail = v.slice(-4);
  return `${"•".repeat(Math.max(8, Math.min(24, v.length - 4)))}${tail}`;
}

export default function ApiKeyReveal({ value, label = "API", className }: Props) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return null;
  return (
    <div className={cn("flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-1.5", className)}>
      <span className="text-[9px] font-bold uppercase text-primary/80 shrink-0 pl-1">{label}</span>
      <code className={cn("flex-1 font-mono text-[11px] truncate px-1", revealed && "select-all")}>
        {revealed ? value : mask(value)}
      </code>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={() => setRevealed((r) => !r)}
        title={revealed ? "Ocultar" : "Revelar"}
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast.success("API Key copiada");
        }}
        title="Copiar API Key"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}