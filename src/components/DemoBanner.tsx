import { Sparkles } from "lucide-react";
import { useRole } from "@/hooks/useRole";

export function DemoBanner() {
  const { isDemo } = useRole();
  if (!isDemo) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent px-3 py-2 text-amber-700 dark:text-amber-300 shadow-sm">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="text-[12px] leading-snug sm:text-sm">
        <span className="font-bold uppercase tracking-wider">Conta de demonstração</span>
        <span className="hidden sm:inline"> — você está em uma conta de testes. Dados podem ser fictícios e ações como compras, recargas e envios não afetam sistemas reais.</span>
        <span className="sm:hidden"> — dados fictícios, ações simuladas.</span>
      </div>
    </div>
  );
}