import { useState } from "react";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RotateCcw, KeyRound, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

export default function GerenteResetarChave() {
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseId, setLicenseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    license_key?: string;
  } | null>(null);

  const handleReset = async () => {
    const key = licenseKey.trim();
    const id = licenseId.trim();

    if (!key && !id) {
      toast.error("Informe o license_key ou o license_id");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const body: Record<string, string> = {};
      if (key) body.license_key = key;
      if (id) body.license_id = id;

      const { data, error } = await invokeAuthenticatedFunction("provider-api?action=reset-hwid", {
        method: "POST",
        body,
      });

      if (error || data?.error || data?.provider_error) {
        throw new Error(
          (error as any)?.message || data?.error || data?.provider_error || "Erro ao resetar dispositivo"
        );
      }

      setResult({
        success: true,
        message: data?.message || "Dispositivo desvinculado com sucesso!",
        license_key: data?.license_key || key,
      });

      toast.success(data?.message || "Dispositivo resetado com sucesso!");
      setLicenseKey("");
      setLicenseId("");
    } catch (e: any) {
      toast.error(e.message);
      setResult({ success: false, message: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={
          <h1 className="font-display text-4xl font-black tracking-tighter sm:text-5xl">
            Resetar <span className="text-primary italic">Chave</span>
          </h1>
        }
        description="Resete o dispositivo vinculado (HWID) de uma licença para permitir que o cliente a use em outro dispositivo."
      />

      <Card className="max-w-xl border-white/10 bg-white/[0.03] p-6 sm:p-8 backdrop-blur-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Resetar HWID
            </h2>
            <p className="text-xs text-muted-foreground">
              POST /reset-hwid
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              license_key
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="QL-A1B2C3D4E5F6G7H8"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
                className="h-11 pl-10 bg-white/5 border-white/10 rounded-xl text-sm focus:bg-white/10"
                disabled={loading}
              />
            </div>
          </div>

          <div className="relative flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              ou
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              license_id
            </label>
            <Input
              placeholder="UUID da licença"
              value={licenseId}
              onChange={(e) => setLicenseId(e.target.value)}
              className="h-11 bg-white/5 border-white/10 rounded-xl text-sm focus:bg-white/10"
              disabled={loading}
            />
          </div>

          <Button
            onClick={handleReset}
            disabled={loading || (!licenseKey.trim() && !licenseId.trim())}
            className="w-full h-11 mt-2 gap-2 font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando…
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                Resetar Dispositivo
              </>
            )}
          </Button>
        </div>

        {result && (
          <div
            className={`mt-6 rounded-xl border p-4 ${
              result.success
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-destructive/30 bg-destructive/10"
            }`}
          >
            <div className="flex items-start gap-3">
              {result.success ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              )}
              <div>
                <p
                  className={`text-sm font-semibold ${
                    result.success ? "text-emerald-400" : "text-destructive"
                  }`}
                >
                  {result.success ? "Sucesso!" : "Erro"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{result.message}</p>
                {result.license_key && (
                  <p className="mt-2 font-mono text-xs text-primary bg-primary/10 rounded-lg px-2 py-1 inline-block">
                    {result.license_key}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-6 max-w-xl border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
          Informações da API
        </h3>
        <div className="space-y-2 text-xs text-muted-foreground font-mono">
          <p><span className="text-primary font-bold">POST</span> https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api/reset-hwid</p>
          <p>Headers: <span className="text-foreground">x-api-token</span>, <span className="text-foreground">Content-Type: application/json</span></p>
          <p>Body: {"{"} license_key | license_id {"}"}</p>
        </div>
      </Card>
    </PageContainer>
  );
}
