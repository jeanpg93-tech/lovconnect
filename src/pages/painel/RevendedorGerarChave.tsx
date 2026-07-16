import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { useTranslation } from "react-i18next";
import PackLowBalanceBanner from "@/components/painel/PackLowBalanceBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Loader2, Copy, Sparkles, CheckCircle2, Clock, Calendar,
  Infinity as InfinityIcon, Zap, KeyRound, Gift, Send, MessageCircle,
  Package, CheckCheck, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { useMaintenanceGuard } from "@/hooks/useMaintenanceGuard";

type TypeDef = {
  key: "trial" | "1d" | "7d" | "30d" | "lifetime";
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeClass?: string;
  gradient: string;
};

const TYPES: TypeDef[] = [
  { key: "trial", label: "Teste", short: "15 minutos", icon: Gift, badge: "Grátis", badgeClass: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent" },
  { key: "1d", label: "1 Dia", short: "24 horas", icon: Clock, gradient: "from-sky-500/20 via-sky-500/5 to-transparent" },
  { key: "7d", label: "7 Dias", short: "1 semana", icon: Calendar, gradient: "from-blue-500/20 via-blue-500/5 to-transparent" },
  { key: "30d", label: "30 Dias", short: "Mensal", icon: Zap, badge: "Popular", badgeClass: "bg-primary/15 text-primary border-primary/30", gradient: "from-primary/25 via-primary/5 to-transparent" },
  { key: "lifetime", label: "Vitalícia", short: "Sem expirar", icon: InfinityIcon, badge: "Top", badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30", gradient: "from-amber-500/25 via-amber-500/5 to-transparent" },
];

export default function RevendedorGerarChave() {
  const { t } = useTranslation();
  const { isSubscription, isPack, packCredits } = useRole();
  const [activeMethod, setActiveMethod] = useState<"flow" | "lovax" | null>(null);
  const [genType, setGenType] = useState<TypeDef["key"]>("30d");
  const [genName, setGenName] = useState("");
  const [genWhatsapp, setGenWhatsapp] = useState("");
  const maint = useMaintenanceGuard();
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<
    { key: string; type: TypeDef["key"]; name: string; whatsapp: string } | null
  >(null);
  const [packStats, setPackStats] = useState<{ credits: number; purchased: number; consumed: number } | null>(null);

  const loadPackStats = async () => {
    if (!isPack) return;
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const { data: r } = await supabase
      .from("resellers")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();
    if (!r?.id) return;
    const { data: bal } = await supabase
      .from("reseller_pack_balances" as any)
      .select("credits, lifetime_purchased, lifetime_consumed")
      .eq("reseller_id", r.id)
      .maybeSingle();
    setPackStats({
      credits: Number((bal as any)?.credits ?? 0),
      purchased: Number((bal as any)?.lifetime_purchased ?? 0),
      consumed: Number((bal as any)?.lifetime_consumed ?? 0),
    });
  };

  useEffect(() => {
    loadPackStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPack]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "licencas.delivery.method")
        .maybeSingle();
      const v = (data?.value as any)?.method;
      setActiveMethod(v === "lovax" ? "lovax" : "flow");
    })();
  }, []);

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

  const generate = async () => {
    if (maint.blocked()) return;
    const isTrial = genType === "trial";
    const name = genName.trim();
    const whatsappDigits = genWhatsapp.replace(/\D+/g, "");
    if (!isTrial) {
      if (name.length < 2) return toast.error("Informe o nome de exibição da chave");
      if (whatsappDigits.length < 10 || whatsappDigits.length > 13) {
        return toast.error("Informe um WhatsApp válido (com DDD)");
      }
    }
    setGenerating(true);
    setLastGenerated(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        isPack ? "pack-generate-key" : "subscription-generate-key",
        {
        body: {
          type: genType,
          display_name: isTrial ? undefined : name,
          whatsapp: isTrial ? undefined : whatsappDigits,
        },
      });
      if (error) {
        // Quando a edge function responde com status não-2xx, o supabase-js
        // expõe o corpo da resposta em error.context (um Response). Lemos pra
        // mostrar o motivo real (ex.: "Sem créditos no pacote") em vez do
        // genérico "Edge Function returned a non-2xx status code".
        let realMsg: string | null = null;
        try {
          const ctx: any = (error as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            realMsg = body?.error ?? body?.message ?? null;
          } else if (ctx && typeof ctx.text === "function") {
            realMsg = await ctx.text();
          }
        } catch { /* ignore */ }
        throw new Error(realMsg || error.message);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const key = (data as any)?.license_key;
      if (!key) throw new Error("Resposta sem chave de licença");
      setLastGenerated({ key, type: genType, name, whatsapp: whatsappDigits });
      toast.success(isTrial ? "Chave teste gerada" : "Chave gerada com sucesso");
      setGenName("");
      setGenWhatsapp("");
      if (isPack) loadPackStats();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar chave");
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
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Chave enviada no WhatsApp");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar WhatsApp");
    } finally {
      setSending(false);
    }
  };

  const selected = TYPES.find((t) => t.key === genType) ?? TYPES[0];

  return (
    <PageContainer>
      <PageHeader
        title={t("generateKey.title")}
        description={t("generateKey.subtitle")}
      />
      <PackLowBalanceBanner />

      {isPack && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
                <CheckCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Usadas</div>
                <div className="font-display text-2xl font-bold">{packStats?.consumed ?? "—"}</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-500">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Restantes</div>
                <div className="font-display text-2xl font-bold text-emerald-500">{packStats?.credits ?? packCredits}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="mt-6 relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card/80 to-card/40 p-5 sm:p-6 backdrop-blur-sm">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-3 sm:gap-4">
          <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg sm:text-xl font-semibold">Nova chave em segundos</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Método de entrega ativo:{" "}
              <strong className="text-foreground">
                {activeMethod === "lovax" ? "LovaX" : activeMethod === "flow" ? "PromptFlow" : "carregando..."}
              </strong>
              .{" "}
              {isPack
                ? `Modo Pack: cada chave consome 1 licença. Restam: ${packCredits}.`
                : "Como mensalista, suas chaves não consomem saldo."}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        {/* Form */}
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">1</span>
            <h3 className="font-display text-sm font-semibold">Escolha o tipo</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
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
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                      active ? "bg-primary/20 text-primary" : "bg-background/70 text-muted-foreground group-hover:text-foreground"
                    )}>
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
                Chave teste de 15 minutos — não requer nome nem WhatsApp.
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Nome do cliente</Label>
                  <Input
                    value={genName}
                    onChange={(e) => setGenName(e.target.value)}
                    placeholder="Ex.: Cliente João"
                    maxLength={100}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Identifica essa chave na sua lista.
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
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Inclua o DDD. Será usado para enviar a chave pelo WhatsApp.
                  </p>
                </div>
              </>
            )}

            <Button
              onClick={generate}
              disabled={generating || !activeMethod || maint.disabled}
              title={maint.tooltip}
              size="lg"
              className="relative overflow-hidden bg-gradient-to-r from-primary to-primary/80 text-primary-foreground transition-all hover:shadow-lg hover:shadow-primary/25"
            >
              {generating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando...</>
              ) : maint.disabled ? (
                <>Emissões pausadas</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Gerar chave {selected.label}</>
              )}
            </Button>
          </div>
        </div>

        {/* Result panel */}
        <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-6 backdrop-blur-sm">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Resultado</h3>
          </div>

          {lastGenerated ? (
            <div className="animate-fade-in">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-semibold">
                  Chave {TYPES.find((t) => t.key === lastGenerated.type)?.label} criada
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
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                    Enviar no WhatsApp
                  </Button>
                )}
                <Button onClick={() => copy(lastGenerated.key)} variant="outline" className="w-full">
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
                As chaves geradas aparecem aqui prontas para copiar.
              </p>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}