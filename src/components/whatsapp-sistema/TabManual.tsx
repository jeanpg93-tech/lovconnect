import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send, Search, Users } from "lucide-react";
import { toast } from "sonner";

type Reseller = {
  id: string;
  display_name: string;
  is_active: boolean;
  whatsapp: string | null;
};

export default function TabManual() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("individual");

  // individual
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [msgInd, setMsgInd] = useState("");

  // bulk
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [msgBulk, setMsgBulk] = useState("");
  const [searchBulk, setSearchBulk] = useState("");
  const [filterActive, setFilterActive] = useState(true);

  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: rs } = await supabase
        .from("resellers")
        .select("id, display_name, is_active, user_id")
        .order("display_name");
      const ids = (rs ?? []).map((r: any) => r.user_id);
      const { data: profs } = await supabase
        .from("profiles").select("id, whatsapp").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p.whatsapp]));
      setResellers((rs ?? []).map((r: any) => ({
        id: r.id, display_name: r.display_name, is_active: r.is_active,
        whatsapp: map.get(r.user_id) ?? null,
      })));
      setLoading(false);
    })();
  }, []);

  const filteredInd = useMemo(() =>
    resellers.filter((r) => r.display_name?.toLowerCase().includes(search.toLowerCase())),
    [resellers, search]);

  const filteredBulk = useMemo(() =>
    resellers.filter((r) =>
      (!filterActive || r.is_active) &&
      r.display_name?.toLowerCase().includes(searchBulk.toLowerCase())
    ), [resellers, searchBulk, filterActive]);

  const sendIndividual = async () => {
    if (!selectedId) { toast.error("Selecione um revendedor"); return; }
    if (!msgInd.trim()) { toast.error("Digite a mensagem"); return; }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("system-whatsapp-notify", {
      body: { mode: "manual", reseller_ids: [selectedId], message: msgInd },
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    const res = (data as any)?.results?.[0];
    if (res?.ok) { toast.success("Mensagem enviada!"); setMsgInd(""); }
    else toast.error("Falha: " + (res?.skipped ?? "erro"));
  };

  const sendBulk = async () => {
    if (selectedIds.size === 0) { toast.error("Selecione ao menos um revendedor"); return; }
    if (!msgBulk.trim()) { toast.error("Digite a mensagem"); return; }
    if (selectedIds.size > 5 && !confirm(`Enviar para ${selectedIds.size} revendedores?`)) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("system-whatsapp-notify", {
      body: { mode: "manual", reseller_ids: Array.from(selectedIds), message: msgBulk },
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    const results = (data as any)?.results ?? [];
    const ok = results.filter((r: any) => r.ok).length;
    const fail = results.length - ok;
    toast.success(`${ok} enviadas${fail > 0 ? `, ${fail} falharam` : ""}`);
    setSelectedIds(new Set());
    setMsgBulk("");
  };

  const toggleSel = (id: string) => {
    setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAllVisible = () => {
    setSelectedIds((s) => { const n = new Set(s); filteredBulk.forEach((r) => r.whatsapp && n.add(r.id)); return n; });
  };
  const clearSel = () => setSelectedIds(new Set());

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle>Envio manual</CardTitle></CardHeader>
      <CardContent>
        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid grid-cols-2 w-full sm:w-auto">
            <TabsTrigger value="individual">Individual</TabsTrigger>
            <TabsTrigger value="bulk"><Users className="h-4 w-4 mr-1 hidden sm:inline" /> Em massa</TabsTrigger>
          </TabsList>

          <TabsContent value="individual" className="space-y-3 mt-4">
            <div>
              <Label>Buscar revendedor</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input className="pl-9" placeholder="Nome..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md">
              {filteredInd.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum revendedor encontrado</p>}
              {filteredInd.slice(0, 100).map((r) => (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-3 py-2 border-b last:border-0 hover:bg-muted text-sm flex items-center justify-between gap-2 ${selectedId === r.id ? "bg-muted" : ""}`}>
                  <span className="truncate">{r.display_name}</span>
                  {!r.whatsapp ? <Badge variant="outline" className="text-xs">Sem WhatsApp</Badge> : <Badge variant="secondary" className="text-xs">{r.whatsapp}</Badge>}
                </button>
              ))}
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea rows={5} value={msgInd} onChange={(e) => setMsgInd(e.target.value)} placeholder="Digite sua mensagem. Você pode usar {nome}." />
              <p className="text-xs text-muted-foreground mt-1">O rodapé automático será adicionado no final.</p>
            </div>
            <Button onClick={sendIndividual} disabled={sending || !selectedId}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar
            </Button>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-3 mt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={filterActive} onCheckedChange={(v) => setFilterActive(!!v)} />
                Apenas ativos
              </label>
              <Badge variant="secondary">{selectedIds.size} selecionados</Badge>
            </div>
            <div>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar..." value={searchBulk} onChange={(e) => setSearchBulk(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={selectAllVisible}>Selecionar visíveis ({filteredBulk.length})</Button>
              <Button size="sm" variant="ghost" onClick={clearSel}>Limpar</Button>
            </div>
            <div className="max-h-72 overflow-y-auto border rounded-md">
              {filteredBulk.slice(0, 200).map((r) => (
                <label key={r.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-0 hover:bg-muted/50 text-sm cursor-pointer">
                  <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => r.whatsapp && toggleSel(r.id)} disabled={!r.whatsapp} />
                  <span className="flex-1 truncate">{r.display_name}</span>
                  {!r.whatsapp ? <Badge variant="outline" className="text-xs">Sem WhatsApp</Badge> : null}
                </label>
              ))}
            </div>
            <div>
              <Label>Mensagem</Label>
              <Textarea rows={5} value={msgBulk} onChange={(e) => setMsgBulk(e.target.value)} placeholder="Digite. Use {nome} para personalizar." />
              <p className="text-xs text-muted-foreground mt-1">O rodapé automático será adicionado no final.</p>
            </div>
            <Button onClick={sendBulk} disabled={sending || selectedIds.size === 0}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar para {selectedIds.size}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}