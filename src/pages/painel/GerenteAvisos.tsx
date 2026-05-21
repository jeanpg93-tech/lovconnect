import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  AlertTriangle, Sparkles, Megaphone, Gift, Wrench, Plus, Pencil, Trash2, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Category = "alerta" | "atualizacao" | "novidade" | "bonus" | "geral";

type Announcement = {
  id: string;
  title: string;
  content: string;
  category: Category;
  priority: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

const CATEGORIES: { value: Category; label: string; icon: any; color: string }[] = [
  { value: "alerta", label: "Alerta", icon: AlertTriangle, color: "text-destructive border-destructive/40 bg-destructive/10" },
  { value: "atualizacao", label: "Atualização", icon: Wrench, color: "text-blue-500 border-blue-500/40 bg-blue-500/10" },
  { value: "novidade", label: "Novidade", icon: Sparkles, color: "text-purple-500 border-purple-500/40 bg-purple-500/10" },
  { value: "bonus", label: "Bônus de recargas", icon: Gift, color: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10" },
  { value: "geral", label: "Geral", icon: Megaphone, color: "text-muted-foreground border-border bg-muted" },
];

const catMeta = (c: string) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[4];

const empty = {
  title: "",
  content: "",
  category: "geral" as Category,
  priority: 0,
  is_active: true,
  expires_at: "",
};

export default function GerenteAvisos() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar: " + error.message);
    setItems((data ?? []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setForm({
      title: a.title,
      content: a.content,
      category: a.category,
      priority: a.priority,
      is_active: a.is_active,
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Preencha título e conteúdo");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category,
      priority: Number(form.priority) || 0,
      is_active: form.is_active,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    const res = editing
      ? await supabase.from("announcements").update(payload).eq("id", editing.id)
      : await supabase.from("announcements").insert({ ...payload, created_by: u.user?.id });
    setSaving(false);
    if (res.error) {
      toast.error("Erro ao salvar: " + res.error.message);
      return;
    }
    toast.success(editing ? "Aviso atualizado" : "Aviso publicado");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success("Aviso removido");
    load();
  };

  const toggleActive = async (a: Announcement) => {
    const { error } = await supabase
      .from("announcements")
      .update({ is_active: !a.is_active })
      .eq("id", a.id);
    if (error) return toast.error("Erro: " + error.message);
    load();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Avisos"
        description="Publique avisos visíveis para todos os revendedores."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" /> Novo aviso
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar aviso" : "Novo aviso"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <span className="flex items-center gap-2">
                            <c.icon className="h-3.5 w-3.5" /> {c.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Título</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} />
                </div>
                <div>
                  <Label>Conteúdo</Label>
                  <Textarea
                    value={form.content}
                    onChange={(e) => setForm({ ...form, content: e.target.value })}
                    rows={5}
                    maxLength={2000}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Prioridade</Label>
                    <Input
                      type="number"
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">Maior = aparece primeiro</p>
                  </div>
                  <div>
                    <Label>Expira em (opcional)</Label>
                    <Input
                      type="datetime-local"
                      value={form.expires_at}
                      onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <div className="text-sm font-medium">Ativo</div>
                    <div className="text-xs text-muted-foreground">Quando desativado, não aparece para os revendedores</div>
                  </div>
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum aviso ainda. Crie o primeiro com o botão acima.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const m = catMeta(a.category);
            const expired = a.expires_at && new Date(a.expires_at) < new Date();
            return (
              <Card key={a.id} className={cn(!a.is_active && "opacity-60")}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", m.color)}>
                          <m.icon className="h-3 w-3" /> {m.label}
                        </span>
                        {a.priority > 0 && (
                          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                            Prioridade {a.priority}
                          </span>
                        )}
                        {!a.is_active && (
                          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Inativo
                          </span>
                        )}
                        {expired && (
                          <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                            Expirado
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-base font-bold sm:text-lg">{a.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.content}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        <span>Criado: {new Date(a.created_at).toLocaleString("pt-BR")}</span>
                        {a.expires_at && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Expira: {new Date(a.expires_at).toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                      <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover aviso?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(a.id)}>Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
