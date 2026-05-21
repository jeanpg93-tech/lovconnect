import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  AlertTriangle,
  Copy,
  CheckCircle2,
  Plug,
  CreditCard,
  XCircle,
  ChevronDown,
  ChevronRight,
  Save,
} from "lucide-react";
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

export default function GerenteGateway() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const supaUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const webhookUrl = `${supaUrl}/functions/v1/misticpay-webhook`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      // O gerente usa as configurações globais (secrets do sistema)
      // Mas podemos permitir que ele visualize/sobrescreva se necessário via UI
      // Para o gerente, vamos buscar do nosso novo endpoint ou de uma tabela de config global se existir
      try {
        const { data, error } = await supabase.functions.invoke("provider-api?action=get-gateway-config", {
          method: "GET",
        });
        
        if (!error && data) {
          setClientId(data.client_id || "");
          setClientSecret(data.client_secret || "");
        }
      } catch (e) {
        console.error("Erro ao carregar config do gateway", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("provider-api?action=save-gateway-config", {
        method: "POST",
        body: { client_id: clientId, client_secret: clientSecret },
      });
      if (error) throw error;
      toast.success("Configurações do gateway salvas com sucesso");
    } catch (error: any) {
      toast.error(error.message || "Falha ao salvar configurações");
    } finally {
      setSaving(false);
    }
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
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Gateway de pagamento"
        description="Configure o MisticPay usado para processar pagamentos globais do sistema."
      />

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="space-y-1">
          <div className="font-medium text-amber-600 dark:text-amber-400">Configuração Global</div>
          <p className="text-muted-foreground">
            Estas credenciais são usadas pelo sistema para todas as transações que não possuem um gateway próprio configurado.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <CreditCard className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">MisticPay (PIX)</h3>
            <p className="text-xs text-muted-foreground">Gateway principal do sistema.</p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>CI (Client ID)</Label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Cole o Client ID da conta principal"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CS (Client Secret)</Label>
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>

        <div className="mt-6 space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">URL de webhook</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-xs">
              {webhookUrl}
            </code>
            <Button size="sm" variant="ghost" onClick={copy}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Configure esta URL no painel da MisticPay para receber notificações de pagamento.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            onClick={test}
            variant="outline"
            size="sm"
            disabled={testing || !clientId || !clientSecret}
          >
            {testing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plug className="mr-1.5 h-3.5 w-3.5" />
            )}
            Testar conexão
          </Button>
          <Button
            onClick={save}
            disabled={saving || !clientId || !clientSecret}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </section>

      <Dialog
        open={!!testResult && !testResult.ok}
        onOpenChange={(v) => {
          if (!v) {
            setTestResult(null);
            setShowDetails(false);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <XCircle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center">Falha na conexão com MisticPay</DialogTitle>
            <DialogDescription className="text-center">
              {testResult?.status ? (
                <>
                  A API respondeu com <span className="font-mono font-semibold">status {testResult.status}</span>.
                </>
              ) : (
                "Não foi possível estabelecer comunicação com o gateway."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {testResult?.message && <p className="rounded-md border bg-muted/50 p-3">{testResult.message}</p>}

            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                O que verificar
              </div>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>As credenciais CI e CS estão corretas e sem espaços.</li>
                <li>A conta possui permissão de acesso via API.</li>
                <li>O ambiente da conta é compatível com as credenciais fornecidas.</li>
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
                          GET {a.path} →{" "}
                          <span className={a.status === 0 ? "text-destructive" : ""}>
                            {a.status || "erro de rede"}
                          </span>
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
            <Button
              onClick={() => {
                setTestResult(null);
                test();
              }}
              disabled={testing}
            >
              {testing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="mr-1.5 h-3.5 w-3.5" />
              )}
              Tentar novamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
