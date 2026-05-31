import { useState } from "react";
import { Sparkles, RotateCcw, Loader2 } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DemoBanner() {
  const { isDemo } = useRole();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  if (!isDemo) return null;

  const handleReset = async () => {
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("reset-demo-account", { body: {} });
    setResetting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Falha ao resetar demo");
      return;
    }
    toast.success("Demo resetada! Recarregando…");
    setOpen(false);
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <>
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent px-3 py-2 text-amber-700 dark:text-amber-300 shadow-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 text-[12px] leading-snug sm:text-sm">
          <span className="font-bold uppercase tracking-wider">Conta de demonstração</span>
          <span className="hidden sm:inline"> — você está em uma conta de testes. Dados podem ser fictícios e ações como compras, recargas e envios não afetam sistemas reais.</span>
          <span className="sm:hidden"> — dados fictícios, ações simuladas.</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 h-7 gap-1 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200"
          onClick={() => setOpen(true)}
        >
          <RotateCcw className="h-3 w-3" />
          <span className="hidden sm:inline">Resetar demo</span>
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar conta demo?</AlertDialogTitle>
            <AlertDialogDescription>
              Vamos limpar todas as chaves geradas, vendas, transações da carteira, clientes e cobranças
              criadas nesta conta de demonstração. A conta em si permanece ativa para você continuar testando.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={resetting} className="gap-2">
              {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sim, resetar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}