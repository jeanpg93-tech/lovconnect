import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { ManualEntry, ManualEntryInput } from "@/hooks/useManualEntries";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ManualEntry | null;
  onSubmit: (data: ManualEntryInput) => Promise<void>;
};

export default function ManualEntryDialog({ open, onOpenChange, initial, onSubmit }: Props) {
  const { toast } = useToast();
  const [entryType, setEntryType] = useState<"revenue" | "expense">("revenue");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        setEntryType(initial.entry_type);
        setDescription(initial.description);
        setAmount((initial.amount_cents / 100).toFixed(2).replace(".", ","));
        setCategory(initial.category || "");
        setDate(initial.entry_date.slice(0, 10));
      } else {
        setEntryType("revenue");
        setDescription("");
        setAmount("");
        setCategory("");
        setDate(new Date().toISOString().slice(0, 10));
      }
    }
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = amount.replace(/\./g, "").replace(",", ".");
    const cents = Math.round(parseFloat(cleaned) * 100);
    if (!description.trim() || !cents || isNaN(cents) || cents <= 0) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        entry_type: entryType,
        description: description.trim(),
        amount_cents: cents,
        category: category.trim() || null,
        entry_date: new Date(date).toISOString(),
      });
      toast({ title: initial ? "Lançamento atualizado" : "Lançamento criado" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar lançamento" : "Novo lançamento manual"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={entryType === "revenue" ? "default" : "outline"}
              onClick={() => setEntryType("revenue")}
              className={entryType === "revenue" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              + Receita
            </Button>
            <Button
              type="button"
              variant={entryType === "expense" ? "default" : "outline"}
              onClick={() => setEntryType("expense")}
              className={entryType === "expense" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              − Despesa
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Venda manual de 100 créditos para João" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria (opcional)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Software, Taxa, Venda externa" />
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