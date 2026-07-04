import { useState } from "react";
import { Eye, EyeOff, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  value?: string | null;
  claudeOrderId?: string;
  label?: string;
  className?: string;
};

function mask(v: string) {
  if (!v) return "";
  const tail = v.slice(-4);
  return `${"•".repeat(Math.max(8, Math.min(24, v.length - 4)))}${tail}`;
}

export default function ApiKeyReveal({ value, claudeOrderId, label = "API", className }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [fetched, setFetched] = useState<string | null>(value ?? null);
  const [loading, setLoading] = useState(false);
  if (!value && !claudeOrderId) return null;

  const ensureValue = async (): Promise<string | null> => {
    if (fetched) return fetched;
    if (!claudeOrderId) return null;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_claude_order_api_key" as any, {
        _order_id: claudeOrderId,
      });
      if (error) throw error;
      const v = (data as string | null) ?? null;
      setFetched(v);
      return v;
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao obter API Key");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const display = fetched ?? "";
  return (
    <div className={cn("flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 p-1.5", className)}>
      <span className="text-[9px] font-bold uppercase text-primary/80 shrink-0 pl-1">{label}</span>
      <code className={cn("flex-1 font-mono text-[11px] truncate px-1", revealed && "select-all")}>
        {revealed && display ? display : mask(display || "••••••••••••")}
      </code>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={async () => {
          if (!revealed) {
            const v = await ensureValue();
            if (v) setRevealed(true);
          } else {
            setRevealed(false);
          }
        }}
        title={revealed ? "Ocultar" : "Revelar"}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        onClick={async () => {
          const v = await ensureValue();
          if (!v) return;
          await navigator.clipboard.writeText(v);
          toast.success("API Key copiada");
        }}
        title="Copiar API Key"
        disabled={loading}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}