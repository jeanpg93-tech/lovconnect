import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer, StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Copy, Trash2, Sparkles, Tag, CheckCircle2, Users, Pause, Share2, TrendingUp, DollarSign, Search } from "lucide-react";
import { toast } from "sonner";

type Affiliate = {
  id: string;
  code: string;
  label: string | null;
  max_uses: number | null;
  uses: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

type ReferralRow = {
  id: string;
  affiliate_code: string;
  total_commission_cents: number;
  created_at: string;
  referrer: { id: string; display_name: string; phone: string | null } | null;
  referred: { id: string; display_name: string; phone: string | null; created_at: string } | null;
  recharges_count: number;
  recharges_total_cents: number;
};

const randomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

export default function GerenteAffiliados() {
  const [list, setList] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("affiliate_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setList((data ?? []) as Affiliate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDialog = () => {
    setCode(randomCode());
    setLabel("");
    setMaxUses("");
    setOpen(true);
  };

  const create = async () => {
    if (!code.trim()) return toast.error("Informe um código");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("affiliate_codes").insert({
      code: code.trim().toUpperCase(),
      label: label.trim() || null,
      max_uses: maxUses ? parseInt(maxUses, 10) : null,
      created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      if (error.message.includes("duplicate")) toast.error("Esse código já existe");
      else toast.error(error.message);
      return;
    }
    toast.success("Código criado");
    setOpen(false);
    load();
  };

  const toggleActive = async (a: Affiliate) => {
    const { error } = await supabase
      .from("affiliate_codes")
      .update({ is_active: !a.is_active })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (a: Affiliate) => {
    if (!confirm(`Remover código "${a.code}"?`)) return;
    const { error } = await supabase.from("affiliate_codes").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    load();
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  const stats = {
    total: list.length,
    active: list.filter((l) => l.is_active).length,
    inactive: list.filter((l) => !l.is_active).length,
    totalUses: list.reduce((s, l) => s + (l.uses ?? 0), 0),
  };

  return (
    <PageContainer>
      <PageHeader
        title="Afiliados"
        description="Gere códigos que promovem novos cadastros a revendedor automaticamente."
        icon={Tag}
        actions={
          <Button onClick={openDialog} className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-xl">
            <Plus className="mr-1.5 h-4 w-4" /> Novo código
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Códigos" value={stats.total} icon={Tag} hint="Total cadastrado" />
        <StatCard label="Ativos" value={stats.active} icon={CheckCircle2} hint="Aceitando novos cadastros" />
        <StatCard label="Inativos" value={stats.inactive} icon={Pause} hint="Pausados ou esgotados" />
        <StatCard label="Conversões" value={stats.totalUses} icon={Users} hint="Cadastros gerados" />
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : list.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Tag className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Nenhum código de afiliado criado ainda.
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-foreground/80">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Código</th>
                    <th className="px-4 py-3 text-left font-bold">Descrição</th>
                    <th className="px-4 py-3 text-center font-bold">Usos</th>
                    <th className="px-4 py-3 text-center font-bold">Ativo</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => {
                    const exhausted = a.max_uses != null && a.uses >= a.max_uses;
                    return (
                      <tr key={a.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-sm font-semibold text-primary">{a.code}</code>
                            <Button size="sm" variant="ghost" onClick={() => copy(a.code)} className="h-6 w-6 p-0">
                              <Copy className="h-3 w-3" />
                            </Button>
                            {exhausted && <Badge variant="destructive" className="text-[10px]">esgotado</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{a.label ?? "—"}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">
                          {a.uses}{a.max_uses != null ? ` / ${a.max_uses}` : ""}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(a)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-white/5">
              {list.map((a) => {
                const exhausted = a.max_uses != null && a.uses >= a.max_uses;
                return (
                  <div key={a.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-sm font-semibold text-primary">{a.code}</code>
                          <Button size="sm" variant="ghost" onClick={() => copy(a.code)} className="h-6 w-6 p-0">
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        {a.label && <p className="text-xs text-muted-foreground">{a.label}</p>}
                      </div>
                      <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-muted-foreground">
                        Usos: <span className="text-foreground">{a.uses}{a.max_uses != null ? ` / ${a.max_uses}` : ""}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {exhausted && <Badge variant="destructive" className="text-[10px]">esgotado</Badge>}
                        <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => remove(a)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Novo código de afiliado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Quem se cadastrar em <code className="font-mono">/auth</code> usando este código será
              promovido a <strong>revendedor</strong> automaticamente.
            </p>
            <div className="space-y-1.5">
              <Label>Código</Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                />
                <Button type="button" variant="outline" onClick={() => setCode(randomCode())}>
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Campanha YouTube"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Limite de usos (opcional)</Label>
              <Input
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Em branco = ilimitado"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={create}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
