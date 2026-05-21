import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer, StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, RefreshCcw, Plus, Trash2, Trophy, Pencil, Medal, Award,
  Crown, Sparkles, Target, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Prize = {
  id: string;
  position: number;
  title: string;
  description: string;
  prize_value: string;
  is_active: boolean;
};

const blankPrize: Omit<Prize, "id"> = {
  position: 1,
  title: "",
  description: "",
  prize_value: "",
  is_active: true,
};

const positionStyle = (pos: number) => {
  if (pos === 1) return {
    badge: "bg-gradient-to-br from-amber-400 to-yellow-600 text-white shadow-lg shadow-amber-500/30",
    ring: "ring-amber-400/40",
    accent: "from-amber-500/15 via-amber-500/5 to-transparent",
    icon: Crown,
    label: "Ouro",
  };
  if (pos === 2) return {
    badge: "bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-lg shadow-slate-500/30",
    ring: "ring-slate-400/40",
    accent: "from-slate-400/15 via-slate-400/5 to-transparent",
    icon: Medal,
    label: "Prata",
  };
  if (pos === 3) return {
    badge: "bg-gradient-to-br from-orange-500 to-amber-800 text-white shadow-lg shadow-orange-700/30",
    ring: "ring-orange-500/40",
    accent: "from-orange-500/15 via-orange-500/5 to-transparent",
    icon: Award,
    label: "Bronze",
  };
  return {
    badge: "bg-muted text-foreground border border-border",
    ring: "ring-border",
    accent: "from-primary/5 via-transparent to-transparent",
    icon: Trophy,
    label: `${pos}º lugar`,
  };
};

