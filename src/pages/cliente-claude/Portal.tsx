import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldAlert, KeyRound, Clock, Zap, RefreshCw, MessageCircle, Copy, CheckCircle2, Store } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

type Customer = {
  id: string;
  name: string;
  email: string;
  must_change_password: boolean;
  reseller_id: string;
};

type Order = {
  id: string;
  plan_code: string;
  status: string;
  provider_key_id: string | null;
  code?: string | null;
  created_at: string;
  sale_price_cents: number;
};

type Usage = {
  kind?: string;
  status?: string;
  accountExpiresAt?: string;
  tokensInWindow?: number | null;
  tokenLimit?: number | null;
  tokenWindowHours?: number | null;
  percentRemaining?: number | null;
  weeklyTokensInWindow?: number | null;
  weeklyTokenLimit?: number | null;
} | null;

type Plan = { plan_code: string; sale_price_cents: number };
type ResellerInfo = { display_name: string | null; whatsapp: string | null; slug: string | null; claude_enabled: boolean };

const PLAN_LABELS: Record<string, string> = {
  "pro_30d": "Plano Pro — 30 dias",
  "5x_7d": "Plano 5x — 7 dias",
  "5x_30d": "Plano 5x — 30 dias",
  "20x_30d": "Plano 20x — 30 dias",
  api_5x_7d: "API 5x — 7 dias",
  api_5x_30d: "API 5x — 30 dias",
  api_20x_30d: "API 20x — 30 dias",
};

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function daysUntil(d?: string | null) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.max(0, Math.round(ms / 86400000));
}
function fmtTokens(n?: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function ClienteClaudePortal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storeSlug = searchParams.get("loja")?.trim() ?? "";
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [usage, setUsage] = useState<Usage>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reseller, setReseller] = useState<ResellerInfo | null>(null);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [renewalPlan, setRenewalPlan] = useState<string>("");
  const [renewalNote, setRenewalNote] = useState("");
  const [renewalSubmitting, setRenewalSubmitting] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);
  const [pixData, setPixData] = useState<{
    order_id: string;
    qr_code_base64: string | null;
    copy_paste: string | null;
    pix_expires_at: string | null;
    sale_price_cents: number;
    plan_code: string;
  } | null>(null);
  const [pixStatus, setPixStatus] = useState<"waiting" | "issued" | "failed">("waiting");
  const [pixCopied, setPixCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loginPath = `/cliente-claude/login${storeSlug ? `?loja=${encodeURIComponent(storeSlug)}` : ""}`;
    const waitForSession = async () => {
      const first = await supabase.auth.getSession();
      if (first.data.session) return first.data.session;
      return await new Promise<typeof first.data.session>((resolve) => {
        const timeout = window.setTimeout(async () => {
          sub.data.subscription.unsubscribe();
          const latest = await supabase.auth.getSession();
          resolve(latest.data.session ?? null);
        }, 1800);
        const sub = supabase.auth.onAuthStateChange((_event, session) => {
          if (!session) return;
          window.clearTimeout(timeout);
          sub.data.subscription.unsubscribe();
          resolve(session);
        });
      });
    };

    (async () => {
      try {
        const session = await waitForSession();
        if (cancelled) return;
        if (!session) {
          navigate(loginPath, { replace: true });
          return;
        }
        const { data: usageResp, error } = await supabase.functions.invoke("claude-my-usage", {
          body: { reseller_slug: storeSlug || null },
        });
        if (error) throw error;
        if (!usageResp?.ok || !usageResp.customer) {
          toast.error("Cliente não encontrado. Contate seu revendedor.");
          await supabase.auth.signOut();
          navigate(loginPath, { replace: true });
          return;
        }
        if (cancelled) return;
        setCustomer(usageResp.customer as Customer);
        setOrders(usageResp.orders ?? []);
        setUsage(usageResp.usage ?? null);
        setPlans(usageResp.plans ?? []);
        setReseller(usageResp.reseller ?? null);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Erro ao abrir o portal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, storeSlug]);

  const changePassword = async () => {
    if (newPassword.length < 8) return toast.error("Senha precisa de ao menos 8 caracteres");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await supabase.from("claude_customers").update({ must_change_password: false }).eq("id", customer!.id);
      setCustomer({ ...(customer as Customer), must_change_password: false });
      setNewPassword("");
      toast.success("Senha atualizada!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar senha");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate(`/cliente-claude/login${storeSlug ? `?loja=${encodeURIComponent(storeSlug)}` : ""}`, { replace: true });
  };

  const submitRenewal = async () => {
    if (!renewalPlan) return toast.error("Escolha um plano");
    setRenewalSubmitting(true);
    try {
      // 1) Tenta o fluxo automático PIX (MisticPay do revendedor)
      const { data: pix, error: pixErr } = await supabase.functions.invoke("claude-customer-checkout-renewal", {
        body: { plan_code: renewalPlan, reseller_slug: storeSlug || null },
      });
      const pixErrorCode = (pix as any)?.error;
      if (!pixErr && (pix as any)?.ok) {
        setPixData({
          order_id: (pix as any).order_id,
          qr_code_base64: (pix as any).qr_code_base64 ?? null,
          copy_paste: (pix as any).copy_paste ?? null,
          pix_expires_at: (pix as any).pix_expires_at ?? null,
          sale_price_cents: (pix as any).sale_price_cents ?? 0,
          plan_code: renewalPlan,
        });
        setPixStatus("waiting");
        setPixCopied(false);
        setRenewalOpen(false);
        setPixOpen(true);
        return;
      }
      // 2) Fallback: revendedor sem MisticPay configurado → solicitação manual
      if (pixErrorCode && pixErrorCode !== "reseller_misticpay_not_configured") {
        throw new Error(pixErrorCode);
      }
      const { data, error } = await supabase.functions.invoke("claude-customer-request-renewal", {
        body: { plan_code: renewalPlan, note: renewalNote || null, reseller_slug: storeSlug || null },
      });
      if (error) throw error;
      if ((data as any)?.error === "already_requested") {
        toast.info("Você já tem uma solicitação em aberto para esse plano.");
      } else if ((data as any)?.ok) {
        toast.success("Solicitação enviada! O revendedor foi notificado.");
        setRenewalOpen(false);
        setRenewalNote("");
        setRenewalPlan("");
      } else {
        throw new Error((data as any)?.error ?? "erro_desconhecido");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar solicitação");
    } finally {
      setRenewalSubmitting(false);
    }
  };

  // Polling do pedido PIX aberto
  useEffect(() => {
    if (!pixOpen || !pixData?.order_id) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase
        .from("claude_orders")
        .select("status")
        .eq("id", pixData.order_id)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.status === "issued") {
        setPixStatus("issued");
        toast.success("Pagamento confirmado! Chave emitida.");
        // recarrega dados
        const { data: usageResp } = await supabase.functions.invoke("claude-my-usage", {
          body: { reseller_slug: storeSlug || null },
        });
        if (usageResp?.ok) {
          setOrders(usageResp.orders ?? []);
          setUsage(usageResp.usage ?? null);
        }
      } else if (data.status === "failed") {
        setPixStatus("failed");
      } else if (data.status === "awaiting_balance") {
        setPixStatus("issued");
        toast.info("Pagamento recebido. Aguardando o revendedor liberar a chave.");
      }
    };
    const iv = setInterval(tick, 4000);
    tick();
    return () => { cancelled = true; clearInterval(iv); };
  }, [pixOpen, pixData?.order_id]);

  const whatsappLink = reseller?.whatsapp
    ? `https://wa.me/${reseller.whatsapp.replace(/\D+/g, "")}?text=${encodeURIComponent(
        `Olá! Sou ${customer?.name} (${customer?.email}) e gostaria de renovar minha chave Claude.`,
      )}`
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeKeys = orders.filter((o) => o.status === "issued");
  const expiresIn = daysUntil(usage?.accountExpiresAt);
  const dailyUsed = usage?.tokenLimit && usage?.tokensInWindow != null
    ? Math.min(100, (usage.tokensInWindow / usage.tokenLimit) * 100)
    : null;
  const weeklyUsed = usage?.weeklyTokenLimit && usage?.weeklyTokensInWindow != null
    ? Math.min(100, (usage.weeklyTokensInWindow / usage.weeklyTokenLimit) * 100)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Olá, {customer?.name}</h1>
            <p className="text-sm text-muted-foreground">{customer?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {(reseller?.slug || storeSlug) && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/loja/${reseller?.slug ?? storeSlug}`}>
                  <Store className="h-4 w-4 mr-2" /> Loja
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </div>

        {customer?.must_change_password && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" /> Defina uma nova senha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Por segurança, troque a senha inicial gerada automaticamente.
              </p>
              <div className="space-y-2">
                <Label htmlFor="new-pass">Nova senha</Label>
                <Input
                  id="new-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <Button onClick={changePassword} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar nova senha
              </Button>
            </CardContent>
          </Card>
        )}

        {usage && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" /> Consumo de tokens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {expiresIn != null && (
                <div className={`flex items-center gap-2 text-sm ${expiresIn <= 3 ? "text-destructive" : "text-muted-foreground"}`}>
                  <Clock className="h-4 w-4" />
                  Sua chave expira em <b>{expiresIn} dia{expiresIn === 1 ? "" : "s"}</b> ({fmtDate(usage.accountExpiresAt)})
                </div>
              )}
              {dailyUsed != null && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Janela de {usage.tokenWindowHours ?? 5}h</span>
                    <span>{fmtTokens(usage.tokensInWindow)} / {fmtTokens(usage.tokenLimit)}</span>
                  </div>
                  <Progress value={dailyUsed} />
                </div>
              )}
              {weeklyUsed != null && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Janela semanal</span>
                    <span>{fmtTokens(usage.weeklyTokensInWindow)} / {fmtTokens(usage.weeklyTokenLimit)}</span>
                  </div>
                  <Progress value={weeklyUsed} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Suas chaves Claude
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não tem chaves ativas.</p>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => (
                  <div key={o.id} className="flex flex-col gap-3 p-3 rounded-lg border bg-card/50 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="font-medium text-sm">{PLAN_LABELS[o.plan_code] ?? o.plan_code}</div>
                      <div className="text-xs text-muted-foreground">Emitida em {fmtDate(o.created_at)}</div>
                      {o.status === "issued" && o.code && (
                        <div className="flex flex-col gap-2 rounded-md border bg-background/70 p-2 sm:flex-row sm:items-center">
                          <code className="flex-1 break-all text-xs">{o.code}</code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(o.code!);
                              toast.success("Chave copiada!");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                          </Button>
                        </div>
                      )}
                    </div>
                    <Badge variant={o.status === "issued" ? "default" : o.status === "failed" ? "destructive" : "secondary"}>
                      {o.status === "issued" ? "Ativa" : o.status === "failed" ? "Falhou" : o.status}
                    </Badge>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2">
                  {activeKeys.length} chave{activeKeys.length === 1 ? "" : "s"} ativa{activeKeys.length === 1 ? "" : "s"}.
                </p>
              </div>
            )}
            {reseller?.claude_enabled && plans.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setRenewalOpen(true)}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Renovar chave
                </Button>
                {whatsappLink && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={whatsappLink} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4 mr-2" /> Falar com o revendedor
                    </a>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={renewalOpen} onOpenChange={setRenewalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Solicitar renovação</DialogTitle>
              <DialogDescription>
                Escolha o plano desejado. Sua solicitação será enviada ao revendedor
                {reseller?.display_name ? ` (${reseller.display_name})` : ""} para confirmação e pagamento.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <RadioGroup value={renewalPlan} onValueChange={setRenewalPlan}>
                {plans.map((p) => (
                  <label
                    key={p.plan_code}
                    className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={p.plan_code} id={`plan-${p.plan_code}`} />
                      <div>
                        <div className="font-medium text-sm">{PLAN_LABELS[p.plan_code] ?? p.plan_code}</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-primary">{fmtBRL(p.sale_price_cents)}</div>
                  </label>
                ))}
              </RadioGroup>
              <div className="space-y-2">
                <Label htmlFor="note">Observação (opcional)</Label>
                <Textarea
                  id="note"
                  value={renewalNote}
                  onChange={(e) => setRenewalNote(e.target.value)}
                  placeholder="Ex.: prefiro pagar via PIX"
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenewalOpen(false)}>Cancelar</Button>
              <Button onClick={submitRenewal} disabled={renewalSubmitting || !renewalPlan}>
                {renewalSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar solicitação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={pixOpen} onOpenChange={(o) => { if (!o) { setPixOpen(false); setPixData(null); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pagamento via PIX</DialogTitle>
              <DialogDescription>
                {pixStatus === "issued"
                  ? "Pagamento confirmado! Sua chave está sendo emitida."
                  : "Pague o PIX abaixo para renovar sua chave automaticamente."}
              </DialogDescription>
            </DialogHeader>
            {pixData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{PLAN_LABELS[pixData.plan_code] ?? pixData.plan_code}</span>
                  <span className="font-semibold text-primary">{fmtBRL(pixData.sale_price_cents)}</span>
                </div>
                {pixStatus === "issued" ? (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <CheckCircle2 className="h-14 w-14 text-emerald-500" />
                    <p className="text-sm text-muted-foreground text-center">
                      Sua chave já aparece na lista. Você pode fechar esta janela.
                    </p>
                  </div>
                ) : (
                  <>
                    {pixData.qr_code_base64 && (
                      <div className="flex justify-center">
                        <img
                          src={`data:image/png;base64,${pixData.qr_code_base64}`}
                          alt="QR Code PIX"
                          className="w-56 h-56 rounded-lg border bg-white p-2"
                        />
                      </div>
                    )}
                    {pixData.copy_paste && (
                      <div className="space-y-2">
                        <Label className="text-xs">PIX Copia e Cola</Label>
                        <div className="flex gap-2">
                          <Input readOnly value={pixData.copy_paste} className="font-mono text-xs" />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={async () => {
                              await navigator.clipboard.writeText(pixData.copy_paste!);
                              setPixCopied(true);
                              toast.success("Copiado!");
                              setTimeout(() => setPixCopied(false), 2000);
                            }}
                          >
                            {pixCopied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Aguardando confirmação do pagamento…
                    </div>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPixOpen(false); setPixData(null); }}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}