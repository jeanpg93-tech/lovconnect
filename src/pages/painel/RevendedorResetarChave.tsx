import { useEffect, useState } from "react";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  RotateCcw,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  History as HistoryIcon,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type ResetLog = {
  id: string;
  license_key: string | null;
  license_id: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
};

export default function RevendedorResetarChave() {
  const { user } = useAuth();
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseId, setLicenseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    license_key?: string;
  } | null>(null);
  const [history, setHistory] = useState<ResetLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = async () => {
    if (!user?.id) return;
    setHistoryLoading(true);
    const { data } = await supabase
      .from("hwid_reset_logs")
      .select("id, license_key, license_id, success, error_message, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setHistory((data as ResetLog[]) ?? []);
    setHistoryLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, [user?.id]);

  const logReset = async (params: {
    license_key?: string;
    license_id?: string;
    success: boolean;
    error_message?: string | null;
  }) => {
    if (!user?.id) return;
    const { data: r } = await supabase
      .from("resellers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    await supabase.from("hwid_reset_logs").insert({
      user_id: user.id,
      reseller_id: r?.id ?? null,
      license_key: params.license_key ?? null,
      license_id: params.license_id ?? null,
      success: params.success,
      error_message: params.error_message ?? null,
    });
    loadHistory();
  };

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
          (error as any)?.message ||
            data?.error ||
            data?.provider_error ||
            "Erro ao resetar dispositivo"
        );
      }

      setResult({
        success: true,
        message: data?.message || "Dispositivo desvinculado com sucesso!",
        license_key: data?.license_key || key,
      });

      toast.success(data?.message || "Dispositivo resetado com sucesso!");
      await logReset({ license_key: key || undefined, license_id: id || undefined, success: true });
      setLicenseKey("");
      setLicenseId("");
    } catch (e: any) {
      toast.error(e.message);
      setResult({ success: false, message: e.message });
      await logReset({
        license_key: key || undefined,
        license_id: id || undefined,
        success: false,
        error_message: e.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <PageContainer>
      <PageHeader
        title={
          <h1 className="font-display text-4xl font-black tracking-tighter sm:text-5xl">
            Resetar <span className="text-primary italic">Chave</span>
          </h1>
        }
        description="Resete o dispositivo vinculado (HWID) de uma licença gerada por você. O cliente poderá usar em outro dispositivo."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form Card */}
        <Card className="border-white/10 bg-white/[0.03] p-6 sm:p-8 backdrop-blur-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Resetar HWID
              </h2>
              <p className="text-xs text-muted-foreground">Desvincula o dispositivo da chave</p>
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

        {/* Why Reset Card */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-6 sm:p-8 backdrop-blur-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Por que resetar a chave?
              </h2>
              <p className="text-xs text-muted-foreground">Quando usar essa função</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              Use esta função quando o cliente receber o erro:
            </p>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-amber-300 font-mono text-xs italic">
                "Essa chave está vinculada a outro dispositivo"
              </p>
            </div>
            <p>
              Cada licença fica atrelada ao primeiro dispositivo onde foi ativada (HWID). Ao resetar, esse vínculo é removido e o cliente pode ativar a chave em um <span className="text-foreground font-semibold">novo computador</span>.
            </p>
            <ul className="space-y-2 pt-1">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>Cliente formatou o PC ou trocou de máquina</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>Migração para outro navegador / perfil</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>Erro de identificação de hardware</span>
              </li>
            </ul>
          </div>
        </Card>
      </div>

      {/* History */}
      <Card className="border-white/10 bg-white/[0.03] p-6 sm:p-8 backdrop-blur-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <HistoryIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Histórico de Resets
            </h2>
            <p className="text-xs text-muted-foreground">
              Últimas chaves resetadas por você
            </p>
          </div>
        </div>

        {historyLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <HistoryIcon className="h-8 w-8 opacity-30" />
            <p className="text-sm">Nenhum reset realizado ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:bg-white/[0.04]"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    log.success
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {log.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-foreground truncate">
                    {log.license_key || log.license_id || "—"}
                  </p>
                  {!log.success && log.error_message && (
                    <p className="text-[11px] text-destructive truncate mt-0.5">
                      {log.error_message}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {formatDate(log.created_at)}
                  </p>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      log.success ? "text-emerald-400" : "text-destructive"
                    }`}
                  >
                    {log.success ? "Sucesso" : "Falhou"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
