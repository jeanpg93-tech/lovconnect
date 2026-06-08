import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Copy, Check, ExternalLink, Sparkles } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resellerId: string;
  plan: {
    id: string;
    name: string;
    duration_days: number;
    credits_per_day: number;
    total_credits_cap: number;
    bot_owner_email: string;
  };
  cost_cents: number;
  sale_price_cents: number;
  onCreated?: () => void;
};

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function GerarVendaPlanoDialog({
  open,
  onOpenChange,
  resellerId,
  plan,
  cost_cents,
  sale_price_cents,
  onCreated,
}: Props) {
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsapp, setCustomerWhatsapp] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCustomerName("");
      setCustomerWhatsapp("");
      setNotes("");
      setCreatedToken(null);
      setCopied(false);
    }
  }, [open]);

  const link = useMemo(
    () => (createdToken ? `${window.location.origin}/plano/${createdToken}` : ""),
    [createdToken],
  );

  const canSubmit = customerName.trim().length >= 2 && plan.bot_owner_email && cost_cents > 0 && sale_price_cents > 0;

  const create = async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("reseller_recharge_plan_subscriptions")
        .insert({
          reseller_id: resellerId,
          plan_id: plan.id,
          customer_name: customerName.trim(),
          customer_whatsapp: customerWhatsapp.trim() || null,
          owner_email_required: plan.bot_owner_email,
          source: "manual",
          cost_cents,
          sale_price_cents,
          duration_days: plan.duration_days,
          credits_per_day: plan.credits_per_day,
          total_credits_cap: plan.total_credits_cap,
          notes: notes.trim() || null,
        })
        .select("order_token")
        .single();
      if (error) throw error;
      setCreatedToken(data.order_token);
      toast.success("Venda criada");
      onCreated?.();
    } catch (e: any) {
      toast.error("Erro ao criar venda", { description: e.message });
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copiado");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar venda — {plan.name}
          </DialogTitle>
          <DialogDescription>
            Crie um pedido e envie o link para o cliente configurar o workspace.
          </DialogDescription>
        </DialogHeader>

        {!createdToken ? (
          <div className="space-y-4">
            {!plan.bot_owner_email && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                O gerente ainda não configurou o email do bot deste plano. Peça
                para ele preencher antes de vender.
              </div>
            )}

            <div>
              <Label>Nome do cliente *</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ex: João da Silva"
              />
            </div>
            <div>
              <Label>WhatsApp (opcional)</Label>
              <Input
                value={customerWhatsapp}
                onChange={(e) => setCustomerWhatsapp(e.target.value)}
                placeholder="+55 11 99999-9999"
              />
            </div>
            <div>
              <Label>Anotações internas (opcional)</Label>
              <Textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: pagou via PIX dia X"
              />
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seu custo</span>
                <span className="font-mono">{brl(cost_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Preço de venda</span>
                <span className="font-mono font-semibold">{brl(sale_price_cents)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-muted-foreground">Sua margem</span>
                <span className="font-mono text-emerald-500">
                  {brl(sale_price_cents - cost_cents)}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={create} disabled={!canSubmit || creating}>
                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar pedido
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              Pedido criado! Envie o link abaixo para o cliente. Ele vai
              configurar o workspace e confirmar o início da entrega.
            </div>
            <div className="space-y-1.5">
              <Label>Link do cliente</Label>
              <div className="flex gap-2">
                <Input value={link} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(link, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}