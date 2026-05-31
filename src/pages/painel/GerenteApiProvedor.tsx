import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Badge } from "@/components/ui/badge";
import {
  Wallet, Activity, KeyRound, Loader2, Copy, RefreshCw,
  Settings, Save, Trash2, AlertCircle, BookOpen, Infinity as InfinityIcon,
} from "lucide-react";
import { toast } from "sonner";

function DocBlock({ title, body }: { title: string; body: string }) {
  const onCopy = () => {
    navigator.clipboard.writeText(body);
    toast.success("Copiado");
  };
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 px-2 text-xs">
          <Copy className="mr-1 h-3 w-3" /> Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">
{body}
      </pre>
    </div>
  );
}

// Resposta do novo provedor: { used, max, remaining, allow_lifetime }
type Status = {
  used?: number;
  max?: number;
  remaining?: number;
  allow_lifetime?: boolean;
  error?: string;
};

type Usage = {
  license_type: string;
  license_key: string;
  status: string;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  trial: "Teste 15min (grátis)",
  active: "Licença normal",
  lifetime: "Vitalícia",
  pro_1d: "1 Dia",
  pro_7d: "7 Dias",
  pro_15d: "15 Dias",
  pro_30d: "30 Dias",
};

type Settings = {
  configured: boolean;
  base_url?: string;
  webhook_url?: string | null;
  api_key_masked?: string;
  updated_at?: string;
};

