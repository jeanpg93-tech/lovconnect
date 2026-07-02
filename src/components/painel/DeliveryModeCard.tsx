import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Package, Wallet, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { refetchRole } from "@/hooks/useRole";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Cartão "Modo de venda ativo" para revendedores em billing_mode = 'pack'.
 * Permite alternar entre consumir do Pacote ou debitar da Carteira nas vendas
 * Loja e API (geração manual sempre usa pacote).
 */
export default function DeliveryModeCard() {
  const { isPack, deliverySource, packCredits } = useRole();
  const [saving, setSaving] = useState(false);

  if (!isPack) return null;

  const isPackMode = deliverySource === "pack";

  const creditsTone =
    packCredits >= 10
      ? { text: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Saudável" }
      : packCredits >= 5
        ? { text: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/40", label: "Atenção" }
        : { text: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/40", label: packCredits === 0 ? "Esgotado" : "Crítico" };

  const toggle = async (next: boolean) => {
    const target = next ? "pack" : "wallet";
    setSaving(true);
    const { error } = await supabase.rpc("set_reseller_delivery_source" as any, { _source: target });
    if (error) {
      setSaving(false);
      toast.error(error.message ?? "Falha ao atualizar modo de venda");
      return;
    }
    await refetchRole();
    setSaving(false);
    toast.success(
      target === "pack"
        ? "Modo Pack ativado — vendas consomem licenças do pack"
        : "Modo Carteira ativado — vendas debitam do saldo",
    );
  };

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card/60 p-4 sm:p-5",
        isPackMode ? "border-primary/40" : "border-emerald-500/30",
      )}
    >
      <div
        className="absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 pointer-events-none blur-3xl"
        style={{
          background: isPackMode
            ? "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 65%)"
            : "radial-gradient(circle, hsl(160 84% 39% / 0.30), transparent 65%)",
        }}
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Lado esquerdo: pill + descrição */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center min-w-0 flex-1">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border",
              isPackMode
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
            )}
          >
            {isPackMode ? <Package className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Modo de venda ativo
            </div>
            <div className="mt-1 font-display text-lg sm:text-xl font-black leading-tight">
              {isPackMode ? (
                <span className="text-primary">Pack de Licenças</span>
              ) : (
                <span className="text-emerald-500">Saldo da Carteira</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isPackMode
                ? "Vendas Loja e API consomem 1 licença do pack. Se acabar, debita do saldo automaticamente."
                : "Vendas Loja e API debitam do seu saldo em R$."}
            </p>
          </div>
        </div>

        {/* Lado direito: contador + toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shrink-0">
          <div
            className={cn(
              "rounded-xl border px-3 py-2 text-center sm:text-left min-w-[110px]",
              creditsTone.bg,
              creditsTone.border,
            )}
            title={`${packCredits} licença${packCredits === 1 ? "" : "s"} restante${packCredits === 1 ? "" : "s"}`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Licenças restantes
            </div>
            <div className={cn("font-mono text-2xl font-black leading-none mt-0.5", creditsTone.text)}>
              {packCredits}
            </div>
            <div className={cn("text-[10px] font-semibold mt-0.5", creditsTone.text)}>
              {creditsTone.label}
            </div>
          </div>

          <div className="flex flex-col items-stretch sm:items-end gap-2">
            <label className="flex items-center justify-between sm:justify-end gap-3 rounded-xl border border-border bg-background/60 px-3 py-2 cursor-pointer">
              <span className="text-xs font-semibold">
                {isPackMode ? "Pack" : "Carteira"}
              </span>
              <Switch
                checked={isPackMode}
                onCheckedChange={toggle}
                disabled={saving}
                aria-label="Alternar modo de venda"
              />
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </label>
            <Button asChild size="sm" variant="ghost" className="h-auto px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground self-end">
              <Link to="/painel/revendedor/comprar-pacote">
                Comprar pack <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}