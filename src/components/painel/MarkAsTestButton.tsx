import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SaleTable = "orders" | "reseller_credit_purchases" | "storefront_orders";

export default function MarkAsTestButton({
  table,
  id,
  isTest,
  size = "sm",
  variant = "ghost",
  onChanged,
  showBadge = true,
}: {
  table: SaleTable;
  id: string;
  isTest: boolean;
  size?: "sm" | "icon";
  variant?: "ghost" | "outline";
  onChanged?: (next: boolean) => void;
  showBadge?: boolean;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [local, setLocal] = useState(isTest);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !local;
    setLoading(true);
    try {
      const { error } = await supabase.rpc("set_sale_test_flag" as any, {
        _table: table,
        _id: id,
        _is_test: next,
      });
      if (error) throw error;
      setLocal(next);
      onChanged?.(next);
      toast({
        title: next ? "Marcado como teste" : "Desmarcado como teste",
        description: next
          ? "A venda foi removida dos relatórios financeiros."
          : "A venda voltou a aparecer nos relatórios.",
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message ?? "Falha ao atualizar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      {showBadge && local && (
        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-bold uppercase tracking-wider">
          <FlaskConical className="h-2.5 w-2.5 mr-0.5" /> Teste
        </Badge>
      )}
      <Button
        type="button"
        size={size === "icon" ? "icon" : "sm"}
        variant={variant}
        onClick={toggle}
        disabled={loading}
        title={local ? "Desmarcar como teste" : "Marcar como teste (oculta do financeiro)"}
        className={size === "icon" ? "h-7 w-7" : "h-7 px-2 text-[10px] gap-1"}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
        {size !== "icon" && <span>{local ? "Desmarcar teste" : "Marcar teste"}</span>}
      </Button>
    </div>
  );
}