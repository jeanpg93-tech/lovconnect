import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Copy, CheckCircle2, QrCode, KeyRound, Sparkles, ArrowLeft, Zap } from "lucide-react";
import { toast } from "sonner";
import { alphaHex, normalizeHexColor, storefrontThemeVars } from "@/lib/storefrontTheme";

type PlanCode = "pro_30d" | "5x_7d" | "5x_30d" | "20x_30d";

// ID da conta de testes (revendedor Jean Gomes / jeanpg.93).
// Só nesse revendedor o botão "Liberar PIX (teste)" aparece.
const TEST_RESELLER_ID = "68fddcfb-5e1f-492c-be75-9a8a3d2a63fa";

const PLANS: { code: PlanCode; label: string; desc: string }[] = [
  { code: "pro_30d", label: "Pro — 30 dias", desc: "500K tokens · 30 dias" },
  { code: "5x_30d", label: "5x — 30 dias", desc: "2,5M tokens · 30 dias" },
  { code: "20x_30d", label: "20x — 30 dias", desc: "10M tokens · 30 dias" },
];

type Reseller = {
  id: string;
  slug: string;
  display_name: string;
  store_name?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  background_color?: string | null;
  claude_enabled: boolean;
};

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CheckoutClaude() {
  const { slug = "" } = useParams();
  const [sp] = useSearchParams();
  const initialPlan = (sp.get("plan") as PlanCode) || "5x_30d";

  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [plan, setPlan] = useState<PlanCode>(initialPlan);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [document_, setDocument] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [pix, setPix] = useState<{
    order_id: string;
    qr_code_base64: string | null;
    copy_paste: string | null;
    generated_password: string | null;
    sale_price_cents: number;
  } | null>(null);
  const [status, setStatus] = useState<string>("awaiting_payment");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const projectRef = (import.meta as any).env.VITE_SUPABASE_PROJECT_ID;
        const resp = await fetch(`https://${projectRef}.supabase.co/functions/v1/claude-public-prices?slug=${encodeURIComponent(slug)}`);
        const j = await resp.json();
        if (cancel) return;
        if (!resp.ok || !j?.ok) {
          setNotFound(true);
        } else {
          setReseller({ ...j.reseller, claude_enabled: true });
          setPrices(j.prices ?? {});
        }
      } catch {
        if (!cancel) setNotFound(true);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [slug]);

  // Polling status
  useEffect(() => {
    if (!pix?.order_id || status === "issued") return;
    const projectRef = (import.meta as any).env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectRef}.supabase.co/functions/v1/claude-public-order-status?order_id=${pix.order_id}`;
    const t = setInterval(async () => {
      try {
        const r = await fetch(url);
        const j = await r.json();
        if (j?.status) setStatus(j.status);
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [pix?.order_id, status]);

  const currentPrice = prices[plan];

  const submit = async () => {
    if (!reseller) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("claude-public-checkout", {
        body: {
          reseller_slug: slug,
          plan_code: plan,
          name,
          email,
          whatsapp,
          payer_document: document_,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setPix(data as any);
      setStatus("awaiting_payment");
      toast.success("PIX gerado! Pague para receber sua chave.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar PIX");
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copiado!");
  };

  const [releasing, setReleasing] = useState(false);
  const releaseTestPix = async () => {
    if (!pix?.order_id) return;
    setReleasing(true);
    try {
      const { data, error } = await supabase.functions.invoke("dev-release-pix", {
        body: { kind: "claude", id: pix.order_id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("PIX liberado (teste)!");
      setStatus("issued");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao liberar PIX");
    } finally {
      setReleasing(false);
    }
  };

  const isTestReseller = reseller?.id === TEST_RESELLER_ID;

  const runTestFlow = async () => {
    if (!reseller) return;
    setSubmitting(true);
    try {
      const testName = name || "Teste Jean";
      const testEmail = email || `teste+${Date.now()}@jeanpg.dev`;
      const testWhats = whatsapp || "(11) 99999-0000";
      setName(testName); setEmail(testEmail); setWhatsapp(testWhats);
      const { data, error } = await supabase.functions.invoke("claude-public-checkout", {
        body: {
          reseller_slug: slug,
          plan_code: plan,
          name: testName,
          email: testEmail,
          whatsapp: testWhats,
          payer_document: document_,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const pixData = data as any;
      setPix(pixData);
      setStatus("awaiting_payment");
      // Libera imediatamente
      const { data: rel, error: relErr } = await supabase.functions.invoke("dev-release-pix", {
        body: { kind: "claude", id: pixData.order_id },
      });
      if (relErr) throw relErr;
      if ((rel as any)?.error) throw new Error((rel as any).error);
      setStatus("issued");
      toast.success("PIX gerado e liberado (teste)!");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no fluxo de teste");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (notFound || !reseller) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <h1 className="text-2xl font-bold">Loja não encontrada</h1>
        <p className="text-muted-foreground">Este link de checkout não está disponível.</p>
      </div>
    );
  }

  const accent = normalizeHexColor(reseller.primary_color);
  const bg = reseller.background_color || "#050505";
  const title = reseller.store_name || reseller.display_name;
  const rootStyle = {
    ...storefrontThemeVars(accent),
    background: bg,
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden py-10 px-4"
      style={rootStyle}
    >
      {/* Halos de fundo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-24 -left-24 w-[28rem] h-[28rem] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{ background: accent, animationDuration: "6s" }}
        />
        <div
          className="absolute top-1/2 -right-24 w-80 h-80 rounded-full blur-[100px] opacity-20 animate-pulse"
          style={{ background: accent, animationDuration: "8s" }}
        />
      </div>

      <div className="relative max-w-2xl mx-auto space-y-6">
        <div>
          <Link
            to={`/loja/${slug}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Voltar para a loja
          </Link>
        </div>

        <header className="flex flex-col items-center text-center gap-3">
          {reseller.logo_url ? (
            <div
              className="h-16 w-16 rounded-2xl border overflow-hidden bg-card/80 backdrop-blur flex items-center justify-center"
              style={{ borderColor: `${accent}50`, boxShadow: `0 10px 40px -10px ${accent}66` }}
            >
              <img src={reseller.logo_url} alt={title} className="h-full w-full object-contain" />
            </div>
          ) : null}
          <div
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
            style={{ background: `${accent}12`, borderColor: `${accent}33`, color: accent }}
          >
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                style={{ background: accent }}
              />
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: accent }}
              />
            </span>
            <Sparkles className="h-3 w-3" /> Claude API
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">{title}</h1>
          {reseller.tagline ? (
            <p className="text-sm text-muted-foreground">{reseller.tagline}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Compre seu plano Claude e receba a chave na hora após o PIX.
          </p>
        </header>

        {status === "issued" ? (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <CardTitle>Chave emitida!</CardTitle>
              <CardDescription>Acesse o portal do cliente para ver sua chave e o consumo de tokens.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pix?.generated_password && (
                <div className="rounded-lg border p-4 space-y-2" style={{ borderColor: alphaHex(accent, 0.32), background: alphaHex(accent, 0.06) }}>
                  <p className="text-sm font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4" /> Suas credenciais de acesso</p>
                  <div className="text-sm space-y-1">
                    <div><span className="text-muted-foreground">Email:</span> <strong>{email}</strong></div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Senha:</span>
                      <code className="bg-background px-2 py-0.5 rounded border">{pix.generated_password}</code>
                      <Button size="sm" variant="ghost" onClick={() => copy(pix.generated_password!)}><Copy className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Anote essa senha — ela não aparecerá novamente.</p>
                </div>
              )}
              <Button asChild className="w-full" size="lg" style={{ background: accent, color: "#fff" }}>
                <Link to={`/cliente-claude/login?loja=${encodeURIComponent(slug)}${email ? `&email=${encodeURIComponent(email)}` : ""}`}>
                  Acessar portal do cliente
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : pix ? (
          <Card>
            <CardHeader className="text-center">
              <QrCode className="h-8 w-8 mx-auto" style={{ color: accent }} />
              <CardTitle>Pague com PIX</CardTitle>
              <CardDescription>Valor: <strong>{brl(pix.sale_price_cents)}</strong></CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pix.qr_code_base64 && (
                <div className="flex justify-center">
                  <img
                    src={pix.qr_code_base64.startsWith("data:") ? pix.qr_code_base64 : `data:image/png;base64,${pix.qr_code_base64}`}
                    alt="QR Code PIX"
                    className="w-56 h-56 rounded-lg border"
                  />
                </div>
              )}
              {pix.copy_paste && (
                <div className="space-y-2">
                  <Label>PIX copia-e-cola</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={pix.copy_paste} className="font-mono text-xs" />
                    <Button variant="outline" onClick={() => copy(pix.copy_paste!)}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Aguardando confirmação do pagamento…
              </div>
              {isTestReseller && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-dashed"
                  onClick={releaseTestPix}
                  disabled={releasing}
                >
                  {releasing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                  Liberar PIX (conta de testes)
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div
            className="relative rounded-3xl border p-6 sm:p-8 backdrop-blur-2xl animate-fade-in"
            style={{
              background: "rgba(23, 23, 23, 0.4)",
              borderColor: "rgba(255,255,255,0.06)",
              boxShadow: `0 0 60px -20px ${accent}40, inset 0 1px 0 rgba(255,255,255,0.03)`,
            }}
          >
            <h2 className="text-xl font-semibold text-foreground mb-6">Escolha seu plano</h2>

            <div className="space-y-3 mb-8">
              {PLANS.filter((p) => prices[p.code] !== undefined).map((p) => {
                const isSel = plan === p.code;
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setPlan(p.code)}
                    className="w-full text-left relative flex items-center justify-between p-5 rounded-2xl border transition-all hover:scale-[1.01] active:scale-[0.99] group"
                    style={
                      isSel
                        ? {
                            borderColor: `${accent}80`,
                            background: `${accent}0d`,
                            boxShadow: `0 0 24px -6px ${accent}66, inset 0 0 0 1px ${accent}30`,
                          }
                        : {
                            borderColor: "rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.03)",
                          }
                    }
                  >
                    <div className="flex flex-col">
                      <span className="text-foreground font-bold text-base sm:text-lg">{p.label}</span>
                      <span className="text-xs text-muted-foreground">{p.desc}</span>
                    </div>
                    <div
                      className="text-lg sm:text-xl font-bold tracking-tight tabular-nums"
                      style={{ color: isSel ? accent : "hsl(var(--foreground) / 0.85)" }}
                    >
                      {brl(prices[p.code])}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Nome completo <span style={{ color: accent }}>*</span>
                  </Label>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:outline-none transition-all"
                    style={{ boxShadow: "none" }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${accent}80`;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}22`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    E-mail <span style={{ color: accent }}>*</span>
                  </Label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:outline-none transition-all"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = `${accent}80`;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}22`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">WhatsApp</Label>
                  <input
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="(11) 90000-0000"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-white/30 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CPF (opcional)</Label>
                  <input
                    value={document_}
                    onChange={(e) => setDocument(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-white/30 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 space-y-3">
              <button
                type="button"
                disabled={submitting || !name || !email || !currentPrice}
                onClick={submit}
                className="w-full relative overflow-hidden group py-4 px-6 rounded-2xl text-white font-bold text-base sm:text-lg transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-3"
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                  boxShadow: `0 10px 30px -8px ${accent}80, 0 0 0 1px ${accent}40 inset`,
                }}
              >
                <span
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
                  }}
                />
                {submitting ? <Loader2 className="h-5 w-5 animate-spin relative" /> : <Zap className="h-5 w-5 relative" />}
                <span className="relative">
                  Gerar PIX de {currentPrice ? brl(currentPrice) : "—"}
                </span>
              </button>

              {isTestReseller && (
                <button
                  type="button"
                  onClick={runTestFlow}
                  disabled={submitting || !currentPrice}
                  className="w-full py-3 px-6 rounded-2xl border border-white/10 bg-white/5 text-muted-foreground font-medium text-sm hover:bg-white/10 hover:text-foreground transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" style={{ color: accent }} />}
                  Gerar + <span style={{ color: accent }}>Liberar</span> PIX (conta de testes)
                </button>
              )}
            </div>

            <p className="mt-6 text-center text-muted-foreground text-[11px] leading-relaxed max-w-[80%] mx-auto">
              Após o pagamento, sua chave é emitida automaticamente e enviada para o portal do cliente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}