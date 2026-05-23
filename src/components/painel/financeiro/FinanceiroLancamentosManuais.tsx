import { useState } from "react";
import { useManualEntries, type ManualEntry } from "@/hooks/useManualEntries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import ManualEntryDialog from "./ManualEntryDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FinanceiroLancamentosManuais() {
  const { entries, loading, create, update, remove } = useManualEntries();
  const [filter, setFilter] = useState<"all" | "revenue" | "expense">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManualEntry | null>(null);
  const [toDelete, setToDelete] = useState<ManualEntry | null>(null);

  const filtered = entries.filter((e) => filter === "all" || e.entry_type === filter);

  return (
    <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-primary rounded-full" />
          <div>
            <h3 className="font-display text-lg font-bold tracking-tight">Lançamentos Manuais</h3>
            <p className="text-xs text-muted-foreground">Vendas por fora e gastos avulsos do sistema</p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo lançamento
        </Button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {[
          { id: "all", label: "Todos" },
          { id: "revenue", label: "Receitas" },
          { id: "expense", label: "Despesas" },
        ].map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? "default" : "outline"}
            onClick={() => setFilter(f.id as any)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground italic">
          Nenhum lançamento manual ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const isRev = e.entry_type === "revenue";
            return (
              <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card/50 hover:border-primary/30 transition-colors">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${isRev ? "bg-emerald-500/15 text-emerald-500" : "bg-red-500/15 text-red-500"}`}>
                  {isRev ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{e.description}</p>
                    {e.category && <Badge variant="outline" className="text-[9px]">{e.category}</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(e.entry_date), "dd 'de' MMM yyyy", { locale: ptBR })}
                  </p>
                </div>
                <div className={`font-mono font-black text-sm tabular-nums shrink-0 ${isRev ? "text-emerald-500" : "text-red-500"}`}>
                  {isRev ? "+" : "−"} {brl(e.amount_cents)}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(e); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setToDelete(e)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ManualEntryDialog
        open={open}
        onOpenChange={setOpen}
        initial={editing}
        onSubmit={async (data) => {
          if (editing) await update(editing.id, data);
          else await create(data);
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.description} — {toDelete ? brl(toDelete.amount_cents) : ""}. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toDelete) {
                  await remove(toDelete.id);
                  setToDelete(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}