import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Copy,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Infinity as InfinityIcon,
  Zap,
  KeyRound,
  Gift,
  Send,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type LicenseDef = {
  key: string;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeClass?: string;
  gradient: string;
};

const LICENSE_TYPES: LicenseDef[] = [
  {
    key: "trial",
    label: "Teste",
    short: "15 minutos",
    icon: Gift,
    badge: "Grátis",
    badgeClass: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  {
    key: "pro_1d",
    label: "1 Dia",
    short: "24 horas",
    icon: Clock,
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
  },
  {
    key: "pro_7d",
    label: "7 Dias",
    short: "1 semana",
    icon: Calendar,
    gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
  },
  {
    key: "pro_15d",
    label: "15 Dias",
    short: "Quinzena",
    icon: Calendar,
    gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
  },
  {
    key: "pro_30d",
    label: "30 Dias",
    short: "Mensal",
    icon: Zap,
    badge: "Popular",
    badgeClass: "bg-primary/15 text-primary border-primary/30",
    gradient: "from-primary/25 via-primary/5 to-transparent",
  },
  {
    key: "lifetime",
    label: "Vitalícia",
    short: "Sem expirar",
    icon: InfinityIcon,
    badge: "Top",
    badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    gradient: "from-amber-500/25 via-amber-500/5 to-transparent",
  },
];

const LOVAX_LICENSE_TYPES: LicenseDef[] = [
  {
    key: "trial",
    label: "Teste",
    short: "15 minutos",
    icon: Gift,
    badge: "Grátis",
    badgeClass: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  { key: "pro_1d", label: "1 Dia", short: "24 horas", icon: Clock, gradient: "from-sky-500/20 via-sky-500/5 to-transparent" },
  { key: "pro_7d", label: "7 Dias", short: "1 semana", icon: Calendar, gradient: "from-blue-500/20 via-blue-500/5 to-transparent" },
  { key: "pro_30d", label: "30 Dias", short: "Mensal", icon: Zap, badge: "Popular", badgeClass: "bg-primary/15 text-primary border-primary/30", gradient: "from-primary/25 via-primary/5 to-transparent" },
  { key: "pro_90d", label: "90 Dias", short: "Trimestral", icon: Calendar, gradient: "from-violet-500/20 via-violet-500/5 to-transparent" },
  { key: "pro_365d", label: "365 Dias", short: "Anual", icon: Calendar, gradient: "from-indigo-500/20 via-indigo-500/5 to-transparent" },
  {
    key: "lifetime",
    label: "Vitalícia",
    short: "Sem expirar",
    icon: InfinityIcon,
    badge: "Top",
    badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    gradient: "from-amber-500/25 via-amber-500/5 to-transparent",
  },
];

const LOVAX_DAYS: Record<string, number> = {
  pro_1d: 1,
  pro_7d: 7,
  pro_30d: 30,
  pro_90d: 90,
  pro_365d: 365,
  lifetime: 36500,
};

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  [...LICENSE_TYPES, ...LOVAX_LICENSE_TYPES].map((t) => [t.key, t.label])
);

export default function GerenteGeracaoManual() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [method, setMethod] = useState<"promptflow" | "lovax">("promptflow");
  const [genType, setGenType] = useState<string>("pro_30d");
  const [genName, setGenName] = useState("");
  const [genWhatsapp, setGenWhatsapp] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<
    { key: string; type: string; name: string; whatsapp: string } | null
  >(null);

  const call = async (action: string, opts?: { method?: "GET" | "POST"; body?: any }) => {
    const fn = method === "lovax" ? "lovax-api" : "provider-api";
    const { data, error } = await supabase.functions.invoke(`${fn}?action=${action}`, {
      method: opts?.method ?? "GET",
      body: opts?.body,
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  useEffect(() => {
    // Reset selection when switching method to avoid invalid types
    setGenType("pro_30d");
  }, [method]);

  useEffect(() => {
    (async () => {
      try {
        const s = await call("get-settings");
        setConfigured(!!s?.configured);
      } catch {
        setConfigured(false);
      }
    })();
  }, [method]);

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Chave copiada");
  };

  const formatWhatsapp = (v: string) => {
    const d = v.replace(/\D+/g, "").slice(0, 13);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  };

  const generateLicense = async () => {
    if (!genType) return toast.error("Selecione o tipo de licença");
    const isTrial = genType === "trial";
    const name = genName.trim();
    const whatsappDigits = genWhatsapp.replace(/\D+/g, "");
    if (!isTrial) {
      if (name.length < 2) return toast.error("Informe o nome de exibição da licença");
      if (whatsappDigits.length < 10 || whatsappDigits.length > 13) {
        return toast.error("Informe um WhatsApp válido (com DDD)");
      }
    }
    setGenerating(true);
    setLastGenerated(null);
    try {
      const body: Record<string, unknown> = {};
      if (!isTrial) {
        body.display_name = name.slice(0, 100);
        body.whatsapp = whatsappDigits;
      }
      if (method === "lovax") {
        // lovax-api expects days/minutes, not type
        if (isTrial) {
          body.minutes = 15;
        } else {
          body.days = LOVAX_DAYS[genType] ?? 30;
        }
      } else if (!isTrial) {
        body.type = genType;
      }
      const res = await call(isTrial ? "generate-trial" : "generate", { method: "POST", body });
      const key = res?.license_key ?? res?.key ?? res?.data?.license_key;
      if (!key) throw new Error("Resposta sem chave de licença");
      setLastGenerated({ key, type: genType, name, whatsapp: whatsappDigits });
      toast.success(isTrial ? "Licença teste gerada (grátis)" : "Licença gerada com sucesso");
      setGenName("");
      setGenWhatsapp("");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar licença");
    } finally {
      setGenerating(false);
    }
  };

  const sendWhatsapp = async () => {
    if (!lastGenerated) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-license-whatsapp", {
        body: {
          license_key: lastGenerated.key,
          display_name: lastGenerated.name,
          license_type: lastGenerated.type,
          whatsapp: lastGenerated.whatsapp,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success("Licença enviada no WhatsApp");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar WhatsApp");
    } finally {
      setSending(false);
    }
  };

  const TYPES = method === "lovax" ? LOVAX_LICENSE_TYPES : LICENSE_TYPES;
  const selected = TYPES.find((t) => t.key === genType) ?? TYPES[0];

  return (
    <PageContainer>
      <PageHeader
        title="Geração Manual"
        description="Crie chaves de extensão na hora — direto pelo provedor"
      />

      <Tabs value={method} onValueChange={(v) => setMethod(v as "promptflow" | "lovax")} className="mt-6">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="promptflow" className="gap-2">
            <Zap className="h-4 w-4" /> Método - PromptFlow
          </TabsTrigger>
          <TabsTrigger value="lovax" className="gap-2">
            <Sparkles className="h-4 w-4" /> Método - LovaX
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Hero */}
      <div className="mt-6 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card/80 to-card/40 p-6 backdrop-blur-sm">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold">
              Nova licença em segundos · {method === "lovax" ? "LovaX" : "PromptFlow"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gerando pelo método <strong>{method === "lovax" ? "LovaX" : "PromptFlow"}</strong>. Escolha o tipo, dê um nome e a chave aparece pronta para copiar.
            </p>
          </div>
        </div>
      </div>

      {configured === false ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-muted-foreground animate-fade-in">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <span>
            Configure a API key em <strong>Zona de risco → API do Provedor → Configurações</strong> antes de gerar licenças.
          </span>
        </div>
      ) : configured === null ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          {/* Form */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">1</span>
              <h3 className="font-display text-sm font-semibold">Escolha o tipo</h3>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TYPES.map((t) => {
                const Icon = t.icon;
                const active = genType === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setGenType(t.key)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200",
                      "hover:-translate-y-0.5 hover:shadow-lg",
                      active
                        ? "border-primary/60 bg-primary/5 shadow-md ring-1 ring-primary/40"
                        : "border-border bg-background/40 hover:border-border/80"
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity",
                        t.gradient,
                        active ? "opacity-100" : "opacity-40 group-hover:opacity-70"
                      )}
                    />
                    <div className="relative flex items-start justify-between">
                      <div
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                          active ? "bg-primary/20 text-primary" : "bg-background/70 text-muted-foreground group-hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      {t.badge && (
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", t.badgeClass)}>
                          {t.badge}
                        </span>
                      )}
                    </div>
                    <div className="relative mt-3">
                      <div className="font-display text-sm font-semibold">{t.label}</div>
                      <div className="text-[11px] text-muted-foreground">{t.short}</div>
                    </div>
                    {active && (
                      <CheckCircle2 className="absolute bottom-2 right-2 h-4 w-4 text-primary animate-scale-in" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">2</span>
              <h3 className="font-display text-sm font-semibold">Detalhes</h3>
            </div>

            <div className="grid gap-4">
              {genType === "trial" ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
                  Licença teste de 15 minutos — não requer nome nem WhatsApp.
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Nome de exibição</Label>
                    <Input
                      value={genName}
                      onChange={(e) => setGenName(e.target.value)}
                      placeholder="Ex.: Cliente João"
                      maxLength={100}
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Será enviado ao provedor e gravado na licença.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>WhatsApp do cliente</Label>
                    <div className="relative">
                      <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={genWhatsapp}
                        onChange={(e) => setGenWhatsapp(formatWhatsapp(e.target.value))}
                        placeholder="(11) 91234-5678"
                        inputMode="tel"
                        className="pl-9"
                        required
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Inclua DDD. Será usado para enviar a chave pelo WhatsApp.
                    </p>
                  </div>
                </>
              )}

              <Button
                onClick={generateLicense}
                disabled={generating}
                size="lg"
                className="relative overflow-hidden bg-gradient-to-r from-primary to-primary/80 text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Gerar licença {selected.label}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Result panel */}
          <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold">Resultado</h3>
            </div>

            {lastGenerated ? (
              <div className="animate-fade-in">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-semibold">
                    Licença {TYPE_LABEL[lastGenerated.type] ?? lastGenerated.type} criada
                  </span>
                </div>

                <div className="mt-4">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Chave de licença
                  </Label>
                  <div className="mt-1.5 group relative rounded-xl border border-border bg-background/70 p-3 transition-colors hover:border-primary/40">
                    <code className="block break-all pr-10 font-mono text-xs leading-relaxed">
                      {lastGenerated.key}
                    </code>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copy(lastGenerated.key)}
                      className="absolute right-2 top-2 h-7 w-7"
                      title="Copiar"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  {lastGenerated.whatsapp && (
                    <Button
                      onClick={sendWhatsapp}
                      disabled={sending}
                      className="w-full bg-emerald-500 text-white hover:bg-emerald-500/90"
                    >
                      {sending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-3.5 w-3.5" />
                      )}
                      Enviar licença no WhatsApp
                    </Button>
                  )}
                  <Button
                    onClick={() => copy(lastGenerated.key)}
                    variant="outline"
                    className="w-full"
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" /> Copiar chave
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/30 px-4 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <KeyRound className="h-5 w-5 text-primary/70" />
                </div>
                <p className="mt-3 text-sm font-medium">Nenhuma chave ainda</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  As licenças geradas aparecem aqui prontas para copiar.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
