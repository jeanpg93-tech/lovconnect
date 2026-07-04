import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { ManualEntry, ManualEntryInput } from "@/hooks/useManualEntries";
import { useSalesCatalog } from "@/hooks/useSalesCatalog";
import { TrendingUp, TrendingDown, Package, KeyRound, Receipt, Store, Sparkles } from "lucide-react";

type Mode = "revenue" | "expense" | "credit_sale" | "license_sale" | "misticpay_fee" | "lovastore" | "claude_sale";

const CLAUDE_PLAN_LABELS: Record<string, string> = {
  pro_30d: "Claude Pro — 30 dias",
  "5x_30d": "Claude 5x — 30 dias",
  "20x_30d": "Claude 20x — 30 dias",
};

type ClaudePlanOption = {
  plan_code: string;
  label: string;
  cost_cents: number;
  sale_price_cents: number;
};

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const toCents = (s: string): number => {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
};
const fromCents = (c: number) => (c / 100).toFixed(2).replace(".", ",");

// Data local (do navegador do usuário) no formato YYYY-MM-DD.
// Evita drift de fuso que ocorre com new Date().toISOString().slice(0,10) (UTC).
const localTodayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const dateInputValueFromEntryDate = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ManualEntry | null;
  prefill?: ManualEntry | null;
  onSubmit: (data: ManualEntryInput) => Promise<void>;
};

