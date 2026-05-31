import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Sparkles, BookOpen, Settings as SettingsIcon, ChevronDown, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import GerenteApiProvedor from "./GerenteApiProvedor";

type Method = "flow" | "lovax";
const METHOD_KEY = "licencas.delivery.method";
const SETTING_KEY = "licencas.delivery.method";

const METHODS = [
  {
    id: "flow" as Method,
    label: "MétodoFlow",
    desc: "Fluxo padrão otimizado — provedor principal de licenças.",
    icon: Zap,
    color: "from-blue-500/20 to-cyan-500/10",
    ring: "border-blue-500/40",
    docsUrl: "https://docs.metodoflow.com",
  },
  {
    id: "lovax" as Method,
    label: "MétodoLovax",
    desc: "Fluxo alternativo Lovax — provedor secundário.",
    icon: Sparkles,
    color: "from-violet-500/20 to-fuchsia-500/10",
    ring: "border-violet-500/40",
    docsUrl: "https://docs.metodolovax.com",
  },
];

export default function GerenteLicencasApis() {
  const [active, setActive] = useState<Method>("flow");
  const [open, setOpen] = useState<Method | null>(null);
  const [conn, setConn] = useState<Record<Method, "checking" | "connected" | "disconnected">>({
    flow: "checking",
    lovax: "checking",
  });

  const readActive = () => {
    const m = localStorage.getItem(METHOD_KEY) as Method | null;
    setActive(m === "lovax" ? "lovax" : "flow");
  };

  useEffect(() => {
    readActive();
    // Sincroniza com configuração compartilhada do banco
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle();
      const v = (data?.value as any)?.method;
      if (v === "flow" || v === "lovax") {
        setActive(v);
        localStorage.setItem(METHOD_KEY, v);
      }
    })();
    const onStorage = (e: StorageEvent) => {
      if (e.key === METHOD_KEY) readActive();
    };
    window.addEventListener("storage", onStorage);
    const interval = setInterval(readActive, 1500);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkFlow = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("provider-api?action=get-settings", { method: "GET" });
        if (cancelled) return;
        if (error || !data?.configured) {
          setConn((c) => ({ ...c, flow: "disconnected" }));
          return;
        }
        const { data: st, error: stErr } = await supabase.functions.invoke("provider-api?action=status", { method: "GET" });
        if (cancelled) return;
        setConn((c) => ({ ...c, flow: !stErr && st && !st.error ? "connected" : "disconnected" }));
      } catch {
        if (!cancelled) setConn((c) => ({ ...c, flow: "disconnected" }));
      }
    };

    const checkLovax = () => {
      (async () => {
        try {
          const { data, error } = await supabase.functions.invoke("lovax-api?action=get-settings", { method: "GET" });
          if (cancelled) return;
          if (error || !data?.configured) { setConn((c) => ({ ...c, lovax: "disconnected" })); return; }
          const { data: st, error: stErr } = await supabase.functions.invoke("lovax-api?action=status", { method: "GET" });
          if (cancelled) return;
          const okStatus = !stErr && st && !st.error && !st.provider_error;
          setConn((c) => ({ ...c, lovax: okStatus ? "connected" : "disconnected" }));
        } catch { if (!cancelled) setConn((c) => ({ ...c, lovax: "disconnected" })); }
      })();
    };

    const run = () => { checkFlow(); checkLovax(); };
    run();
    const id = setInterval(run, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const setAsActive = (m: Method) => {
    localStorage.setItem(METHOD_KEY, m);
    setActive(m);
    (async () => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: SETTING_KEY, value: { method: m } as any }, { onConflict: "key" });
      if (error) toast.error(`Falha ao salvar: ${error.message}`);
      else toast.success(`Método ativo: ${m === "flow" ? "MétodoFlow" : "MétodoLovax"}`);
    })();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Método ativo atualmente: <span className="text-primary">{active === "flow" ? "MétodoFlow" : "MétodoLovax"}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Toda licença gerada usará a API do método ativo. Você pode alternar pela Dashboard ou pelos botões abaixo.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {METHODS.map((m) => {
          const isActive = active === m.id;
          const isOpen = open === m.id;
          const Icon = m.icon;
          return (
            <Card
              key={m.id}
              className={cn(
                "overflow-hidden transition-all bg-gradient-to-br",
                m.color,
                isActive ? `${m.ring} shadow-[0_0_24px_-8px_hsl(var(--primary)/0.4)]` : "border-border"
              )}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl border",
                    isActive ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      {m.label}
                      {isActive && (
                        <Badge className="h-5 bg-primary text-primary-foreground text-[9px] uppercase tracking-wider">
                          Ativo
                        </Badge>
                      )}
                      <ConnBadge state={conn[m.id]} />
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={isOpen ? "default" : "secondary"}
                    onClick={() => setOpen(isOpen ? null : m.id)}
                  >
                    <SettingsIcon className="mr-1.5 h-3.5 w-3.5" />
                    {isOpen ? "Fechar" : "Abrir API e documentação"}
                    <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                  </Button>
                  <a href={m.docsUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost">
                      <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                      Docs externos
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {open && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {open === "flow" ? <Zap className="h-4 w-4 text-primary" /> : <Sparkles className="h-4 w-4 text-primary" />}
              Configuração — {open === "flow" ? "MétodoFlow" : "MétodoLovax"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {open === "flow" ? (
              <GerenteApiProvedor />
            ) : (
              <LovaxConfig />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LovaxConfig() {
  const DEFAULT_BASE = "https://wogunbzijppmeuleitjq.supabase.co/functions/v1/reseller-api";
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE);
  const [settings, setSettings] = useState<{ configured: boolean; api_key_masked?: string; base_url?: string; updated_at?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [usage, setUsage] = useState<any[]>([]);

  const call = async (action: string, opts?: { method?: "GET" | "POST"; body?: any }) => {
    const { data, error } = await supabase.functions.invoke(`lovax-api?action=${action}`, {
      method: opts?.method ?? "GET",
      body: opts?.body,
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const loadAll = async () => {
    try {
      const s = await call("get-settings");
      setSettings(s);
      if (s?.base_url) setBaseUrl(s.base_url);
      if (s?.configured) {
        try { setStatus(await call("status")); } catch { setStatus(null); }
        try { const u = await call("usage"); setUsage(u?.usage ?? []); } catch { setUsage([]); }
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao carregar");
    }
  };

  useEffect(() => { loadAll(); }, []);

  const save = async () => {
    if (!apiKey.trim() && !settings?.configured) { toast.error("Informe o token"); return; }
    setSaving(true);
    try {
      await call("save-settings", {
        method: "POST",
        body: { api_key: apiKey.trim() || undefined, base_url: baseUrl.trim() || undefined },
      });
      toast.success("Configurações do MétodoLovax salvas");
      setApiKey("");
      await loadAll();
    } catch (e: any) { toast.error(e.message ?? "Falha ao salvar"); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm("Remover credenciais do MétodoLovax?")) return;
    try {
      await call("delete-settings", { method: "POST" });
      toast.success("Credenciais removidas");
      setSettings({ configured: false });
      setStatus(null);
      setUsage([]);
    } catch (e: any) { toast.error(e.message ?? "Erro"); }
  };

  const testConn = async () => {
    setTesting(true);
    try {
      const st = await call("status");
      if (st?.provider_error) throw new Error(st.provider_error);
      setStatus(st);
      toast.success("Conexão OK");
    } catch (e: any) { toast.error(e.message ?? "Falhou"); }
    finally { setTesting(false); }
  };

  const base = baseUrl || DEFAULT_BASE;

  return (
    <Tabs defaultValue="docs" className="w-full">
      <TabsList>
        <TabsTrigger value="docs"><BookOpen className="mr-1.5 h-3.5 w-3.5" /> Documentação</TabsTrigger>
        <TabsTrigger value="settings"><SettingsIcon className="mr-1.5 h-3.5 w-3.5" /> Configurações</TabsTrigger>
        <TabsTrigger value="usage">Histórico</TabsTrigger>
      </TabsList>

      <TabsContent value="docs" className="mt-4 space-y-3">
        <div className="rounded-xl border border-border bg-card/60 p-4 text-sm">
          <h3 className="font-display text-base font-semibold">API TS Community (MétodoLovax)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Todas as chamadas são <code className="font-mono">POST</code> para o mesmo endpoint, variando o campo <code className="font-mono">action</code> no body.
            Autenticação via header <code className="font-mono">Authorization: Bearer SEU_TOKEN</code> (ou <code className="font-mono">x-api-key</code>).
            Quando o MétodoLovax estiver ativo na Dashboard, o sistema envia todas as solicitações de licença para esta API.
          </p>
        </div>
        <Doc title="Base URL + headers" body={`# URL\n${base}\n\n# Headers\nAuthorization: Bearer SEU_TOKEN\nContent-Type: application/json\n# Alternativa: x-api-key: SEU_TOKEN`} />
        <Doc title="action: balance — saldo / estoque" body={`curl -X POST ${base} \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"balance","payload":{}}'`} />
        <Doc title="action: list_licenses — listar (limit/offset)" body={`curl -X POST ${base} \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"list_licenses","payload":{"limit":50,"offset":0}}'`} />
        <Doc title="action: generate_license — gerar licença paga" body={`curl -X POST ${base} \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"generate_license","payload":{"customer_name":"Cliente","email":"cliente@email.com","days":30,"hours":0,"minutes":0,"max_devices":1}}'`} />
        <Doc title="action: generate_trial — gerar trial (15 min)" body={`curl -X POST ${base} \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"generate_trial","payload":{"customer_name":"Cliente Trial","email":"cliente@email.com","minutes":15,"max_devices":1}}'`} />
        <Doc title="action: reset_hwid — resetar dispositivo" body={`curl -X POST ${base} \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"reset_hwid","payload":{"license_key":"TS-..."}}'`} />
        <Doc title="action: delete_license — deletar" body={`curl -X POST ${base} \\\n  -H "Authorization: Bearer SEU_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"action":"delete_license","payload":{"license_key":"TS-..."}}'`} />
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground">
          <strong className="text-amber-600 dark:text-amber-400">Importante:</strong> nunca exponha seu token no frontend.
          O <code className="font-mono">reseller_id</code> é detectado automaticamente pelo token — nunca envie manualmente.
        </div>
      </TabsContent>

      <TabsContent value="settings" className="mt-4 space-y-4">
        {settings?.configured && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono uppercase tracking-wider text-muted-foreground">Token atual</div>
                <div className="mt-1 font-mono">{settings.api_key_masked}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={testConn} disabled={testing}>
                  {testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  Testar conexão
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>Remover</Button>
              </div>
            </div>
            {settings.updated_at && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Atualizada em {new Date(settings.updated_at).toLocaleString("pt-BR")}
              </div>
            )}
            {status && !status.provider_error && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded border border-border bg-background/40 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">Restantes</div>
                  <div className="font-bold">{status.remaining ?? "—"}</div>
                </div>
                <div className="rounded border border-border bg-background/40 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">Usadas</div>
                  <div className="font-bold">{status.used ?? "—"}</div>
                </div>
                <div className="rounded border border-border bg-background/40 p-2">
                  <div className="text-[10px] text-muted-foreground uppercase">Total</div>
                  <div className="font-bold">{status.total_licenses ?? status.max ?? "—"}</div>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Token de API {settings?.configured && <span className="text-xs text-muted-foreground">(deixe em branco para manter)</span>}</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="tlc_seu_token_aqui"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Gere em <code className="font-mono">painel TS Community → /dashboard/api → Meus Tokens → Criar Token</code>.
          </p>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Base URL <span className="text-xs text-muted-foreground">(opcional)</span></label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={DEFAULT_BASE}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Salvar configurações
        </Button>
      </TabsContent>

      <TabsContent value="usage" className="mt-4">
        <div className="rounded-xl border border-border bg-card/60">
          {usage.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {settings?.configured ? "Nenhuma licença encontrada ainda." : "Configure o token para ver o histórico."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Chave</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Expira</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u: any, i: number) => (
                  <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-secondary/30">
                    <td className="px-4 py-3 capitalize">{u.license_type}</td>
                    <td className="px-4 py-3"><code className="font-mono text-xs">{u.license_key}</code></td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={u.status === "active" ? "default" : "secondary"} className="capitalize">{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {u.expires_at ? new Date(u.expires_at).toLocaleString("pt-BR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}

function Doc({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            navigator.clipboard.writeText(body);
            toast.success("Copiado");
          }}
        >
          Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">{body}</pre>
    </div>
  );
}

function ConnBadge({ state }: { state: "checking" | "connected" | "disconnected" }) {
  if (state === "checking") {
    return (
      <Badge variant="outline" className="h-5 gap-1 text-[9px] uppercase tracking-wider">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Verificando
      </Badge>
    );
  }
  if (state === "connected") {
    return (
      <Badge className="h-5 gap-1 border-emerald-500/40 bg-emerald-500/15 text-emerald-500 text-[9px] uppercase tracking-wider hover:bg-emerald-500/15">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Conectado
      </Badge>
    );
  }
  return (
    <Badge className="h-5 gap-1 border-rose-500/40 bg-rose-500/15 text-rose-500 text-[9px] uppercase tracking-wider hover:bg-rose-500/15">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
      Desconectado
    </Badge>
  );
}
