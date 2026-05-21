import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Copy, CheckCircle2, Plug, CreditCard, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type TestResult = {
  ok: boolean;
  status?: number;
  reason?: string;
  message?: string;
  probed?: string;
  details?: unknown;
  attempts?: Array<{ path: string; status: number; body: unknown }>;
};

export default function RevendedorIntegracaoMisticPay() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const webhookUrl = `${supaUrl}/functions/v1/misticpay-webhook`;

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      const { data: r } = await supabase
        .from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) { setLoading(false); return; }
      setResellerId(r.id);
      const { data: row } = await supabase
        .from("reseller_integrations")
        .select("misticpay_enabled, misticpay_client_id, misticpay_client_secret")
        .eq("reseller_id", r.id).maybeSingle();
      if (row) {
        setEnabled(!!row.misticpay_enabled);
        setClientId(row.misticpay_client_id ?? "");
        setClientSecret(row.misticpay_client_secret ?? "");
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!resellerId) return;
    setSaving(true);
    const { error } = await supabase.from("reseller_integrations").upsert({
      reseller_id: resellerId,
      misticpay_enabled: enabled,
      misticpay_client_id: clientId,
      misticpay_client_secret: clientSecret,
    }, { onConflict: "reseller_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("MisticPay salvo");
  };

  const test = async () => {
    setTesting(true);
    const { data: res, error } = await supabase.functions.invoke("test-misticpay-connection", {
      body: { client_id: clientId, client_secret: clientSecret },
    });
    setTesting(false);
    if (error) {
      setTestResult({ ok: false, message: error.message });
      return;
    }
    const r = res as TestResult;
    setTestResult(r);
    if (r?.ok) toast.success("MisticPay: conexão OK");
  };

  const copy = async () => {
    await navigator.clipboard.writeText(webhookUrl).catch(() => {});
    toast.success("Webhook copiado");
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="MisticPay" description="Configure seu próprio gateway PIX." />

      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <div className="font-medium text-destructive">Zona de risco</div>
          <p className="text-muted-foreground">Se ativar, suas recargas passarão a usar sua conta MisticPay.</p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">MisticPay (PIX)</h3>
              <p className="text-xs text-muted-foreground">Receba recargas direto na sua conta.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="mp-enabled" className="text-xs text-muted-foreground">Ativo</Label>
            <Switch id="mp-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>CI (Client ID)</Label>
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Cole o CI da sua conta" />
          </div>
          <div className="space-y-1.5">
            <Label>CS (Client Secret)</Label>
            <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="••••••••" />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL de webhook</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-xs">{webhookUrl}</code>
            <Button size="sm" variant="ghost" onClick={copy}><Copy className="h-3.5 w-3.5" /></Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Cole esta URL no painel MisticPay como "Project Webhook".</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={test} variant="outline" size="sm" disabled={testing || !clientId || !clientSecret}>
            {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plug className="mr-1.5 h-3.5 w-3.5" />}
            Testar conexão
          </Button>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-background/80 px-4 py-3 backdrop-blur">
        <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
          Salvar
        </Button>
      </div>

      <Dialog open={!!testResult && !testResult.ok} onOpenChange={(v) => { if (!v) { setTestResult(null); setShowDetails(false); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">
              Não foi possível conectar à MisticPay
            </DialogTitle>
            <DialogDescription className="text-center">
              {testResult?.status ? (
                <>A API respondeu com <span className="font-mono font-semibold">status {testResult.status}</span>.</>
              ) : (
                "A chamada à API falhou."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {testResult?.message && (
              <p className="rounded-md border bg-muted/50 p-3">{testResult.message}</p>
            )}

            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                O que verificar
              </div>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>O <span className="font-medium text-foreground">CI</span> e o <span className="font-medium text-foreground">CS</span> foram copiados sem espaços extras.</li>
                <li>As credenciais pertencem ao ambiente de <span className="font-medium text-foreground">produção</span> da MisticPay.</li>
                <li>Sua conta tem o <span className="font-medium text-foreground">acesso à API habilitado</span> (KYC aprovado).</li>
                <li>Sua conta MisticPay está <span className="font-medium text-foreground">ativa</span> e sem bloqueios.</li>
              </ul>
            </div>

            {testResult?.attempts && testResult.attempts.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-2 text-xs">
                <button
                  type="button"
                  onClick={() => setShowDetails((v) => !v)}
                  className="flex w-full items-center gap-1 text-left font-medium hover:opacity-80"
                >
                  {showDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Detalhes técnicos
                </button>
                {showDetails && (
                  <div className="mt-2 space-y-2">
                    {testResult.attempts.map((a, i) => (
                      <div key={i} className="rounded bg-background/60 p-2">
                        <div className="font-mono text-[11px] break-all">
                          GET {a.path} → <span className={a.status === 0 ? "text-destructive" : ""}>{a.status || "network error"}</span>
                        </div>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">
{typeof a.body === "string" ? a.body : JSON.stringify(a.body, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-center">
            <Button variant="outline" onClick={() => setTestResult(null)}>
              Fechar
            </Button>
            <Button onClick={() => { setTestResult(null); test(); }} disabled={testing}>
              {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plug className="mr-1.5 h-3.5 w-3.5" />}
              Testar novamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
