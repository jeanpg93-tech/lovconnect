import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, RotateCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  kind: string;
  event_key: string | null;
  reseller_id: string | null;
  to_number: string;
  message: string;
  status: string;
  error_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
};

const PAGE = 30;

const STATUS_BADGE: Record<string, { v: any; label: string }> = {
  queued: { v: "outline", label: "Na fila" },
  sent: { v: "secondary", label: "Enviado" },
  delivered: { v: "default", label: "Entregue" },
  read: { v: "default", label: "Lido" },
  error: { v: "destructive", label: "Erro" },
};

function fmtBRT(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function TabHistorico() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [resending, setResending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("system_whatsapp_log").select("*").order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (kindFilter !== "all") q = q.eq("kind", kindFilter);
    if (search.trim()) q = q.ilike("to_number", `%${search.replace(/\D/g, "")}%`);
    const { data } = await q;
    setRows((data ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, statusFilter, kindFilter]);

  const resend = async (row: Row) => {
    setResending(row.id);
    // strip footer (last paragraph) for clean re-send; notify will re-append
    const cleaned = row.message.replace(/\n\n_?Esta é uma mensagem automática.*$/s, "").trim();
    const { error } = await supabase.functions.invoke("system-whatsapp-notify", {
      body: row.reseller_id
        ? { mode: "manual", reseller_ids: [row.reseller_id], message: cleaned }
        : { mode: "manual", raw_number: row.to_number, message: cleaned },
    });
    setResending(null);
    if (error) toast.error(error.message); else { toast.success("Reenviada"); load(); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span>Histórico</span>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <Select value={statusFilter} onValueChange={(v) => { setPage(0); setStatusFilter(v); }}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="queued">Na fila</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
              <SelectItem value="delivered">Entregue</SelectItem>
              <SelectItem value="read">Lido</SelectItem>
              <SelectItem value="error">Erro</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={(v) => { setPage(0); setKindFilter(v); }}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="auto">Automática</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="test">Teste</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input placeholder="Buscar número..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setPage(0), load())} />
            <Button variant="outline" size="icon" onClick={() => { setPage(0); load(); }}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center p-6">Nenhuma mensagem encontrada.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const badge = STATUS_BADGE[r.status] ?? { v: "outline", label: r.status };
              const isOpen = expanded === r.id;
              return (
                <div key={r.id} className="border rounded-md p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={badge.v}>{badge.label}</Badge>
                      <Badge variant="outline" className="text-xs">{r.kind === "auto" ? r.event_key ?? "auto" : r.kind}</Badge>
                      <span className="text-muted-foreground text-xs">{r.to_number}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{fmtBRT(r.created_at)}</span>
                  </div>
                  {r.error_reason && (
                    <div className="mt-2 flex items-start gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span className="break-words">{r.error_reason}</span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(isOpen ? null : r.id)}>
                      {isOpen ? "Ocultar" : "Ver mensagem"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={resending === r.id} onClick={() => resend(r)}>
                      {resending === r.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RotateCw className="h-3 w-3 mr-1" />}
                      Reenviar
                    </Button>
                    {r.sent_at && <span className="text-xs text-muted-foreground">Enviado: {fmtBRT(r.sent_at)}</span>}
                    {r.delivered_at && <span className="text-xs text-muted-foreground">• Entregue: {fmtBRT(r.delivered_at)}</span>}
                    {r.read_at && <span className="text-xs text-muted-foreground">• Lido: {fmtBRT(r.read_at)}</span>}
                  </div>
                  {isOpen && (
                    <pre className="mt-2 p-2 bg-muted rounded text-xs whitespace-pre-wrap break-words">{r.message}</pre>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
          <span className="text-xs text-muted-foreground">Página {page + 1}</span>
          <Button size="sm" variant="outline" disabled={rows.length < PAGE} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      </CardContent>
    </Card>
  );
}