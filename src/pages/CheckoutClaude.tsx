import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Copy, CheckCircle2, QrCode, KeyRound, Sparkles } from "lucide-react";
import { toast } from "sonner";

type PlanCode = "pro_30d" | "5x_7d" | "5x_30d" | "20x_30d";

const PLANS: { code: PlanCode; label: string; desc: string }[] = [
  { code: "pro_30d", label: "Pro — 30 dias", desc: "1 chave · 500K tokens · 30 dias" },
  { code: "5x_30d", label: "5x — 30 dias", desc: "5 chaves · 2,5M tokens · 30 dias" },
  { code: "20x_30d", label: "20x — 30 dias", desc: "20 chaves · 10M tokens · 30 dias" },
];

type Reseller = { id: string; slug: string; display_name: string; claude_enabled: boolean };

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

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-primary bg-primary/10 rounded-full px-3 py-1">
            <Sparkles className="h-3 w-3" /> Claude API
          </div>
          <h1 className="text-2xl font-bold">{reseller.display_name}</h1>
          <p className="text-sm text-muted-foreground">Compre seu plano Claude e receba a chave na hora após o PIX.</p>
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
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
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
              <Button asChild className="w-full" size="lg">
                <Link to="/cliente-claude/login">Acessar portal do cliente</Link>
              </Button>
            </CardContent>
          </Card>
        ) : pix ? (
          <Card>
            <CardHeader className="text-center">
              <QrCode className="h-8 w-8 mx-auto text-primary" />
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
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Escolha seu plano</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                {PLANS.filter(p => prices[p.code] !== undefined).map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => setPlan(p.code)}
                    className={`text-left rounded-lg border p-3 transition ${plan === p.code ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{p.label}</div>
                        <div className="text-xs text-muted-foreground">{p.desc}</div>
                      </div>
                      <div className="text-lg font-bold text-primary">{brl(prices[p.code])}</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="grid gap-3">
                <div>
                  <Label>Nome completo</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>WhatsApp</Label>
                    <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 90000-0000" />
                  </div>
                  <div>
                    <Label>CPF (opcional)</Label>
                    <Input value={document_} onChange={(e) => setDocument(e.target.value)} placeholder="000.000.000-00" />
                  </div>
                </div>
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={submitting || !name || !email || !currentPrice}
                onClick={submit}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Gerar PIX de {currentPrice ? brl(currentPrice) : "—"}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Após o pagamento, sua chave é emitida automaticamente e enviada para o portal do cliente.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}