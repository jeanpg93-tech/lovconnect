import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, ShieldCheck, Info, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CancelSaleTarget = {
  sale_id: string;
  sale_type: "storefront" | "manual";
  label: string;          // ex: "#12345" ou key
  price_cents: number;    // valor pago pelo cliente (PIX) — para storefront
  cost_cents: number;     // valor que será devolvido ao saldo do revendedor
  license_key: string | null;
};

type WithdrawCheck = {
  withdraw_enabled: boolean;
  account_verified?: boolean;
  withdraw_blocked?: boolean;
  available_cents?: number | null;
  reason?: string;
};

const PIX_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
];

const fmtMoney = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function CancelSaleDialog({
  target, open, onOpenChange, onDone,
}: {
  target: CancelSaleTarget | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<WithdrawCheck | null>(null);
  const [method, setMethod] = useState<"auto" | "manual">("manual");
  const [pixKey, setPixKey] = useState("");
  const [pixType, setPixType] = useState("cpf");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Storefront permite ambos; manual só permite manual.
  const allowAuto = target?.sale_type === "storefront";

  useEffect(() => {
    if (!open || !target) return;
    setCheck(null);
    setMethod("manual");
    setPixKey("");
    setPixType("cpf");
    setConfirmed(false);
    if (!allowAuto) return;
    setChecking(true);
    supabase.functions.invoke("check-misticpay-withdraw", { body: {} })
      .then(({ data, error }) => {
        if (error) {
          setCheck({ withdraw_enabled: false, reason: "error" });
        } else {
          const c = data as WithdrawCheck;
          setCheck(c);
          if (c.withdraw_enabled) setMethod("auto");
        }
      })
      .finally(() => setChecking(false));
  }, [open, target, allowAuto]);

  if (!target) return null;

  const submit = async () => {
    if (!confirmed) {
      toast.error("Confirme que entendeu o cancelamento.");
      return;
    }
    if (method === "auto" && (!pixKey.trim() || !pixType)) {
      toast.error("Informe a chave PIX do cliente.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-sale", {
        body: {
          sale_type: target.sale_type,
          sale_id: target.sale_id,
          refund_method: method,
          pix_key: method === "auto" ? pixKey.trim() : undefined,
          pix_key_type: method === "auto" ? pixType : undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).message ?? (data as any).error);
      toast.success(
        method === "auto"
          ? "Chave revogada e PIX enviado ao cliente."
          : "Chave revogada. Marcado como reembolsado manualmente.",
      );
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao cancelar.");
    } finally {
      setSubmitting(false);
    }
  };

  const reasonHelp = (r?: string) => {
    switch (r) {
      case "no_credentials":
        return "Você não configurou a MisticPay no seu painel ainda. Faça isso em Integrações para vender e estornar pela loja.";
      case "invalid_credentials":
        return "Suas credenciais da MisticPay estão inválidas. Atualize em Integrações.";
      case "not_verified":
        return "Sua conta MisticPay ainda não está verificada. Faça a verificação no painel da MisticPay para habilitar saques.";
      case "withdraw_blocked":
        return "Saque está bloqueado na sua conta MisticPay. Entre em contato com o suporte da MisticPay.";
      default:
        return "Não foi possível confirmar se sua conta MisticPay aceita saque agora. Você pode tentar mesmo assim ou usar o fluxo manual.";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-rose-500" /> Cancelar venda {target.label}
          </DialogTitle>
          <DialogDescription>
            Ao confirmar, a chave da licença será <b>revogada</b> imediatamente. Em seguida você escolhe como devolver o valor ao cliente. O saldo do seu painel é devolvido em um passo separado, depois.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider">Sem volta</div>
            <div className="text-xs text-muted-foreground">
              A revogação da chave é imediata e o cliente perde o acesso. Confira antes de prosseguir.
            </div>
          </div>
        </div>

        {allowAuto && (
          <div className="space-y-3">
            <Label className="text-xs font-bold uppercase tracking-wider">Estorno ao cliente</Label>
            {checking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Verificando sua MisticPay…
              </div>
            )}

            {!checking && (
              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                    method === "auto" ? "border-primary bg-primary/5" : "border-border"
                  } ${!check?.withdraw_enabled ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="refund_method"
                    value="auto"
                    checked={method === "auto"}
                    disabled={!check?.withdraw_enabled}
                    onChange={() => setMethod("auto")}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="text-sm font-bold flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" /> Automático via MisticPay
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Reembolsa {fmtMoney(target.price_cents)} direto da sua conta MisticPay para a chave PIX do cliente.
                    </p>
                    {!check?.withdraw_enabled && check && (
                      <p className="text-[11px] text-amber-600">{reasonHelp(check.reason)}</p>
                    )}
                  </div>
                </label>
                <label
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${
                    method === "manual" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="refund_method"
                    value="manual"
                    checked={method === "manual"}
                    onChange={() => setMethod("manual")}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-1">
                    <div className="text-sm font-bold flex items-center gap-2">
                      <Info className="h-4 w-4 text-muted-foreground" /> Manual (já reembolsei por fora)
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Você combina o PIX com o cliente por fora e só marca aqui como reembolsado.
                    </p>
                  </div>
                </label>
              </div>
            )}

            {method === "auto" && check?.withdraw_enabled && (
              <div className="grid grid-cols-[120px_1fr] gap-2 items-end pt-1">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Tipo</Label>
                  <Select value={pixType} onValueChange={setPixType}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PIX_TYPES.map((p) => (
                        <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Chave PIX do cliente</Label>
                  <Input
                    className="h-9 text-xs"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Informe a chave PIX para o estorno"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {!allowAuto && (
          <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground">
              Vendas manuais (geradas pelo painel ou API) não passam pela MisticPay. Combine o reembolso com o cliente por fora. Aqui só registramos a baixa.
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 text-xs pt-1">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Entendo que a chave será revogada e o cliente perderá o acesso. O saldo de
            <b> {fmtMoney(target.cost_cents)}</b> volta para o meu painel apenas no próximo passo.
          </span>
        </label>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Voltar
          </Button>
          <Button
            className="bg-rose-500 text-white hover:bg-rose-600"
            onClick={submit}
            disabled={submitting || !confirmed}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Revogar chave e cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}