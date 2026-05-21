import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Undo2, AlertTriangle } from "lucide-react";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { toast } from "sonner";

export type RefundSaleData = {
  tipo: "credits" | "license";
  provider_pedido_id: string;
  reseller_label?: string | null;
  price_cents: number;
  extra_info?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: RefundSaleData | null;
  onSuccess?: () => void;
};

const fmtBRL = (c: number) =>
  (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RefundSaleDialog({ open, onOpenChange, data, onSuccess }: Props) {
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setObs("");
  }, [open]);

  const handleConfirm = async () => {
    if (!data) return;
    setLoading(true);
    try {
      const { data: res, error } = await invokeAuthenticatedFunction<any>(
        "gerente-estornar-venda",
        {
          method: "POST",
          body: {
            tipo: data.tipo,
            provider_pedido_id: data.provider_pedido_id,
            observacao: obs.trim() || undefined,
          },
        }
      );
      if (error || res?.error) {
        toast.error(res?.error || error?.message || "Erro ao estornar");
        return;
      }
      toast.success(`Estorno realizado: ${fmtBRL(res?.refunded_cents ?? data.price_cents)}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Undo2 className="h-4 w-4 text-rose-500" /> Confirmar estorno
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Esta ação devolve o valor ao saldo do revendedor e marca a venda como estornada. Não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3 text-xs sm:text-sm">
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
              <Row label="Tipo" value={data.tipo === "credits" ? "Venda de créditos" : "Venda de licença"} />
              {data.reseller_label && <Row label="Revendedor" value={data.reseller_label} />}
              {data.extra_info && <Row label="Detalhe" value={data.extra_info} />}
              <Row label="Pedido" value={<code className="font-mono text-[11px]">{data.provider_pedido_id}</code>} />
              <Row
                label="Valor a estornar"
                value={<span className="font-mono font-bold text-rose-500">{fmtBRL(data.price_cents)}</span>}
              />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                O saldo do revendedor será aumentado em <strong>{fmtBRL(data.price_cents)}</strong> e a transação aparecerá no histórico dele como "Estorno".
              </span>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">Observação (opcional)</label>
              <Textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Motivo do estorno..."
                className="mt-1 min-h-20 text-sm"
                maxLength={500}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || !data}
            className="w-full sm:w-auto"
          >
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Undo2 className="mr-1 h-4 w-4" />}
            Confirmar estorno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono">{label}</span>
      <span className="text-right text-xs">{value}</span>
    </div>
  );
}