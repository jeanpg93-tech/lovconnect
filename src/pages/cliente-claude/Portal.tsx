import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldAlert, KeyRound, Clock, Zap, RefreshCw, MessageCircle, Copy, CheckCircle2, Store, Ban, Puzzle } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StorefrontBackground } from "@/components/storefront/StorefrontBackground";
import { StorefrontVisualEffects, type VisualEffect } from "@/components/storefront/StorefrontVisualEffects";
import { PortalFooterBrand } from "@/components/cliente-claude/PortalFooterBrand";

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
  cancel_requested_at?: string | null;
};

type ExtensionKey = {
  id: string;
  extension_id: string;
  extension_name: string;
  license_type: string | null;
  license_key: string;
  status: string;
  cancellation_status?: string | null;
  price_cents: number;
  created_at: string;
  expires_at?: string | null;
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
type ResellerInfo = {
  display_name: string | null;
  whatsapp: string | null;
  slug: string | null;
  claude_enabled: boolean;
  store_name?: string | null;
  primary_color?: string | null;
  background_color?: string | null;
  logo_url?: string | null;
  logo_size?: number | null;
  background_effect?: string | null;
  visual_effect?: string | null;
  tagline?: string | null;
};

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

// Converte hex (#RRGGBB) → "H S% L%" para CSS var HSL
function hexToHslString(hex?: string | null): string | null {
  if (!hex) return null;
  const m = hex.trim().replace("#", "");
  if (!/^([0-9a-f]{6}|[0-9a-f]{3})$/i.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export default function ClienteClaudePortal() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storeSlug = searchParams.get("loja")?.trim() ?? "";
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [extensionKeys, setExtensionKeys] = useState<ExtensionKey[]>([]);
  const [usage, setUsage] = useState<Usage>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reseller, setReseller] = useState<ResellerInfo | null>(null);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [renewalPlan, setRenewalPlan] = useState<string>("");
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
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const REFUND_WINDOW_DAYS = 7;
  const withinRefundWindow = (o: Order) =>
    (Date.now() - new Date(o.created_at).getTime()) / 86_400_000 <= REFUND_WINDOW_DAYS;

  const submitCancelRequest = async () => {
    if (!cancelOrder) return;
    setCancelSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("claude-customer-request-cancel", {
        body: { order_id: cancelOrder.id, note: cancelNote || null },
      });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "erro_desconhecido");
      toast.success("Solicitação enviada ao revendedor.");
      setOrders((prev) => prev.map((o) => o.id === cancelOrder.id ? { ...o, cancel_requested_at: new Date().toISOString(), status: o.status === "issued" ? "cancel_requested" : o.status } : o));
      setCancelOrder(null);
      setCancelNote("");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao solicitar cancelamento");
    } finally {
      setCancelSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loginPath = `/cliente-claude/login${storeSlug ? `?loja=${encodeURIComponent(storeSlug)}` : ""}`;
    const waitForSession = async () => {
      const first = await supabase.auth.getSession();
      if (first.data.session) return first.data.session;
      return await new Promise<typeof first.data.session>((resolve) => {
        let subscription: { unsubscribe: () => void } | null = null;
        const timeout = window.setTimeout(async () => {
          subscription?.unsubscribe();
          const latest = await supabase.auth.getSession();
          resolve(latest.data.session ?? null);
        }, 1800);
        const sub = supabase.auth.onAuthStateChange((_event, session) => {
          if (!session) return;
          window.clearTimeout(timeout);
          subscription?.unsubscribe();
          resolve(session);
        });
        subscription = sub.data.subscription;
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
        setExtensionKeys(usageResp.extension_keys ?? []);
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
      const { data: pix, error: pixErr } = await supabase.functions.invoke("claude-customer-checkout-renewal", {
        body: { plan_code: renewalPlan, reseller_slug: storeSlug || null },
      });
      if (pixErr) throw pixErr;
      const payload = pix as any;
      if (!payload?.ok) throw new Error(payload?.error ?? "erro_desconhecido");
      setPixData({
        order_id: payload.order_id,
        qr_code_base64: payload.qr_code_base64 ?? null,
        copy_paste: payload.copy_paste ?? null,
        pix_expires_at: payload.pix_expires_at ?? null,
        sale_price_cents: payload.sale_price_cents ?? 0,
        plan_code: renewalPlan,
      });
      setPixStatus("waiting");
      setPixCopied(false);
      setRenewalOpen(false);
      setPixOpen(true);
    } catch (e: any) {
      const msg = e?.message ?? "Falha ao gerar PIX";
      if (msg === "reseller_misticpay_not_configured") {
        toast.error("O revendedor ainda não configurou o PIX. Fale com ele pelo WhatsApp.");
      } else {
        toast.error(msg);
      }
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

  const brandHsl = hexToHslString(reseller?.primary_color) ?? "263 70% 60%";
  const bgHsl = hexToHslString(reseller?.background_color) ?? "240 10% 4%";
  const storeName = reseller?.store_name ?? reseller?.display_name ?? "Portal";
  const themeStyle = {
    ["--brand" as any]: brandHsl,
    ["--brand-bg" as any]: bgHsl,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen p-4 sm:p-6 relative overflow-hidden"
      style={{
        ...themeStyle,
        background: `radial-gradient(1200px 600px at 10% -10%, hsl(var(--brand) / 0.25), transparent 60%), radial-gradient(900px 500px at 100% 0%, hsl(var(--brand) / 0.12), transparent 55%), hsl(var(--brand-bg))`,
        color: "hsl(0 0% 98%)",
      }}
    >
      {/* Grid tech pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand)) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
        }}
      />
      {/* Efeitos da loja do revendedor (padroniza com o storefront) */}
      {reseller?.background_effect && reseller.background_effect !== "none" && (
        <StorefrontBackground effect={reseller.background_effect as any} color={reseller.primary_color ?? "#7c3aed"} />
      )}
      {reseller?.visual_effect && reseller.visual_effect !== "none" && (
        <StorefrontVisualEffects effect={reseller.visual_effect as VisualEffect} color={reseller.primary_color ?? "#7c3aed"} />
      )}
      <div className="max-w-5xl mx-auto space-y-6 relative">
        {/* Header dashboard */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 shadow-2xl animate-fade-in">
          <div className="flex items-center gap-3 min-w-0">
            {reseller?.logo_url ? (
              <img
                src={reseller.logo_url}
                alt={storeName}
                className="h-11 w-11 rounded-xl object-cover ring-2 ring-white/10 shadow-lg"
                style={{ boxShadow: `0 0 24px hsl(var(--brand) / 0.55)` }}
              />
            ) : (
              <div
                className="h-11 w-11 rounded-xl flex items-center justify-center font-bold text-lg"
                style={{ background: `hsl(var(--brand) / 0.2)`, color: `hsl(var(--brand))`, boxShadow: `0 0 24px hsl(var(--brand) / 0.4)` }}
              >
                {storeName?.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-widest opacity-60">{storeName}</div>
              <h1 className="text-lg sm:text-xl font-semibold truncate">
                Olá, <span style={{ color: `hsl(var(--brand))` }}>{customer?.name}</span>
              </h1>
              <p className="text-xs opacity-60 truncate">{customer?.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {(reseller?.slug || storeSlug) && (
              <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none border-white/15 bg-white/5 hover:bg-white/10 hover-scale">
                <Link to={`/loja/${reseller?.slug ?? storeSlug}`}>
                  <Store className="h-4 w-4 mr-2" /> Loja
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={signOut} className="flex-1 sm:flex-none border-white/15 bg-white/5 hover:bg-white/10 hover-scale">
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </div>
        </header>

        {customer?.must_change_password && (
          <Card className="border-amber-500/40 bg-amber-500/10 backdrop-blur-xl animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" /> Defina uma nova senha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm opacity-80">
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
                  className="bg-white/5 border-white/10"
                />
              </div>
              <Button
                onClick={changePassword}
                disabled={saving}
                style={{ background: `hsl(var(--brand))`, color: "white", boxShadow: `0 0 20px hsl(var(--brand) / 0.5)` }}
                className="hover-scale"
              >
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar nova senha
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Grid dashboard */}
        <div className="grid gap-4 md:grid-cols-3">
          <div
            className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 hover-scale transition-all"
            style={{ boxShadow: expiresIn != null && expiresIn <= 3 ? "0 0 30px hsl(0 84% 60% / 0.4)" : `0 0 20px hsl(var(--brand) / 0.15)` }}
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-60">
              <Clock className="h-4 w-4" /> Expira em
            </div>
            <div className="mt-2 text-3xl font-bold" style={{ color: expiresIn != null && expiresIn <= 3 ? "hsl(0 84% 65%)" : `hsl(var(--brand))` }}>
              {expiresIn ?? "—"}<span className="text-base font-normal opacity-60 ml-1">dias</span>
            </div>
            <div className="text-xs opacity-60 mt-1">{fmtDate(usage?.accountExpiresAt)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 hover-scale transition-all"
            style={{ boxShadow: `0 0 20px hsl(var(--brand) / 0.15)` }}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-60">
              <KeyRound className="h-4 w-4" /> Chaves ativas
            </div>
            <div className="mt-2 text-3xl font-bold" style={{ color: `hsl(var(--brand))` }}>{activeKeys.length}</div>
            <div className="text-xs opacity-60 mt-1">Emitidas via {storeName}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 hover-scale transition-all"
            style={{ boxShadow: `0 0 20px hsl(var(--brand) / 0.15)` }}>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-60">
              <Zap className="h-4 w-4" /> Janela atual
            </div>
            <div className="mt-2 text-3xl font-bold" style={{ color: `hsl(var(--brand))` }}>
              {dailyUsed != null ? `${Math.round(dailyUsed)}%` : "—"}
            </div>
            <div className="text-xs opacity-60 mt-1">{fmtTokens(usage?.tokensInWindow)} / {fmtTokens(usage?.tokenLimit)}</div>
          </div>
        </div>

        {usage && (
          <Card className="border-white/10 bg-white/[0.03] backdrop-blur-xl animate-fade-in" style={{ boxShadow: `0 0 30px hsl(var(--brand) / 0.1)` }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" style={{ color: `hsl(var(--brand))` }} /> Consumo de tokens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dailyUsed != null && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-80">Janela de {usage.tokenWindowHours ?? 5}h</span>
                    <span className="font-mono">{fmtTokens(usage.tokensInWindow)} / {fmtTokens(usage.tokenLimit)}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${dailyUsed}%`, background: `linear-gradient(90deg, hsl(var(--brand)), hsl(var(--brand) / 0.6))`, boxShadow: `0 0 12px hsl(var(--brand) / 0.7)` }}
                    />
                  </div>
                </div>
              )}
              {weeklyUsed != null && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="opacity-80">Janela semanal</span>
                    <span className="font-mono">{fmtTokens(usage.weeklyTokensInWindow)} / {fmtTokens(usage.weeklyTokenLimit)}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${weeklyUsed}%`, background: `linear-gradient(90deg, hsl(var(--brand)), hsl(var(--brand) / 0.6))`, boxShadow: `0 0 12px hsl(var(--brand) / 0.7)` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-white/10 bg-white/[0.03] backdrop-blur-xl animate-fade-in" style={{ boxShadow: `0 0 30px hsl(var(--brand) / 0.1)` }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" style={{ color: `hsl(var(--brand))` }} /> Suas chaves Claude
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-sm opacity-70">Você ainda não tem chaves ativas.</p>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => (
                  <div
                    key={o.id}
                    className="group flex flex-col gap-3 p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20 transition-all sm:flex-row sm:items-center sm:justify-between"
                    style={{ boxShadow: `inset 0 0 0 1px transparent` }}
                  >
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="font-medium text-sm">{PLAN_LABELS[o.plan_code] ?? o.plan_code}</div>
                      <div className="text-xs opacity-60">Emitida em {fmtDate(o.created_at)}</div>
                      {o.status === "issued" && o.code && (
                        <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-black/40 p-2 sm:flex-row sm:items-center">
                          <code className="flex-1 break-all text-xs font-mono" style={{ color: `hsl(var(--brand))` }}>{o.code}</code>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-white/15 bg-white/5 hover:bg-white/10 hover-scale"
                            onClick={() => {
                              navigator.clipboard.writeText(o.code!);
                              toast.success("Chave copiada!");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                          </Button>
                        </div>
                      )}
                      {["issued", "redeemed"].includes(o.status) && !o.cancel_requested_at && (
                        <div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                            onClick={() => { setCancelOrder(o); setCancelNote(""); }}
                          >
                            <Ban className="h-3.5 w-3.5 mr-1" /> Solicitar cancelamento
                          </Button>
                        </div>
                      )}
                      {o.cancel_requested_at && (
                        <div className="text-[11px] rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300">
                          Cancelamento solicitado em {fmtDate(o.cancel_requested_at)} — aguardando o revendedor concluir.
                        </div>
                      )}
                    </div>
                    <div
                      className="px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-center"
                      style={
                        o.status === "issued"
                          ? { background: `hsl(var(--brand) / 0.15)`, color: `hsl(var(--brand))`, boxShadow: `0 0 12px hsl(var(--brand) / 0.35)`, border: `1px solid hsl(var(--brand) / 0.4)` }
                          : o.status === "failed"
                          ? { background: "hsl(0 84% 60% / 0.15)", color: "hsl(0 84% 70%)", border: "1px solid hsl(0 84% 60% / 0.4)" }
                          : { background: "hsl(0 0% 100% / 0.08)", color: "hsl(0 0% 80%)", border: "1px solid hsl(0 0% 100% / 0.15)" }
                      }
                    >
                      {o.status === "issued" ? "Ativa" : o.status === "failed" ? "Falhou" : o.status}
                    </div>
                  </div>
                ))}
                <p className="text-xs opacity-60 pt-2">
                  {activeKeys.length} chave{activeKeys.length === 1 ? "" : "s"} ativa{activeKeys.length === 1 ? "" : "s"}.
                </p>
              </div>
            )}
            {reseller?.claude_enabled && plans.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => setRenewalOpen(true)}
                  style={{ background: `hsl(var(--brand))`, color: "white", boxShadow: `0 0 20px hsl(var(--brand) / 0.55)` }}
                  className="hover-scale font-semibold"
                >
                  <RefreshCw className="h-4 w-4 mr-2" /> Renovar chave
                </Button>
                {whatsappLink && (
                  <Button size="sm" variant="outline" asChild className="border-white/15 bg-white/5 hover:bg-white/10 hover-scale">
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
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova chave / Renovação</DialogTitle>
              <DialogDescription>
                Escolha o plano e pague via PIX. Uma nova chave será emitida automaticamente após a confirmação
                {reseller?.display_name ? ` (revendedor: ${reseller.display_name})` : ""}.
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenewalOpen(false)}>Cancelar</Button>
              <Button onClick={submitRenewal} disabled={renewalSubmitting || !renewalPlan}>
                {renewalSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Gerar PIX
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!cancelOrder} onOpenChange={(o) => { if (!o) { setCancelOrder(null); setCancelNote(""); } }}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Solicitar cancelamento da chave</DialogTitle>
              <DialogDescription>
                O cancelamento é feito pelo revendedor. Vamos avisá-lo agora — em seguida ele entrará em contato para concluir.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {cancelOrder && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="font-medium">{PLAN_LABELS[cancelOrder.plan_code] ?? cancelOrder.plan_code}</div>
                  <div className="text-xs opacity-70">Emitida em {fmtDate(cancelOrder.created_at)}</div>
                </div>
              )}
              {cancelOrder && withinRefundWindow(cancelOrder) ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300 text-xs">
                  ✅ Dentro do prazo de 7 dias — se o revendedor concluir o cancelamento, o valor pago poderá ser estornado.
                </div>
              ) : (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300 text-xs">
                  ⚠️ Fora do prazo de 7 dias — o cancelamento pode ser solicitado, mas <b>não há direito a estorno</b> (política do serviço).
                </div>
              )}
              <div>
                <Label className="text-xs">Motivo (opcional)</Label>
                <Input
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                  placeholder="Ex.: comprei o plano errado"
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelOrder(null)}>Voltar</Button>
              <Button onClick={submitCancelRequest} disabled={cancelSubmitting}>
                {cancelSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar solicitação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={pixOpen} onOpenChange={(o) => { if (!o) { setPixOpen(false); setPixData(null); } }}>
          <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
      <div className="max-w-5xl mx-auto mt-8 pb-4 flex justify-center relative">
        <PortalFooterBrand />
      </div>
    </div>
  );
}