export default function GerenteRankingPrizes() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPrize, setEditPrize] = useState<Partial<Prize> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadPrizes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ranking_prizes")
      .select("*")
      .order("position", { ascending: true });

    if (error) toast.error(error.message);
    else setPrizes((data ?? []) as Prize[]);
    setLoading(false);
  };

  useEffect(() => { loadPrizes(); }, []);

  const stats = useMemo(() => ({
    total: prizes.length,
    active: prizes.filter((p) => p.is_active).length,
    podium: prizes.filter((p) => p.position <= 3 && p.is_active).length,
  }), [prizes]);

  const sorted = useMemo(
    () => [...prizes].sort((a, b) => a.position - b.position),
    [prizes],
  );

  const savePrize = async () => {
    if (!editPrize || !editPrize.title || !editPrize.prize_value) {
      toast.error("Título e valor do prêmio são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        position: Number(editPrize.position) || 1,
        title: editPrize.title,
        description: editPrize.description || "",
        prize_value: editPrize.prize_value,
        is_active: editPrize.is_active ?? true,
      };
      if (editPrize.id) {
        const { error } = await supabase.from("ranking_prizes").update(payload).eq("id", editPrize.id);
        if (error) throw error;
        toast.success("Premiação atualizada");
      } else {
        const { error } = await supabase.from("ranking_prizes").insert(payload);
        if (error) throw error;
        toast.success("Premiação criada");
      }
      setEditPrize(null);
      loadPrizes();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar premiação");
    } finally {
      setSaving(false);
    }
  };

  const deletePrize = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("ranking_prizes").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Premiação removida"); loadPrizes(); }
    setDeleteId(null);
  };

  return (
    <PageContainer>
      <PageHeader
        icon={Trophy}
        title="Premiações do Ranking"
        description="Configure as recompensas que motivam seus revendedores a chegar ao topo do ranking mensal."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={loadPrizes} disabled={loading}>
              <RefreshCcw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button onClick={() => setEditPrize({ ...blankPrize, position: (sorted.at(-1)?.position ?? 0) + 1 })}>
              <Plus className="mr-2 h-4 w-4" /> Nova Premiação
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Cadastradas" value={stats.total} icon={Trophy} accent="primary" hint="Prêmios configurados no ranking" />
        <StatCard label="Ativas" value={stats.active} icon={Sparkles} accent="emerald" hint="Visíveis aos revendedores" />
        <StatCard label="Pódio" value={`${stats.podium}/3`} icon={Crown} accent="amber" hint="1º, 2º e 3º lugar ativos" />
      </div>

      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-card/40">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">carregando premiações…</p>
        </div>
      ) : prizes.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Trophy className="h-7 w-7" />
          </div>
          <h3 className="font-display text-lg font-bold">Nenhuma premiação configurada</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Crie a primeira recompensa para incentivar a competição saudável entre seus revendedores.
          </p>
          <Button className="mt-5" onClick={() => setEditPrize({ ...blankPrize })}>
            <Plus className="mr-2 h-4 w-4" /> Criar primeira premiação
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => {
            const s = positionStyle(p.position);
            const Icon = s.icon;
            return (
              <Card
                key={p.id}
                className={cn(
                  "group relative overflow-hidden rounded-3xl border-border p-0 transition-all duration-300",
                  "hover:-translate-y-0.5 hover:shadow-md",
                  !p.is_active && "opacity-70",
                )}
              >
                <div className={cn("absolute inset-0 bg-gradient-to-br pointer-events-none", s.accent)} />
                <Icon className="pointer-events-none absolute -right-4 -bottom-4 h-32 w-32 text-foreground/[0.04] rotate-12" />

                <div className="relative p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black ring-4",
                        s.badge, s.ring,
                      )}>
                        {p.position}º
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                          {s.label}
                        </div>
                        <h3 className="font-display text-base font-bold leading-tight line-clamp-1">
                          {p.title}
                        </h3>
                      </div>
                    </div>

                    {!p.is_active && (
                      <div className="flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        <EyeOff className="h-3 w-3" /> Inativo
                      </div>
                    )}
                  </div>

                  <div className="mt-5">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                      Recompensa
                    </div>
                    <div className="mt-0.5 font-display text-2xl font-black break-words">
                      {p.prize_value}
                    </div>
                  </div>

                  {p.description && (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                      {p.description}
                    </p>
                  )}

                  <div className="mt-5 flex items-center justify-end gap-1 border-t border-border pt-3">
                    <Button variant="ghost" size="sm" onClick={() => setEditPrize(p)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(p.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editPrize} onOpenChange={(open) => !open && setEditPrize(null)}>
        <DialogContent className="bg-card border-border sm:max-w-[480px]">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Trophy className="h-5 w-5" />
            </div>
            <DialogTitle className="font-display text-xl">
              {editPrize?.id ? "Editar Premiação" : "Nova Premiação"}
            </DialogTitle>
            <DialogDescription>
              Configure a posição no ranking e a recompensa que será exibida aos revendedores.
            </DialogDescription>
          </DialogHeader>

          {editPrize && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="position" className="text-xs">Posição</Label>
                  <Input
                    id="position"
                    type="number"
                    min="1"
                    value={editPrize.position}
                    onChange={(e) => setEditPrize({ ...editPrize, position: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="col-span-2 grid gap-2">
                  <Label htmlFor="title" className="text-xs">Título</Label>
                  <Input
                    id="title"
                    placeholder="Ex: Campeão do Mês"
                    value={editPrize.title || ""}
                    onChange={(e) => setEditPrize({ ...editPrize, title: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="value" className="text-xs">Valor / Prêmio</Label>
                <Input
                  id="value"
                  placeholder="Ex: R$ 1.000,00 ou iPhone 15"
                  value={editPrize.prize_value || ""}
                  onChange={(e) => setEditPrize({ ...editPrize, prize_value: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description" className="text-xs">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="Detalhes, regras ou observações sobre o prêmio..."
                  value={editPrize.description || ""}
                  onChange={(e) => setEditPrize({ ...editPrize, description: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
                <div>
                  <Label htmlFor="is_active" className="text-sm font-semibold">Premiação ativa</Label>
                  <p className="text-[11px] text-muted-foreground">Exibida no painel dos revendedores</p>
                </div>
                <Switch
                  id="is_active"
                  checked={editPrize.is_active ?? true}
                  onCheckedChange={(checked) => setEditPrize({ ...editPrize, is_active: checked })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditPrize(null)}>Cancelar</Button>
            <Button onClick={savePrize} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar Premiação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="bg-card border-border sm:max-w-[400px]">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="h-5 w-5" />
            </div>
            <DialogTitle>Remover premiação?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. A premiação deixará de aparecer para os revendedores.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={deletePrize}>
              <Trash2 className="mr-2 h-4 w-4" /> Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