export default function GerenteApiProvedor() {
  const [status, setStatus] = useState<Status | null>(null);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);



  // settings
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [webhookInput, setWebhookInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);


  const call = async (action: string, opts?: { method?: "GET" | "POST"; body?: any }) => {
    const { data, error } = await supabase.functions.invoke(`provider-api?action=${action}`, {
      method: opts?.method ?? "GET",
      body: opts?.body,
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const loadSettings = async () => {
    try {
      const s: Settings = await call("get-settings");
      setSettings(s);
      if (s.base_url) setBaseUrlInput(s.base_url);
      if (s.webhook_url) setWebhookInput(s.webhook_url);
      return s;
    } catch (e: any) {
      console.error(e);
      return null;
    }
  };

  const loadAll = async () => {
    setRefreshing(true);
    try {
      const s = await loadSettings();
      if (!s?.configured) {
        setStatus(null);
        setUsage([]);
        return;
      }
      const [st, u] = await Promise.all([call("status"), call("usage")]);
      setStatus(st);
      setUsage(u?.usage ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar API");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const saveSettings = async () => {
    if (!apiKeyInput.trim() && !settings?.configured) {
      toast.error("Informe a API key");
      return;
    }
    setSavingSettings(true);
    try {
      await call("save-settings", {
        method: "POST",
        body: {
          api_key: apiKeyInput.trim() || undefined,
          base_url: baseUrlInput.trim() || undefined,
          webhook_url: webhookInput.trim() || undefined,
        },
      });
      toast.success("Configurações salvas");
      setApiKeyInput("");
      await loadAll();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSavingSettings(false);
    }
  };

  const removeSettings = async () => {
    if (!confirm("Remover credenciais salvas?")) return;
    try {
      await call("delete-settings", { method: "POST" });
      toast.success("Credenciais removidas");
      setSettings({ configured: false });
      setStatus(null);
      setUsage([]);
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    }
  };



  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="API Método"
        description={
          settings?.configured
            ? "Provedor de licenças (chamada direta)"
            : "Configure a API token do provedor para começar"
        }
        actions={
          <Button variant="outline" size="sm" onClick={loadAll} disabled={refreshing}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Licenças usadas"
          value={status?.used ?? "—"}
          icon={Activity}
        />
        <StatCard
          label="Limite"
          value={status?.max ?? "—"}
          icon={Wallet}
        />
        <StatCard
          label="Restantes"
          value={status?.remaining ?? "—"}
          hint="Saldo disponível"
          icon={KeyRound}
        />
        <StatCard
          label="Vitalícias"
          value={status?.allow_lifetime ? "Liberado" : "Bloqueado"}
          hint={status?.allow_lifetime ? "allow_lifetime=true" : "Sem permissão"}
          icon={InfinityIcon}
        />
      </div>

      {settings && !settings.configured && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
          <div>
            <div className="font-medium text-amber-600 dark:text-amber-400">Provedor não configurado</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Vá até a aba <strong>Configurações</strong> e cole sua API key do provedor para começar.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue={settings?.configured ? "usage" : "settings"} className="mt-8">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="usage">Histórico</TabsTrigger>
          <TabsTrigger value="docs"><BookOpen className="mr-1.5 h-3.5 w-3.5" /> Documentação</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="mr-1.5 h-3.5 w-3.5" /> Configurações</TabsTrigger>
        </TabsList>
        <TabsContent value="usage" className="mt-4">
          <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
            {usage.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma licença gerada ainda.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">Chave</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                      <td className="px-4 py-3">{TYPE_LABEL[u.license_type] ?? u.license_type}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs">{u.license_key}</code>
                          <Button size="sm" variant="ghost" onClick={() => copy(u.license_key)} className="h-6 w-6 p-0">
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={u.status === "success" ? "default" : "destructive"} className="capitalize">
                          {u.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {new Date(u.created_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* DOCUMENTAÇÃO */}
        <TabsContent value="docs" className="mt-4">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur-sm">
              <h3 className="font-display text-base font-semibold">API de Revenda (novo provedor)</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Todos os endpoints são <code className="font-mono">POST</code>. Autenticação via header
                <code className="font-mono"> x-api-token</code>. Quando o saldo (max - used) chega a 0, nenhuma licença
                pode ser gerada.
              </p>
            </div>

            <DocBlock
              title="Base URL e autenticação"
              body={`# URL\nhttps://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api\n\n# Header obrigatório em TODAS as chamadas\nx-api-token: rsl_seu_token_aqui`}
            />

            <DocBlock
              title="POST /status — saldo (used / max / remaining / allow_lifetime)"
              body={`curl -X POST https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api/status \\\n  -H "x-api-token: rsl_seu_token_aqui"`}
            />

            <DocBlock
              title="POST /generate-trial — licença teste (15 min, não consome)"
              body={`curl -X POST https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api/generate-trial \\\n  -H "x-api-token: rsl_seu_token_aqui" \\\n  -H "Content-Type: application/json" \\\n  -d '{"display_name":"Cliente Teste","minutes":15,"seconds":0}'`}
            />

            <DocBlock
              title="POST /generate-license — licença normal ou vitalícia (consome 1)"
              body={`# Normal\ncurl -X POST https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api/generate-license \\\n  -H "x-api-token: rsl_seu_token_aqui" \\\n  -H "Content-Type: application/json" \\\n  -d '{"display_name":"João Silva","days":30}'\n\n# Vitalícia (requer allow_lifetime=true)\n  -d '{"display_name":"Cliente VIP","lifetime":true}'`}
            />

            <DocBlock
              title="POST /list-licenses — lista paginada"
              body={`curl -X POST https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api/list-licenses \\\n  -H "x-api-token: rsl_seu_token_aqui" \\\n  -H "Content-Type: application/json" \\\n  -d '{"status":"all","page":1,"per_page":50}'`}
            />

            <DocBlock
              title="POST /reset-hwid · /revoke-license · /delete-license"
              body={`curl -X POST https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api/reset-hwid \\\n  -H "x-api-token: rsl_seu_token_aqui" \\\n  -H "Content-Type: application/json" \\\n  -d '{"license_key":"QL-A1B2C3D4E5F6G7H8"}'`}
            />

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
              <strong className="text-amber-600 dark:text-amber-400">Importante:</strong> nunca exponha
              sua <code className="font-mono">x-api-token</code> no frontend. Licenças geradas pelo provedor anterior
              ficam marcadas como <strong>legado</strong> e não podem mais ser resetadas/revogadas/excluídas por aqui.
            </div>
          </div>
        </TabsContent>

        {/* CONFIGURAÇÕES */}
        <TabsContent value="settings" className="mt-4">
          <div className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur-sm">
            <h3 className="font-display text-base font-semibold">Credenciais do provedor</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sua API key é armazenada de forma segura no backend e nunca exposta no navegador.
            </p>

            {settings?.configured && (
              <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono uppercase tracking-wider text-muted-foreground">Chave atual</div>
                    <div className="mt-1 font-mono">{settings.api_key_masked}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={removeSettings}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                  </Button>
                </div>
                {settings.updated_at && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Atualizada em {new Date(settings.updated_at).toLocaleString("pt-BR")}
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 grid gap-4">
              <div className="space-y-1.5">
                <Label>API Key {settings?.configured && <span className="text-xs text-muted-foreground">(deixe em branco para manter)</span>}</Label>
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="rsl_seu_token_aqui"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Base URL <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                <Input
                  value={baseUrlInput}
                  onChange={(e) => setBaseUrlInput(e.target.value)}
                  placeholder="https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/reseller-api"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Webhook URL <span className="text-xs text-muted-foreground">(opcional)</span></Label>
                <Input
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                  placeholder="https://seu-dominio.com/webhook"
                />
              </div>
            </div>

            <Button
              onClick={saveSettings}
              disabled={savingSettings}
              className="mt-5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-1.5 h-4 w-4" /> Salvar configurações</>}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
