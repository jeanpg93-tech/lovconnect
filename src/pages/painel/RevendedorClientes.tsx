import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Client = { id: string; email: string; display_name: string | null; created_at: string };
type Extension = { id: string; name: string };

export default function RevendedorClientes() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState<Client | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [selectedExt, setSelectedExt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) { setLoading(false); return; }
      setResellerId(r.id);
      const { data: cs } = await supabase
        .from("profiles").select("id,email,display_name,created_at")
        .eq("reseller_id", r.id).order("created_at", { ascending: false });
      setClients(cs ?? []);
      setLoading(false);
    })();
  }, [user]);

  const openConcede = async (c: Client) => {
    if (!resellerId) return;
    setOpen(c);
    setSelectedExt("");
    const { data } = await supabase
      .from("reseller_extensions")
      .select("extension_id, extensions(id,name)")
      .eq("reseller_id", resellerId);
    const list = (data ?? []).map((row: any) => row.extensions).filter(Boolean);
    setExtensions(list);
  };

  const concede = async () => {
    if (!open || !resellerId || !selectedExt) return;
    setSaving(true);
    const { error } = await supabase.from("client_extensions").insert({
      client_id: open.id, extension_id: selectedExt, reseller_id: resellerId, status: "active",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Extensão concedida");
    setOpen(null);
  };

  return (
    <div>
      <PageHeader
        title="Meus Clientes"
        description="Clientes que se cadastraram vinculados a você."
      />
      <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : clients.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum cliente vinculado ainda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Desde</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium">{c.display_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openConcede(c)}>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Conceder extensão
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Conceder extensão a {open?.display_name ?? open?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Extensão</Label>
              <Select value={selectedExt} onValueChange={setSelectedExt}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {extensions.length === 0
                    ? <div className="p-2 text-xs text-muted-foreground">Nenhuma extensão liberada para você. Peça ao gerente.</div>
                    : extensions.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(null)}>Cancelar</Button>
            <Button onClick={concede} disabled={saving || !selectedExt} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Conceder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
