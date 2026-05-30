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
import { Loader2, Plus, Pencil, Package, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Pack = {
  id: string; name: string; credits: number; price_cents: number;
  is_active: boolean; sort_order: number;
};

const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

export default function GerentePacotes() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Pack> | null>(null);
  const [saving, setSaving] = useState(false);

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

  const save = async () => {
    if (!editing) return;
    const name = (editing.name ?? "").trim();
    const credits = Number(editing.credits);
    const price_cents = Math.round(Number(editing.price_cents));
    if (!name) return toast.error("Nome obrigatório");
    if (!Number.isInteger(credits) || credits <= 0) return toast.error("Créditos inválidos");
    if (!Number.isFinite(price_cents) || price_cents < 0) return toast.error("Preço inválido");

    setSaving(true);
    const payload: any = {
      name, credits, price_cents,
      is_active: editing.is_active ?? true,
      sort_order: Number(editing.sort_order ?? 0),
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

  return (
    <PageContainer>
      <PageHeader
        title="Pacotes de Licença"
        description="Cadastre os pacotes de créditos vendidos aos revendedores Pack"
        action={
          <Button onClick={() => setEditing({ is_active: true, sort_order: packs.length })}>
            <Plus className="h-4 w-4 mr-2" /> Novo pacote
          </Button>
        }
      />

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
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display text-lg font-bold">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.credits} créditos</div>
                    </div>
                    <Badge variant={p.is_active ? "default" : "secondary"}>
                      {p.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="mt-3 font-mono text-2xl font-black text-primary">{brl(p.price_cents)}</div>
                  <div className="text-[11px] text-muted-foreground">{brl(perKey)} por chave</div>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Créditos</Label>
                  <Input type="number" value={editing.credits ?? ""} onChange={(e) => setEditing({ ...editing, credits: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Preço (centavos)</Label>
                  <Input type="number" value={editing.price_cents ?? ""} onChange={(e) => setEditing({ ...editing, price_cents: Number(e.target.value) })} />
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