export default function ManualEntryDialog({ open, onOpenChange, initial, prefill, onSubmit }: Props) {
  const { toast } = useToast();
  const { creditPacks, licenses } = useSalesCatalog();
  const [mode, setMode] = useState<Mode>("revenue");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [cost, setCost] = useState("");
  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [selectedLicense, setSelectedLicense] = useState<string>("");
  const [selectedClaudePlan, setSelectedClaudePlan] = useState<string>("");
  const [claudePlans, setClaudePlans] = useState<ClaudePlanOption[]>([]);
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => localTodayISO());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      // cost_cents/reseller_cost_cents são restritos por RLS de coluna — usa RPC de gerente
      const { data } = await supabase.rpc("admin_claude_plan_prices_full" as any);
      const opts: ClaudePlanOption[] = ((data as any[]) || [])
        .filter((r) => r.is_active)
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((r) => ({
        plan_code: r.plan_code,
        label: CLAUDE_PLAN_LABELS[r.plan_code] || `Claude ${r.plan_code}`,
        cost_cents: Number(r.cost_cents || 0),
        sale_price_cents: Number(r.sale_price_cents || 0),
      }));
      setClaudePlans(opts);
    })();
  }, [open]);

  useEffect(() => {
    if (open) {
      const src = initial ?? prefill;
      if (src) {
        // Modo a partir do reference_kind
        if (src.reference_kind === "credit_pack") setMode("credit_sale");
        else if (src.reference_kind === "license") setMode("license_sale");
        else if (src.reference_kind === "misticpay_fee") setMode("misticpay_fee");
        else if (src.reference_kind === "lovastore") setMode("lovastore");
        else if (src.reference_kind === "claude") setMode("claude_sale");
        else setMode(src.entry_type);
        setDescription(src.description);
        setAmount(fromCents(src.amount_cents));
        setCost(src.cost_cents ? fromCents(src.cost_cents) : "");
        setSelectedPackId(src.reference_meta?.plan_id || "");
        setSelectedLicense(src.reference_meta?.license_type || "");
        setSelectedClaudePlan(src.reference_meta?.plan_code || "");
        setCategory(src.category || "");
        // ao duplicar, usa data de hoje; ao editar, mantém data original
        // usa data LOCAL (não UTC) para evitar drift de fuso ao gerar o default
        setDate(initial ? dateInputValueFromEntryDate(src.entry_date) : localTodayISO());
      } else {
        setMode("revenue");
        setDescription("");
        setAmount("");
        setCost("");
        setSelectedPackId("");
        setSelectedLicense("");
        setSelectedClaudePlan("");
        setCategory("");
        setDate(localTodayISO());
      }
    }
  }, [open, initial, prefill]);

  // Auto-preenche quando muda o pacote/licença
  const handlePackSelect = (planId: string) => {
    setSelectedPackId(planId);
    const pack = creditPacks.find((p) => p.plan_id === planId);
    if (pack) {
      setAmount(fromCents(pack.suggested_price_cents));
      setCost(fromCents(pack.suggested_cost_cents));
      setDescription(`Venda manual de ${pack.label}`);
      setCategory("Venda externa - Créditos");
    }
  };
  const handleLicenseSelect = (lic: string) => {
    setSelectedLicense(lic);
    const l = licenses.find((x) => x.license_type === lic);
    if (l) {
      setAmount(fromCents(l.suggested_price_cents));
      setCost("0,00");
      setDescription(`Venda manual de ${l.label}`);
      setCategory("Venda externa - Licença");
    }
  };
  const handleClaudeSelect = (code: string) => {
    setSelectedClaudePlan(code);
    const p = claudePlans.find((x) => x.plan_code === code);
    if (p) {
      setAmount(fromCents(p.sale_price_cents));
      setCost(fromCents(p.cost_cents));
      setDescription(`Venda manual de ${p.label}`);
      setCategory("Venda externa - Claude");
    }
  };

  const isSale = mode === "credit_sale" || mode === "license_sale" || mode === "lovastore" || mode === "claude_sale";
  const entryType: "revenue" | "expense" =
    mode === "expense" || mode === "misticpay_fee" ? "expense" : "revenue";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = toCents(amount);
    const costCents = isSale ? toCents(cost) : 0;
    if (!description.trim() || !cents || cents <= 0) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (mode === "credit_sale" && !selectedPackId) {
      toast({ title: "Selecione um pacote de créditos", variant: "destructive" });
      return;
    }
    if (mode === "license_sale" && !selectedLicense) {
      toast({ title: "Selecione uma licença", variant: "destructive" });
      return;
    }
    if (mode === "claude_sale" && !selectedClaudePlan) {
      toast({ title: "Selecione um plano Claude", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const reference_kind =
        mode === "credit_sale" ? "credit_pack" :
        mode === "license_sale" ? "license" :
        mode === "misticpay_fee" ? "misticpay_fee" :
        mode === "lovastore" ? "lovastore" :
        mode === "claude_sale" ? "claude" : null;
      const reference_meta =
        mode === "credit_sale"
          ? { plan_id: selectedPackId, ...creditPacks.find((p) => p.plan_id === selectedPackId) }
          : mode === "license_sale"
          ? { license_type: selectedLicense, ...licenses.find((l) => l.license_type === selectedLicense) }
          : mode === "claude_sale"
          ? { plan_code: selectedClaudePlan, ...claudePlans.find((p) => p.plan_code === selectedClaudePlan) }
          : null;
      await onSubmit({
        entry_type: entryType,
        description: description.trim(),
        amount_cents: cents,
        cost_cents: costCents,
        reference_kind,
        reference_meta,
        category: category.trim() || (mode === "misticpay_fee" ? "Taxa MisticPay" : mode === "lovastore" ? "LovaStore" : mode === "claude_sale" ? "Venda externa - Claude" : null),
        // Salva ao MEIO-DIA UTC do dia escolhido. Isso mantém o mesmo calendário em
        // qualquer fuso (-11h a +11h), evitando que a data selecionada apareça no
        // dia anterior/posterior por causa de conversão de fuso horário.
        entry_date: new Date(`${date}T12:00:00Z`).toISOString(),
      });
      toast({ title: initial ? "Lançamento atualizado" : "Lançamento criado" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const profit = toCents(amount) - (isSale ? toCents(cost) : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar lançamento" : "Novo lançamento manual"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Modos */}
          <div className="grid grid-cols-3 gap-1.5">
            <ModeButton active={mode === "credit_sale"} onClick={() => setMode("credit_sale")} icon={Package} label="Venda Crédito" activeClass="bg-blue-600 hover:bg-blue-700 text-white" />
            <ModeButton active={mode === "license_sale"} onClick={() => setMode("license_sale")} icon={KeyRound} label="Venda Licença" activeClass="bg-violet-600 hover:bg-violet-700 text-white" />
            <ModeButton active={mode === "claude_sale"} onClick={() => setMode("claude_sale")} icon={Sparkles} label="Venda Claude" activeClass="bg-fuchsia-600 hover:bg-fuchsia-700 text-white" />
            <ModeButton active={mode === "lovastore"} onClick={() => setMode("lovastore")} icon={Store} label="LovaStore" activeClass="bg-orange-600 hover:bg-orange-700 text-white" />
            <ModeButton active={mode === "revenue"} onClick={() => setMode("revenue")} icon={TrendingUp} label="Receita Avulsa" activeClass="bg-emerald-600 hover:bg-emerald-700 text-white" />
            <ModeButton active={mode === "expense"} onClick={() => setMode("expense")} icon={TrendingDown} label="Despesa" activeClass="bg-red-600 hover:bg-red-700 text-white" />
            <ModeButton active={mode === "misticpay_fee"} onClick={() => setMode("misticpay_fee")} icon={Receipt} label="Taxa MisticPay" activeClass="bg-amber-600 hover:bg-amber-700 text-white" />
          </div>

          {mode === "lovastore" && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-[11px] text-orange-700 dark:text-orange-300">
              Venda da sua loja própria <strong>LovaStore</strong>. Entra no bloco LovaStore da Composição da Receita e soma na Receita Total. Informe o custo se houver, para o lucro ser calculado.
            </div>
          )}

          {mode === "misticpay_fee" && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300">
              Esta taxa será somada ao bloco <strong>Taxa Gateway</strong> no dashboard financeiro (junto às taxas automáticas por recarga), e não ao bloco de despesas avulsas.
            </div>
          )}

          {/* Seletor de pacote/licença */}
          {mode === "credit_sale" && (
            <div className="space-y-1.5">
              <Label>Pacote de Créditos</Label>
              <Select value={selectedPackId} onValueChange={handlePackSelect}>
                <SelectTrigger><SelectValue placeholder="Selecione um pacote..." /></SelectTrigger>
                <SelectContent>
                  {creditPacks.map((p) => (
                    <SelectItem key={p.plan_id} value={p.plan_id}>
                      {p.label} — sugerido {brl(p.suggested_price_cents)} • custo {brl(p.suggested_cost_cents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Preço sugerido = tabela Partner (Ouro). Custo = o que você paga ao provedor. Ambos podem ser editados.
              </p>
            </div>
          )}

          {mode === "license_sale" && (
            <div className="space-y-1.5">
              <Label>Tipo de Licença</Label>
              <Select value={selectedLicense} onValueChange={handleLicenseSelect}>
                <SelectTrigger><SelectValue placeholder="Selecione uma licença..." /></SelectTrigger>
                <SelectContent>
                  {licenses.map((l) => (
                    <SelectItem key={l.license_type} value={l.license_type}>
                      {l.label}{l.suggested_price_cents > 0 ? ` — sugerido ${brl(l.suggested_price_cents)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Licenças não têm custo de provedor (custo = R$ 0,00). Preço de venda é editável.
              </p>
            </div>
          )}

          {mode === "claude_sale" && (
            <div className="space-y-1.5">
              <Label>Plano Claude</Label>
              <Select value={selectedClaudePlan} onValueChange={handleClaudeSelect}>
                <SelectTrigger><SelectValue placeholder="Selecione um plano..." /></SelectTrigger>
                <SelectContent>
                  {claudePlans.map((p) => (
                    <SelectItem key={p.plan_code} value={p.plan_code}>
                      {p.label} — sugerido {brl(p.sale_price_cents)} • custo {brl(p.cost_cents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Preço sugerido = tabela do sistema. Custo = valor pago ao provedor Claude. Ambos podem ser editados.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Venda manual de 100 créditos para João" rows={2} />
          </div>

          {/* Valores */}
          <div className={`grid gap-3 ${isSale ? "grid-cols-2" : "grid-cols-2"}`}>
            <div className="space-y-1.5">
              <Label>{isSale ? "Preço de venda (R$)" : mode === "expense" ? "Valor da despesa (R$)" : "Valor da receita (R$)"}</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            {isSale && (
              <div className="space-y-1.5">
                <Label>Custo (R$)</Label>
                <Input
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0,00"
                  inputMode="decimal"
                  disabled={mode === "license_sale"}
                />
              </div>
            )}
          </div>

          {/* Resumo lucro */}
          {isSale && toCents(amount) > 0 && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Lucro estimado desta venda</span>
              <span className={`font-mono font-black tabular-nums ${profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {brl(profit)}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria (opcional)</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Software, Taxa" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active, onClick, icon: Icon, label, activeClass,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
  activeClass: string;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      className={`flex flex-col h-auto min-h-[64px] px-1.5 py-2 gap-1 text-[10px] font-bold leading-tight whitespace-normal text-center ${active ? activeClass : ""}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="break-words">{label}</span>
    </Button>
  );
}