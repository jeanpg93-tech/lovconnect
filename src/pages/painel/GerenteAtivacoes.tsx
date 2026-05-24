import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Check, X, FileText, ExternalLink, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/painel/PageHeader";

interface Row {
  id: string;
  reseller_id: string;
  amount_cents: number;
  status: string;
  proof_url: string | null;
  proof_note: string | null;
  created_at: string;
  reviewer_note: string | null;
  reseller?: { display_name: string; user_id: string };
}

export default function GerenteAtivacoes() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [proofSignedUrl, setProofSignedUrl] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("activation_payments")
      .select("id, reseller_id, amount_cents, status, proof_url, proof_note, created_at, reviewer_note, resellers!inner(display_name, user_id)")
      .in("status", ["under_review", "pending", "rejected"])
      .order("created_at", { ascending: false });
    setRows(((data ?? []) as any).map((r: any) => ({ ...r, reseller: r.resellers })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openReview = async (r: Row, act: "approve" | "reject") => {
    setSelected(r);
    setAction(act);
    setNote("");
    setProofSignedUrl(null);
    if (r.proof_url) {
      const { data } = await supabase.storage.from("activation-proofs").createSignedUrl(r.proof_url, 600);
      setProofSignedUrl(data?.signedUrl ?? null);
    }
  };

  const submit = async () => {
    if (!selected || !action) return;
    if (action === "reject" && !note.trim()) {
      toast.error("Informe o motivo da recusa");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("activation-review", {
      body: { payment_id: selected.id, action, note: note || null },
    });
    setBusy(false);
    if (error || data?.error) { toast.error(error?.message ?? data?.error); return; }
    toast.success(action === "approve" ? "Painel ativado" : "Comprovante recusado");
    setSelected(null);
    setAction(null);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Ativações de Painel" subtitle="Aprove ou recuse pagamentos enviados por revendedores." />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{rows.length} registro(s)</span>
        <Button size="sm" variant="outline" onClick={load}><RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> atualizar</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border/50 bg-card/40 p-10 text-center text-sm text-muted-foreground">Nenhuma ativação pendente.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/50">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Revendedor</th>
                <th className="px-4 py-2 text-left">Valor</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Enviado</th>
                <th className="px-4 py-2 text-left">Comprovante</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/30">
                  <td className="px-4 py-2 font-medium">{r.reseller?.display_name ?? r.reseller_id.slice(0, 8)}</td>
                  <td className="px-4 py-2">R$ {(r.amount_cents / 100).toFixed(2)}</td>
                  <td className="px-4 py-2"><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">{r.status}</span></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-2">{r.proof_url ? <FileText className="h-4 w-4 text-primary" /> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openReview(r, "approve")}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => openReview(r, "reject")}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setAction(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "approve" ? "Aprovar ativação" : "Recusar comprovante"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div><strong>{selected.reseller?.display_name}</strong> — R$ {(selected.amount_cents / 100).toFixed(2)}</div>
              {selected.proof_note && <div className="rounded-lg border border-border/50 bg-muted/20 p-2 text-xs"><strong>Obs do revendedor:</strong> {selected.proof_note}</div>}
              {proofSignedUrl && (
                <a href={proofSignedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" /> ver comprovante
                </a>
              )}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={action === "reject" ? "Motivo da recusa (obrigatório)" : "Observação (opcional)"}
                className="w-full rounded-lg border border-border bg-background p-2 text-sm"
                rows={3}
                maxLength={500}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>cancelar</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {action === "approve" ? "aprovar e ativar" : "recusar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}