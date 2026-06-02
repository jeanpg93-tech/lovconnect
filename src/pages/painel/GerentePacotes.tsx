import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Package, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useProviderCommitments } from "@/hooks/useProviderCommitments";
import { PackIcon, PACK_ICON_NAMES } from "@/lib/pack-icons";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Pack = {
  id: string; name: string; credits: number; price_cents: number;
  is_active: boolean; sort_order: number; icon?: string | null;
};

const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

// Parse "1.234,56" or "1234.56" -> cents (integer)
const parseBRLToCents = (s: string): number => {
  if (!s) return NaN;
  const cleaned = String(s).replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
};

const centsToInput = (c: number | undefined | null): string => {
  if (c === undefined || c === null || !Number.isFinite(Number(c))) return "";
  return (Number(c) / 100).toFixed(2).replace(".", ",");
};

export default function GerentePacotes() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Pack> | null>(null);
  const [saving, setSaving] = useState(false);
  const [totalStr, setTotalStr] = useState<string>("");
  const [perStr, setPerStr] = useState<string>("");
  const commitments = useProviderCommitments();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("license_packs" as any)
      .select("*")
      .order("sort_order", { ascending: true })
      .order("credits", { ascending: true });
    setPacks((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // sync local input strings when opening dialog
  useEffect(() => {
    if (editing) {
      const totalCents = Number(editing.price_cents ?? 0);
      const credits = Number(editing.credits ?? 0);
      setTotalStr(editing.price_cents !== undefined ? centsToInput(totalCents) : "");
      setPerStr(credits > 0 && totalCents > 0 ? centsToInput(totalCents / credits) : "");
    } else {
      setTotalStr("");
      setPerStr("");
    }
  }, [editing?.id, editing == null]);

  const save = async () => {
    if (!editing) return;
    const name = (editing.name ?? "").trim();
    const credits = Number(editing.credits);
    const price_cents = parseBRLToCents(totalStr);
    if (!name) return toast.error("Nome obrigatório");
    if (!Number.isInteger(credits) || credits <= 0) return toast.error("Quantidade de licenças inválida");
    if (!Number.isFinite(price_cents) || price_cents < 0) return toast.error("Preço inválido");

    setSaving(true);
    const payload: any = {
      name, credits, price_cents,
      is_active: editing.is_active ?? true,
      sort_order: Number(editing.sort_order ?? 0),
      icon: editing.icon ?? null,
    };
    const { error } = editing.id
      ? await supabase.from("license_packs" as any).update(payload).eq("id", editing.id)
      : await supabase.from("license_packs" as any).insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Pacote salvo");
    setEditing(null);
    load();
  };

  const onTotalChange = (v: string) => {
    setTotalStr(v);
    const cents = parseBRLToCents(v);
    const credits = Number(editing?.credits);
    if (Number.isFinite(cents) && Number.isInteger(credits) && credits > 0) {
      setPerStr(centsToInput(cents / credits));
      setEditing((e) => e ? { ...e, price_cents: cents } : e);
    } else {
      setEditing((e) => e ? { ...e, price_cents: Number.isFinite(cents) ? cents : undefined as any } : e);
    }
  };

  const onPerChange = (v: string) => {
    setPerStr(v);
    const perCents = parseBRLToCents(v);
    const credits = Number(editing?.credits);
    if (Number.isFinite(perCents) && Number.isInteger(credits) && credits > 0) {
      const total = Math.round(perCents * credits);
      setTotalStr(centsToInput(total));
      setEditing((e) => e ? { ...e, price_cents: total } : e);
    }
  };

  const onCreditsChange = (v: string) => {
    const credits = Number(v);
    setEditing((e) => e ? { ...e, credits } : e);
    // recompute per-license from total when possible
    const totalCents = parseBRLToCents(totalStr);
    if (Number.isFinite(totalCents) && Number.isInteger(credits) && credits > 0) {
      setPerStr(centsToInput(totalCents / credits));
    }
  };

  const toggle = async (p: Pack) => {
    const { error } = await supabase
      .from("license_packs" as any).update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (p: Pack) => {
    if (!confirm(`Excluir o pacote "${p.name}"?`)) return;
    const { error } = await supabase.from("license_packs" as any).delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Pacote excluído");
    load();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = packs.findIndex((p) => p.id === active.id);
    const newIdx = packs.findIndex((p) => p.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(packs, oldIdx, newIdx).map((p, i) => ({ ...p, sort_order: (i + 1) * 10 }));
    setPacks(reordered); // optimistic
    const updates = reordered.map((p) =>
      supabase.from("license_packs" as any).update({ sort_order: p.sort_order }).eq("id", p.id)
    );
    const results = await Promise.all(updates);
    const err = results.find((r) => r.error)?.error;
    if (err) {
      toast.error("Falha ao salvar nova ordem");
      load();
    } else {
      toast.success("Ordem atualizada");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Pacotes de Licença"
        description="Cadastre os pacotes de licenças vendidos aos revendedores Pack"
        actions={
          <Button onClick={() => setEditing({ is_active: true, sort_order: packs.length })}>
            <Plus className="h-4 w-4 mr-2" /> Novo pacote
          </Button>
        }
      />

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="rounded-lg border border-border bg-card/60 p-3">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Estoque Flow</div>
          <div className="font-mono text-lg font-black text-foreground">
            {!Number.isFinite(commitments.flowRemaining) ? "∞" : commitments.flowRemaining}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card/60 p-3">
          <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Estoque Lovax</div>
          <div className="font-mono text-lg font-black text-foreground">{commitments.lovaxRemaining}</div>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400">Comprometido em Packs</div>
          <div className="font-mono text-lg font-black text-amber-600 dark:text-amber-400">{commitments.committed}</div>
        </div>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">Disponível Real</div>
          <div className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400">
            {!Number.isFinite(commitments.realAvailable) ? "∞" : commitments.realAvailable}
          </div>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : packs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <Package className="mx-auto h-8 w-8 mb-2 opacity-60" />
            Nenhum pacote cadastrado ainda.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {packs.map((p) => {
              const perKey = p.credits > 0 ? p.price_cents / p.credits : 0;
              const stockAvail = !Number.isFinite(commitments.realAvailable) || commitments.loading
                ? true
                : Number(p.credits) <= commitments.realAvailable;
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-lg font-bold">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.credits} licenças</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={p.is_active ? "default" : "secondary"}>
                        {p.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                      {p.is_active && !stockAvail && (
                        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400 text-[10px]">
                          Sem estoque
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 font-mono text-2xl font-black text-primary">{brl(p.price_cents)}</div>
                  <div className="text-[11px] text-muted-foreground">{brl(perKey)} por licença</div>
                  {p.is_active && !stockAvail && (
                    <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                      Oculto do revendedor: estoque insuficiente
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(p)}>
                      {p.is_active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-rose-400 ml-auto" onClick={() => remove(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar pacote" : "Novo pacote"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>Quantidade de licenças</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={editing.credits ?? ""}
                  onChange={(e) => onCreditsChange(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Preço total (R$)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={totalStr}
                    onChange={(e) => onTotalChange(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Valor cobrado pelo pacote inteiro</p>
                </div>
                <div>
                  <Label>Preço por licença (R$)</Label>
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={perStr}
                    onChange={(e) => onPerChange(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Atualiza o total automaticamente</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <Label>Ordem</Label>
                  <Input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                  <Label>Ativo</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}