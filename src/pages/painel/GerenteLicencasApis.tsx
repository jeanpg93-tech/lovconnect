import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, Sparkles, BookOpen, Settings as SettingsIcon, ChevronDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import GerenteApiProvedor from "./GerenteApiProvedor";

type Method = "flow" | "lovax";
const METHOD_KEY = "licencas.delivery.method";

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

  const readActive = () => {
    const m = localStorage.getItem(METHOD_KEY) as Method | null;
    setActive(m === "lovax" ? "lovax" : "flow");
  };

  useEffect(() => {
    readActive();
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

  const setAsActive = (m: Method) => {
    localStorage.setItem(METHOD_KEY, m);
    setActive(m);
    toast.success(`Método ativo: ${m === "flow" ? "MétodoFlow" : "MétodoLovax"}`);
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
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {!isActive && (
                    <Button size="sm" variant="outline" onClick={() => setAsActive(m.id)}>
                      Tornar ativo
                    </Button>
                  )}
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
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setApiKey(localStorage.getItem("licencas.lovax.apiKey") ?? "");
    setBaseUrl(localStorage.getItem("licencas.lovax.baseUrl") ?? "https://api.metodolovax.com/v1");
  }, []);

  const save = () => {
    localStorage.setItem("licencas.lovax.apiKey", apiKey);
    localStorage.setItem("licencas.lovax.baseUrl", baseUrl);
    toast.success("Configurações do MétodoLovax salvas");
  };

  return (
    <Tabs defaultValue="docs" className="w-full">
      <TabsList>
        <TabsTrigger value="docs"><BookOpen className="mr-1.5 h-3.5 w-3.5" /> Documentação</TabsTrigger>
        <TabsTrigger value="settings"><SettingsIcon className="mr-1.5 h-3.5 w-3.5" /> Configurações</TabsTrigger>
      </TabsList>

      <TabsContent value="docs" className="mt-4 space-y-3">
        <div className="rounded-xl border border-border bg-card/60 p-4 text-sm">
          <h3 className="font-display text-base font-semibold">API Lovax</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Endpoints REST autenticados via header <code className="font-mono">x-lovax-key</code>. Quando o MétodoLovax estiver ativo na Dashboard,
            o sistema enviará todas as solicitações de licença para esta API.
          </p>
        </div>
        <Doc title="Base URL" body={`${baseUrl || "https://api.metodolovax.com/v1"}`} />
        <Doc
          title="POST /licenses — gerar licença"
          body={`curl -X POST ${baseUrl || "https://api.metodolovax.com/v1"}/licenses \\\n  -H "x-lovax-key: SUA_CHAVE" \\\n  -H "Content-Type: application/json" \\\n  -d '{"display_name":"Cliente","days":30}'`}
        />
        <Doc
          title="GET /licenses/:key — consultar"
          body={`curl ${baseUrl || "https://api.metodolovax.com/v1"}/licenses/ABC123 \\\n  -H "x-lovax-key: SUA_CHAVE"`}
        />
        <Doc
          title="POST /licenses/:key/revoke — revogar"
          body={`curl -X POST ${baseUrl || "https://api.metodolovax.com/v1"}/licenses/ABC123/revoke \\\n  -H "x-lovax-key: SUA_CHAVE"`}
        />
      </TabsContent>

      <TabsContent value="settings" className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="lvx_seu_token"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.metodolovax.com/v1"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <Button onClick={save}>Salvar configurações</Button>
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
