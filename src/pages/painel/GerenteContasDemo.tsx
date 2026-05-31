import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Trash2, Eye, EyeOff, Sparkles, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/painel/PageHeader";

type DemoRow = {
  id: string;
  display_name: string | null;
  slug: string;
  created_at: string;
  user_id: string;
  email?: string | null;
};

function randomPwd() {
  const base = "LovDemo";
  const n = Math.floor(100 + Math.random() * 900);
  return `${base}${n}!`;
}

export default function GerenteContasDemo() {
  const [list, setList] = useState<DemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPwd());
  const [displayName, setDisplayName] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("resellers")
        .select("id, display_name, slug, created_at, user_id")
        .eq("is_demo" as any, true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (data ?? []).map((r: any) => r.user_id);
      let emails: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => { emails[p.id] = p.email; });
      }
      setList(((data ?? []) as any[]).map((r) => ({ ...r, email: emails[r.user_id] ?? null })));
    } catch (e: any) {
      toast.error("Erro ao carregar contas demo", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const handleCreate = async () => {
    if (!email.trim() || !password.trim()) {
      toast.error("Preencha email e senha");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-demo-account", {
        body: { email: email.trim(), password, display_name: displayName.trim() || null },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error ?? error?.message ?? "Falha ao criar");
      }
      toast.success("Conta demo criada!");
      setLastCreated({ email: email.trim(), password });
      setEmail("");
      setDisplayName("");
      setPassword(randomPwd());
      await fetchList();
    } catch (e: any) {
      toast.error("Erro ao criar conta demo", { description: e?.message });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-demo-account", {
        body: { reseller_id: id },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error ?? error?.message ?? "Falha ao excluir");
      }
      toast.success("Conta demo excluída");
      await fetchList();
    } catch (e: any) {
      toast.error("Erro ao excluir", { description: e?.message });
    } finally {
      setDeletingId(null);
    }
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copiado`); } catch {}
  };

  const copyCredentials = (em: string, pw: string) => {
    const txt = `Acesso demo LovConnect\nLogin: ${em}\nSenha: ${pw}\nURL: ${window.location.origin}/auth`;
    copy(txt, "Credenciais");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas demo"
        description="Crie acessos temporários para demonstração a novos revendedores. Não afeta métricas reais."
        icon={Sparkles}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criar nova conta demo</CardTitle>
          <CardDescription>Tudo o que essa conta fizer é fictício e isolado do painel real.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="demo-email">Email</Label>
              <Input id="demo-email" type="email" placeholder="demo-cliente@lovconnect.store"
                value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-name">Nome do cliente (opcional)</Label>
              <Input id="demo-name" placeholder="João da Silva"
                value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="demo-pwd">Senha</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input id="demo-pwd" type={showPwd ? "text" : "password"} value={password}
                    onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                  <button type="button" onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Mostrar/ocultar senha">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" size="icon" onClick={() => setPassword(randomPwd())} title="Gerar nova">
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button onClick={handleCreate} disabled={creating} className="w-full sm:w-auto">
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Criar acesso demo
            </Button>
          </div>

          {lastCreated && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <div className="mb-2 font-semibold">Última conta criada — copie e envie ao cliente:</div>
              <div className="font-mono text-xs break-all">Login: {lastCreated.email}</div>
              <div className="font-mono text-xs break-all">Senha: {lastCreated.password}</div>
              <Button size="sm" variant="outline" className="mt-2"
                onClick={() => copyCredentials(lastCreated.email, lastCreated.password)}>
                <Copy className="mr-2 h-3.5 w-3.5" /> Copiar credenciais
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas demo ativas</CardTitle>
          <CardDescription>{list.length} conta(s) demo no momento</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma conta demo criada ainda.</p>
          ) : (
            <div className="space-y-3">
              {list.map((r) => (
                <div key={r.id} className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{r.display_name ?? "Sem nome"}</span>
                      <Badge variant="secondary" className="text-[10px]">DEMO</Badge>
                    </div>
                    <div className="mt-1 break-all text-xs text-muted-foreground">{r.email ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Criada em {new Date(r.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div className="flex gap-2 sm:flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => copy(r.email ?? "", "Email")}
                      className="flex-1 sm:flex-initial">
                      <Copy className="mr-2 h-3.5 w-3.5" /> Email
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={deletingId === r.id}
                          className="flex-1 sm:flex-initial">
                          {deletingId === r.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir conta demo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação remove permanentemente <strong>{r.display_name ?? r.email}</strong> e
                            todos os dados gerados durante a demonstração. Não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(r.id)}>Confirmar exclusão</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}