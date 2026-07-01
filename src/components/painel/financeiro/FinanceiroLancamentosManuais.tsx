import { useState } from "react";
import { useManualEntries, type ManualEntry } from "@/hooks/useManualEntries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Loader2, Package, KeyRound, Copy, Store, Receipt, GripVertical } from "lucide-react";
import ManualEntryDialog from "./ManualEntryDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

const formatEntryDate = (value: string) =>
  format(new Date(value), "dd 'de' MMM yyyy", { locale: ptBR });

export default function FinanceiroLancamentosManuais() {
  const { entries, loading, create, update, remove, reorder } = useManualEntries();
  const [filter, setFilter] = useState<"all" | "revenue" | "expense">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManualEntry | null>(null);
  const [duplicating, setDuplicating] = useState<ManualEntry | null>(null);
  const [toDelete, setToDelete] = useState<ManualEntry | null>(null);

  const filtered = entries.filter((e) => filter === "all" || e.entry_type === filter);
  const dragEnabled = filter === "all";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(entries, oldIndex, newIndex);
    reorder(next.map((e) => e.id));
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-sm">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-primary rounded-full" />
          <div>
            <h3 className="font-display text-lg font-bold tracking-tight">Lançamentos Manuais</h3>
            <p className="text-xs text-muted-foreground">Vendas por fora e gastos avulsos. A ordem aqui é visual — o painel financeiro sempre usa a data do lançamento.</p>
          </div>
        </div>
        <Button onClick={() => { setEditing(null); setDuplicating(null); setOpen(true); }} className="gap-2">
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
      ) : dragEnabled ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filtered.map((e) => (
                <SortableRow
                  key={e.id}
                  entry={e}
                  onEdit={() => { setDuplicating(null); setEditing(e); setOpen(true); }}
                  onDuplicate={() => { setEditing(null); setDuplicating(e); setOpen(true); }}
                  onDelete={() => setToDelete(e)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <StaticRow
              key={e.id}
              entry={e}
              onEdit={() => { setDuplicating(null); setEditing(e); setOpen(true); }}
              onDuplicate={() => { setEditing(null); setDuplicating(e); setOpen(true); }}
              onDelete={() => setToDelete(e)}
            />
          ))}
        </div>
      )}

      <ManualEntryDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setDuplicating(null); } }}
        initial={editing}
        prefill={duplicating}
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

type RowProps = {
  entry: ManualEntry;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  dragHandle?: React.ReactNode;
};

function Row({ entry: e, onEdit, onDuplicate, onDelete, dragHandle }: RowProps) {
  const isRev = e.entry_type === "revenue";
  const isCreditSale = e.reference_kind === "credit_pack";
  const isLicenseSale = e.reference_kind === "license";
  const isLovastore = e.reference_kind === "lovastore";
  const isMisticFee = e.reference_kind === "misticpay_fee";
  const isSale = isCreditSale || isLicenseSale || isLovastore;
  const profit = isSale ? e.amount_cents - (e.cost_cents || 0) : 0;
  const Icon = isCreditSale ? Package : isLicenseSale ? KeyRound : isLovastore ? Store : isMisticFee ? Receipt : isRev ? TrendingUp : TrendingDown;
  const iconColor = isCreditSale
    ? "bg-blue-500/15 text-blue-500"
    : isLicenseSale
    ? "bg-violet-500/15 text-violet-500"
    : isLovastore
    ? "bg-orange-500/15 text-orange-500"
    : isMisticFee
    ? "bg-amber-500/15 text-amber-500"
    : isRev
    ? "bg-emerald-500/15 text-emerald-500"
    : "bg-red-500/15 text-red-500";
  return (
    <>
      {dragHandle}
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${iconColor}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm truncate">{e.description}</p>
          {e.category && <Badge variant="outline" className="text-[9px]">{e.category}</Badge>}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          <p className="text-[10px] text-muted-foreground">
            {formatEntryDate(e.entry_date)}
          </p>
          {isSale && (e.cost_cents || 0) > 0 && (
            <p className="text-[10px] text-muted-foreground">
              · custo <span className="font-mono text-red-400">{brl(e.cost_cents)}</span>
            </p>
          )}
          {isSale && (
            <p className="text-[10px]">
              · lucro <span className={`font-mono font-bold ${profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>{brl(profit)}</span>
            </p>
          )}
          {isMisticFee && e.reference_meta?.origin_label && (
            <p className="text-[10px] text-muted-foreground">
              · ref. <span className="font-mono text-amber-500">{e.reference_meta.origin_label}</span>
            </p>
          )}
          {isMisticFee && e.reference_meta?.tx_id && (
            <p className="text-[10px] text-muted-foreground font-mono">
              · tx <span className="text-foreground/70">#{String(e.reference_meta.tx_id).slice(0, 12)}</span>
            </p>
          )}
        </div>
      </div>
      <div className={`font-mono font-black text-sm tabular-nums shrink-0 ${isRev ? "text-emerald-500" : "text-red-500"}`}>
        {isRev ? "+" : "−"} {brl(e.amount_cents)}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Duplicar" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

function SortableRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.entry.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-xl border bg-card/50 transition-colors ${isDragging ? "border-primary shadow-lg" : "border-border hover:border-primary/30"}`}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none p-1 -ml-1"
        title="Arraste para reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Row {...props} />
    </div>
  );
}

function StaticRow(props: RowProps) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card/50 hover:border-primary/30 transition-colors">
      <Row {...props} />
    </div>
  );
}