import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Loader2, Store, MessageCircle, Copy, CheckCircle2, ArrowLeft, 
  ShieldCheck, QrCode, Tag, Sparkles, Download, Chrome, RefreshCw, 
  Key, AlertTriangle, ExternalLink, Star, Quote, Send, HelpCircle,
  KeyRound, Coins
} from "lucide-react";
import { toast } from "sonner";
import { StorefrontBackground } from "@/components/storefront/StorefrontBackground";
import { StorefrontVisualEffects, type VisualEffect } from "@/components/storefront/StorefrontVisualEffects";
import { ReportStoreDialog } from "@/components/storefront/ReportStoreDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";

type BgEffect = "none" | "grid" | "circles" | "flames" | "dots" | "waves" | "aurora" | "stars" | "mesh" | "rays";
type LayoutMode = "grid" | "list";

type Storefront = {
  reseller_id: string;
  is_enabled: boolean;
  store_name: string;
  tagline: string | null;
  welcome_message: string | null;
  contact_whatsapp: string | null;
  primary_color: string;
  background_color?: string | null;
  logo_url: string | null;
  logo_size: number | null;
  product_emojis: Record<string, string> | null;
  background_effect: BgEffect;
  visual_effect?: VisualEffect | null;
  layout_mode: LayoutMode;
  show_credits?: boolean;
  show_extensions?: boolean;
  show_free_trial?: boolean;
};


type Reseller = { id: string; display_name: string; slug: string; is_active: boolean };
type Plan = { license_type: string; label: string; price_cents: number; customer_price_cents: number; is_active: boolean };
type Pack = { license_type: string; price_cents: number; extension_id?: string };
type Recharge = { id: string; credits_amount: number; price_cents: number };

const FALLBACK_LABEL: Record<string, string> = {
  trial: "Chave Teste (30min)",
  pro_1d: "Pro 1 dia",
  pro_7d: "Pro 7 dias",
  pro_15d: "Pro 15 dias",
  pro_30d: "Pro 30 dias",
  lifetime: "Vitalícia",
};
const ORDER = ["pro_1d", "pro_7d", "pro_15d", "pro_30d", "lifetime"];



export default function PublicStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [reseller, setReseller] = useState<Reseller | null>(null);
  const [store, setStore] = useState<Storefront | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [recharges, setRecharges] = useState<Recharge[]>([]);
  const [activeTab, setActiveTab] = useState<"extension" | "recharge">("extension");
  const [testimonials, setTestimonials] = useState<any[]>([]);
  
  // Device Reset
  const [resetKey, setResetKey] = useState("");
  const [resetting, setResetting] = useState(false);
  const [downloadingExt, setDownloadingExt] = useState(false);

  // Verificar Pedido (recarga)
  const [checkOrderId, setCheckOrderId] = useState("");
  const [checkingOrder, setCheckingOrder] = useState(false);
  const [checkedOrder, setCheckedOrder] = useState<any | null>(null);

  const handleCheckOrder = async () => {
    const id = checkOrderId.trim();
    if (!id) {
      toast.error("Informe o ID do pedido");
      return;
    }
    setCheckingOrder(true);
    setCheckedOrder(null);
    try {
      const { data, error } = await supabase.functions.invoke("storefront-order-status", {
        method: "GET",
        headers: { "x-query-order-id": id } as any,
      });
      if (error) throw new Error(error.message || "Falha ao consultar pedido");
      if ((data as any)?.error) throw new Error((data as any).error);
      const o = (data as any)?.order;
      if (!o) throw new Error("Pedido não encontrado");
      setCheckedOrder(o);
      toast.success("Pedido encontrado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao consultar pedido");
    } finally {
      setCheckingOrder(false);
    }
  };

  const handleAccessExtension = async () => {
    const mode = (store as any)?.access_extension_mode || "native";
    const customUrl = (store as any)?.access_extension_custom_url;
    if (mode === "custom") {
      if (!customUrl) {
        toast.error("Extensão personalizada não configurada");
        return;
      }
      window.open(customUrl, "_blank", "noopener");
      return;
    }
    setDownloadingExt(true);
    try {
      const { data: latest, error } = await supabase
        .from("extensions")
        .select("slug")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !latest?.slug) throw new Error("Extensão indisponível");
      const { data: funcData, error: funcErr } = await supabase.functions.invoke("public-extension-download", {
        method: "GET",
        headers: { "x-query-slug": latest.slug } as any
      });
      if (funcErr || !funcData?.url) throw new Error(funcErr?.message || "Falha ao gerar link");
      const a = document.createElement("a");
      a.href = funcData.url;
      a.rel = "noopener";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Download iniciado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao baixar extensão");
    } finally {
      setDownloadingExt(false);
    }
  };
  

  const [selLic, setSelLic] = useState<string | null>(null);
  const [selRec, setSelRec] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [buyerWa, setBuyerWa] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [order, setOrder] = useState<{
    id: string; short_code?: string | null; qr_code_base64: string; copy_paste: string; amount_cents: number;
    product_type?: string | null; credit_amount?: number | null;
  } | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [securityNoticeOpen, setSecurityConfirmOpen] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      setLoading(true);
      const { data: r } = await supabase
        .from("resellers")
        .select("id, display_name, slug, is_active")
        .eq("slug", slug)
        .maybeSingle();
      if (!r || !r.is_active) { setLoading(false); return; }
      setReseller(r as Reseller);

      const { data: s } = await supabase
        .from("reseller_storefronts")
        .select("*")
        .eq("reseller_id", r.id)
        .maybeSingle();
      if (!s || !s.is_enabled) { setLoading(false); return; }
      setStore(s as any);

      const { data: pl } = await supabase
        .from("pricing_plans")
        .select("license_type, label, price_cents, customer_price_cents, is_active")
        .eq("is_active", true);
      const sortedPlans = ((pl ?? []) as Plan[]).slice().sort(
        (a, b) => ORDER.indexOf(a.license_type) - ORDER.indexOf(b.license_type),
      );
      setPlans(sortedPlans);

      const { data: rep } = await supabase
        .from("reseller_extension_prices")
        .select("license_type, price_cents, is_active, extension_id")
        .eq("reseller_id", r.id)
        .is("extension_id", null);

      const list = ((rep ?? []) as any[])
        .filter((row) => row.is_active && row.price_cents > 0)
        .map((row) => ({ 
          license_type: row.license_type, 
          price_cents: row.price_cents,
          extension_id: row.extension_id 
        }))
        .sort((a, b) => ORDER.indexOf(a.license_type) - ORDER.indexOf(b.license_type));
      setPacks(list);

      const { data: t } = await supabase
        .from("storefront_testimonials")
        .select("*")
        .eq("reseller_id", r.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (t) setTestimonials(t);

      const { data: rec } = await supabase
        .from("reseller_credit_prices")
        .select("id, credits_amount, price_cents")
        .eq("reseller_id", r.id)
        .eq("is_active", true)
        .order("credits_amount", { ascending: true });
      if (rec) setRecharges(rec);

      // Default active tab based on what is enabled
      if (s && !(s as any).show_extensions && (s as any).show_credits) {
        setActiveTab("recharge");
      }

      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    if (!order?.id) return;
    const tick = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("storefront-order-status", {
          method: "GET",
          headers: { "x-query-order-id": order.id } as any
        });
        if (error || (data as any)?.error) {
          // Pedido inexistente/removido — para de pollar
          if (pollRef.current) window.clearInterval(pollRef.current);
          return;
        }
        if (data?.order) {
          setOrderStatus(data.order.status);
          if (data.order.license_key) setLicenseKey(data.order.license_key);
          if (["completed", "failed", "refunded"].includes(data.order.status)) {
            if (pollRef.current) window.clearInterval(pollRef.current);
          }
        }
      } catch {
        if (pollRef.current) window.clearInterval(pollRef.current);
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 4000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [order?.id]);

  const labelFor = (lt: string) =>
    plans.find((p) => p.license_type === lt)?.label || FALLBACK_LABEL[lt] || lt;

  const priceFor = (lt: string) =>
    packs.find((p) => p.license_type === lt)?.price_cents ?? 
    plans.find((p) => p.license_type === lt)?.customer_price_cents ?? 0;

  const getExtId = (lt: string) => {
    return packs.find((p) => p.license_type === lt)?.extension_id || null;
  };

  const submit = async () => {
    if ((!selLic && !selRec) || !slug) return;
    if (buyerName.trim().length < 2) return toast.error("Informe seu nome");
    const wa = buyerWa.replace(/\D+/g, "");
    const isTrial = selLic === "trial";
    if (!isTrial && wa.length < 10) return toast.error("Informe um WhatsApp válido");
    if (isTrial && wa && wa.length < 10) return toast.error("WhatsApp inválido (deixe em branco ou informe DDD + número)");

    setSubmitting(true);
    try {
      if (isTrial) {
        const { data, error } = await supabase.functions.invoke("storefront-create-trial", {
          body: {
            reseller_slug: slug,
            buyer_name: buyerName.trim(),
            buyer_whatsapp: wa,
          },
        });
        if (error || !data || data.error) {
          toast.error(data?.error ?? error?.message ?? "Falha ao gerar chave teste");
          return;
        }
        setOrder({ id: data.order_id, amount_cents: 0, qr_code_base64: "", copy_paste: "" } as any);
        setOrderStatus("completed");
        setLicenseKey(data.license_key ?? null);
        return;
      }
      const { data, error } = await supabase.functions.invoke("storefront-create-order", {
        body: {
          reseller_slug: slug,
          ...(selLic ? { license_type: selLic, extension_id: getExtId(selLic) } : {}),
          ...(selRec ? { recharge_id: selRec } : {}),
          buyer_name: buyerName.trim(),
          buyer_whatsapp: wa,
        },
      });
      if (error || !data || data.error) {
        toast.error(data?.error ?? error?.message ?? "Falha ao gerar pedido");
        return;
      }
      setOrder(data);
      setOrderStatus("pending");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao processar pedido");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setOrder(null);
    setOrderStatus(null);
    setLicenseKey(null);
    setSelLic(null);
    setSelRec(null);
    setBuyerName("");
    setBuyerWa("");
  };

  const formatBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleResetDevice = async () => {
    if (!resetKey.trim()) return toast.error("Informe sua chave de licença");
    setResetConfirmOpen(true);
  };

  const confirmReset = async () => {
    setResetConfirmOpen(false);
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("license-reset-device", {
        body: { license_key: resetKey.trim() },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? error?.message ?? "Erro ao resetar dispositivo");
      toast.success("Vínculos resetados com sucesso! Você já pode usar em outro dispositivo.");
      setResetKey("");
      // Após sucesso, mostra o aviso de segurança
      setSecurityConfirmOpen(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando loja…
      </div>
    );
  }

  if (!reseller || !store) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
        <Store className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Loja não encontrada</h1>
        <p className="text-sm text-muted-foreground">Esta loja não existe ou está desativada.</p>
        <Link to="/" className="text-sm underline">Voltar</Link>
      </div>
    );
  }

  const color = store.primary_color || "#7c3aed";
  const bgColor = store.background_color || undefined;
  const bgEffect = (store.background_effect ?? "none") as BgEffect;
  const layoutMode = (store.layout_mode ?? "grid") as LayoutMode;

  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden" style={bgColor ? { backgroundColor: bgColor } : undefined}>
      <StorefrontBackground effect={bgEffect} color={color} />
      <StorefrontVisualEffects effect={(store.visual_effect ?? "none") as VisualEffect} color={color} />

      <div className="relative z-10 min-h-screen flex flex-col items-center px-4 py-10 sm:py-16">
        {/* Hero centralizado */}
        <header className="w-full max-w-3xl text-center flex flex-col items-center gap-4 mb-10">
          <div
            className="rounded-2xl border flex items-center justify-center overflow-hidden bg-card/80 backdrop-blur shadow-lg"
            style={{
              borderColor: `${color}50`,
              boxShadow: `0 10px 40px -10px ${color}55`,
              width: `${store.logo_size ?? 80}px`,
              height: `${store.logo_size ?? 80}px`,
            }}
          >
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.store_name} className="h-full w-full object-contain" />
            ) : (
              <Store className="h-1/2 w-1/2" style={{ color }} />
            )}
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {store.store_name || reseller.display_name}
            </h1>
            {store.tagline && (
              <p className="mt-2 text-base text-muted-foreground">{store.tagline}</p>
            )}
          </div>
          {store.contact_whatsapp && (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="backdrop-blur"
              style={{ borderColor: `${color}60`, color }}
            >
              <a
                href={`https://wa.me/${store.contact_whatsapp.startsWith("55") ? store.contact_whatsapp : `55${store.contact_whatsapp}`}`}
                target="_blank"
                rel="noreferrer"
              >
                <svg 
                  className="h-3.5 w-3.5 mr-1.5 fill-current" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg> Falar no WhatsApp
              </a>
            </Button>
          )}

          {store.show_credits && store.show_extensions && !order && !selLic && !selRec && (
            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setActiveTab("extension")}
                className={cn(
                  "flex-1 min-w-[140px] p-3 rounded-2xl border transition-all flex flex-col items-center gap-1.5 group shadow-sm",
                  activeTab === "extension" 
                    ? "bg-card scale-105 z-10" 
                    : "bg-card/40 border-white/5 hover:border-white/20 hover:bg-card/60"
                )}
                style={activeTab === "extension" ? { borderColor: `${color}80`, boxShadow: `0 0 0 1px ${color}33, 0 1px 2px 0 ${color}0D` } : {}}
              >
                <div
                  className={cn(
                    "p-2 rounded-xl transition-colors",
                    activeTab === "extension" ? "" : "group-hover:bg-opacity-30"
                  )}
                  style={activeTab === "extension" ? { background: color, color: '#fff' } : { background: `${color}1a`, color }}
                >
                  <KeyRound className="h-4 w-4" />
                </div>
                <div className="text-[9px] font-black uppercase tracking-wider whitespace-nowrap" style={{ color: activeTab === "extension" ? color : undefined }}>Chave Extensão</div>
                <div
                  className={cn(
                    "h-1 w-1 rounded-full mt-0.5 transition-all",
                    activeTab === "extension" ? "scale-100" : "bg-transparent scale-0"
                  )}
                  style={activeTab === "extension" ? { background: color } : {}}
                />
              </button>

              <button
                onClick={() => setActiveTab("recharge")}
                className={cn(
                  "flex-1 min-w-[140px] p-3 rounded-2xl border transition-all flex flex-col items-center gap-1.5 group shadow-sm",
                  activeTab === "recharge" 
                    ? "bg-card scale-105 z-10" 
                    : "bg-card/40 border-white/5 hover:border-white/20 hover:bg-card/60"
                )}
                style={activeTab === "recharge" ? { borderColor: `${color}80`, boxShadow: `0 0 0 1px ${color}33, 0 1px 2px 0 ${color}0D` } : {}}
              >
                <div
                  className={cn(
                    "p-2 rounded-xl transition-colors",
                    activeTab === "recharge" ? "" : "group-hover:bg-opacity-30"
                  )}
                  style={activeTab === "recharge" ? { background: color, color: '#fff' } : { background: `${color}1a`, color }}
                >
                  <Coins className="h-4 w-4" />
                </div>
                <div className="text-[9px] font-black uppercase tracking-wider whitespace-nowrap" style={{ color: activeTab === "recharge" ? color : undefined }}>Recarga na conta</div>
                <div
                  className={cn(
                    "h-1 w-1 rounded-full mt-0.5 transition-all",
                    activeTab === "recharge" ? "scale-100" : "bg-transparent scale-0"
                  )}
                  style={activeTab === "recharge" ? { background: color } : {}}
                />
              </button>
            </div>
          )}
        </header>

        <main className="w-full max-w-3xl flex-1 flex flex-col items-center">
          {store.welcome_message && !order && !selLic && !selRec && (
            <p className="text-center text-sm text-muted-foreground whitespace-pre-line max-w-xl mb-8">
              {store.welcome_message}
            </p>
          )}

          {/* Order success / pending */}
          {order ? (
            <div className="w-full rounded-2xl border bg-card/90 backdrop-blur p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Button variant="ghost" size="sm" onClick={reset}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
                </Button>
                {order.short_code && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(order.short_code!);
                      toast.success("Número do pedido copiado");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wider transition-colors hover:bg-muted/60"
                    style={{ borderColor: `${color}40`, color }}
                    title="Copiar número do pedido"
                  >
                    <Tag className="h-3 w-3" /> Pedido #{order.short_code}
                    <Copy className="h-3 w-3 opacity-60" />
                  </button>
                )}
                <div className="text-sm font-semibold ml-auto">
                  Total: <span style={{ color }}>{order.amount_cents > 0 ? formatBRL(order.amount_cents) : "Grátis"}</span>
                </div>
              </div>

              {orderStatus === "completed" && (licenseKey || order.product_type === "credits") ? (
                <div className="text-center space-y-3 py-4">
                  <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color }} />
                  <h2 className="text-lg font-semibold">
                    {order.product_type === "credits" ? "Recarga confirmada!" : order.amount_cents > 0 ? "Pagamento confirmado!" : "Chave teste gerada!"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {order.product_type === "credits"
                      ? `${order.credit_amount ?? ""} créditos foram registrados para processamento.`
                      : order.amount_cents > 0
                      ? "Sua chave foi gerada e enviada no seu WhatsApp."
                      : "Copie sua chave abaixo. Ela tem validade de 30 minutos."}
                  </p>
                  {licenseKey && (
                    <>
                      <div className="rounded-md bg-muted p-3 font-mono text-sm break-all">{licenseKey}</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(licenseKey);
                          toast.success("Chave copiada");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar chave
                      </Button>
                    </>
                  )}
                </div>
              ) : orderStatus === "failed" ? (
                <div className="text-center text-sm text-destructive py-4">
                  O pagamento falhou ou foi cancelado. Tente novamente.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 flex flex-col items-center">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <QrCode className="h-4 w-4" /> Pague via PIX
                    </div>
                    {order.qr_code_base64 ? (
                      <img
                        src={order.qr_code_base64.startsWith("data:") ? order.qr_code_base64 : `data:image/png;base64,${order.qr_code_base64}`}
                        alt="QR PIX"
                        className="w-full max-w-[260px] rounded-md border bg-white p-2"
                      />
                    ) : (
                      <div className="text-xs text-muted-foreground">QR indisponível</div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Pix copia e cola</Label>
                    <div className="rounded-md bg-muted p-3 font-mono text-[11px] break-all">
                      {order.copy_paste}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(order.copy_paste);
                        toast.success("Código copiado");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar código
                    </Button>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Aguardando confirmação… {order.product_type === "credits" ? "A recarga será processada após o pagamento." : "A chave será enviada no seu WhatsApp."}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (selLic || selRec) ? (
            /* Checkout */
            <div className="w-full max-w-md rounded-2xl border bg-card/90 backdrop-blur p-6 shadow-xl space-y-4">
              <Button variant="ghost" size="sm" onClick={() => { setSelLic(null); setSelRec(null); }}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
              </Button>
              <div className="text-center">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Item selecionado</div>
                <h2 className="text-lg font-semibold mt-1">
                  {selLic ? labelFor(selLic) : `${recharges.find(r => r.id === selRec)?.credits_amount} Créditos`}
                </h2>
                <div className="text-3xl font-bold mt-2" style={{ color }}>
                  {selLic === "trial"
                    ? "Grátis"
                    : selLic
                      ? formatBRL(priceFor(selLic))
                      : formatBRL(recharges.find(r => r.id === selRec)?.price_cents ?? 0)
                  }
                </div>
              </div>
              <div className="space-y-3 border-t pt-4">
                <div className="space-y-2">
                  <Label>
                    Seu WhatsApp{selLic === "trial" ? " (opcional)" : ""}
                  </Label>
                  <Input
                    value={buyerWa}
                    onChange={(e) => setBuyerWa(e.target.value)}
                    placeholder="(11) 99999-9999"
                    inputMode="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{selLic ? "Seu nome (vai na licença)" : "Seu nome"}</Label>
                  <Input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="João Silva"
                  />
                </div>
                <Button
                  className="w-full h-12 font-bold"
                  onClick={submit}
                  disabled={submitting}
                  style={{ background: color, borderColor: color }}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : selLic === "trial" ? (
                    <Sparkles className="h-4 w-4 mr-2" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-2" />
                  )}
                  {selLic === "trial"
                    ? "Gerar Chave Teste Grátis"
                    : `Pagar ${selLic ? formatBRL(priceFor(selLic)) : formatBRL(recharges.find(r => r.id === selRec)?.price_cents ?? 0)} via PIX`}
                </Button>
              </div>
            </div>
          ) : (
            /* Catálogo */
            <div className="w-full">
              {activeTab === "extension" ? (
                <>
                  {store.show_free_trial && (
                    <div className="max-w-xl mx-auto mb-4">
                      <button
                        onClick={() => setSelLic("trial")}
                        className="group relative w-full overflow-hidden rounded-2xl border bg-gradient-to-r from-card/70 via-card/50 to-card/70 backdrop-blur p-4 text-left transition-all hover:shadow-lg hover:-translate-y-0.5"
                        style={{ borderColor: `${color}40` }}
                      >
                        <div
                          className="absolute -top-8 -right-8 h-32 w-32 rounded-full blur-[60px] opacity-[0.12] transition-opacity group-hover:opacity-25"
                          style={{ background: color }}
                        />
                        <div className="relative z-10 flex items-center gap-3">
                          <div
                            className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-inner"
                            style={{ background: `${color}1a`, color }}
                          >
                            <Sparkles className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm">Chave Teste</span>
                              <span
                                className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border"
                                style={{ color, borderColor: `${color}50`, background: `${color}10` }}
                              >
                                Grátis
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              Experimente a extensão antes de comprar
                            </div>
                          </div>
                          <div
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md"
                            style={{ color, background: `${color}15` }}
                          >
                            Solicitar
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                  {
                /* Catálogo de pacotes de licença */
                packs.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    Nenhum pacote disponível no momento.
                  </div>
                ) : layoutMode === "list" ? (
                  <div className="flex flex-col gap-3 max-w-xl mx-auto">
                    {packs.map((pk) => (
                      <button
                        key={pk.license_type}
                        onClick={() => setSelLic(pk.license_type)}
                        className={cn(
                          "group rounded-xl border bg-card/80 backdrop-blur p-4 text-left",
                          "flex items-center gap-4 transition-all hover:shadow-lg hover:-translate-y-0.5",
                        )}
                        style={{ borderColor: `${color}30` }}
                      >
                        <div
                          className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0 text-xl"
                          style={{ background: `${color}1a`, color }}
                        >
                          <Tag className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold">
                            {labelFor(pk.license_type)}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Ativação imediata via PIX
                          </div>
                        </div>
                        <div className="text-xl font-bold" style={{ color }}>
                          {formatBRL(pk.price_cents)}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {packs.map((pk) => (
                      <button
                        key={pk.license_type}
                        onClick={() => setSelLic(pk.license_type)}
                        className="group rounded-2xl border bg-card/80 backdrop-blur p-6 text-center transition-all hover:shadow-xl hover:-translate-y-1"
                        style={{ borderColor: `${color}30` }}
                      >
                        <div
                          className="h-12 w-12 mx-auto rounded-xl flex items-center justify-center mb-3 text-2xl"
                          style={{ background: `${color}1a`, color }}
                        >
                          <Tag className="h-5 w-5" />
                        </div>
                        <div className="text-base font-semibold">
                            {labelFor(pk.license_type)}
                        </div>
                        <div className="mt-3 text-2xl font-bold" style={{ color }}>
                          {formatBRL(pk.price_cents)}
                        </div>
                        <div className="mt-3 text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                          <Sparkles className="h-3 w-3" /> Ativação imediata via PIX
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                </>
              ) : (
                /* Catálogo de Recargas */
                recharges.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    Nenhuma opção de recarga disponível.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 max-w-xl mx-auto">
                    {recharges.map((rec) => (
                      <button
                        key={rec.id}
                        onClick={() => setSelRec(rec.id)}
                        className={cn(
                          "group relative overflow-hidden rounded-2xl border bg-gradient-to-r from-card/90 to-card/60 backdrop-blur p-4 text-left",
                          "flex items-center gap-4 transition-all hover:shadow-xl hover:-translate-y-0.5",
                        )}
                        style={{ borderColor: `${color}33` }}
                      >
                        <div
                          className="absolute inset-y-0 left-0 w-1"
                          style={{ background: `linear-gradient(to bottom, ${color}, ${color}60)` }}
                        />
                        <div
                          className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-inner"
                          style={{ background: `${color}1f`, color }}
                        >
                          <Coins className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-extrabold text-base leading-tight">
                            {rec.credits_amount} <span className="text-xs font-medium text-muted-foreground">Créditos</span>
                          </div>
                          <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1">
                            <Sparkles className="h-2.5 w-2.5" /> Recarga Imediata via PIX
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-extrabold text-lg leading-none" style={{ color }}>
                            {formatBRL(rec.price_cents)}
                          </div>
                          <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
                            à vista
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {/* Seções Adicionais */}
          {(() => {
            const s: any = store;
            const showExt = !!s.access_extension_enabled;
            const showReset = !!s.reset_device_enabled;
            const showSupport = !!s.support_enabled && !!s.support_value;
            const count = [showExt, showReset, showSupport].filter(Boolean).length;
            if (count === 0) return null;

            const gridCls =
              count === 1 ? "grid-cols-1 max-w-md mx-auto" :
              count === 2 ? "md:grid-cols-2" :
                            "md:grid-cols-2 lg:grid-cols-3";

            const supportCh = s.support_channel as "whatsapp" | "discord" | "telegram" | null;
            const supportVal: string = s.support_value ?? "";
            const supportHref =
              supportCh === "whatsapp"
                ? `https://wa.me/${supportVal.replace(/\D+/g, "")}`
                : supportVal;
            const supportLabel =
              supportCh === "whatsapp" ? "WhatsApp" :
              supportCh === "discord"  ? "Discord"  :
              supportCh === "telegram" ? "Telegram" : "Suporte";

            const SupportIcon = () => {
              if (supportCh === "whatsapp") {
                return (
                  <svg className="fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                );
              }
              if (supportCh === "discord") {
                return (
                  <svg className="fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 14.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.23 10.23 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.54-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                );
              }
              if (supportCh === "telegram") {
                return (
                  <svg className="fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.056 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.762 5.319-1.083 7.257-.136.82-.44.109-.732.136-.637.058-1.444.132-2.1.606-.642.467-1.003.739-1.61 1.144-.727.487-.256.753.158 1.18.1.103 1.935 1.77 2.27 2.148.375.423.703.623 1.066.63.259.006.598-.103.829-.339.21-.213.298-.52.298-.82l-.001-.132c.022-.246.035-.58.035-1.047 0-1.067-.03-2.18-.03-2.18l-.002-.132a.114.114 0 0 0-.062-.1c-.1-.05-.27-.039-.377-.02l-2.136.216c-.173.018-.4.018-.4-.109l-.002-.132c0-.12.1-.225.225-.225h.132c.162 0 .428-.01.428-.216 0-.206-.216-.428-.428-.428H10.1c-.21 0-.428.216-.428.428 0 .206.266.216.428.216h.132c.125 0 .225.105.225.225l-.002.132c0 .127-.227.127-.4.109l-2.136-.216c-.107-.011-.277-.03-.377.02a.114.114 0 0 0-.062.1l-.002.132c0 0-.03 1.113-.03 2.18 0 .467.013.801.035 1.047l-.001.132c0 .3-.088.607-.298.82-.231.236-.57.345-.829.339-.363-.007-.691-.207-1.066-.63-.335-.378-2.17-2.045-2.27-2.148-.414-.427-.885-.693-.158-1.18.607-.405.968-.677 1.61-1.144.656-.474 1.463-.548 2.1-.606.292-.027.596-.027.732-.136.321-1.938.903-5.359 1.083-7.257.016-.166.004-.379.02-.472a.506.506 0 0 1 .171-.325c.144-.117.365-.142.465-.14z"/>
                  </svg>
                );
              }
              return <MessageCircle className="h-8 w-8" />;
            };

            return (
              <div className="w-full space-y-6 mt-12 mb-8">
                {(showExt || showSupport) && (
                  <div className={cn(
                    "grid gap-4",
                    (showExt && showSupport) ? "grid-cols-2" : "max-w-md mx-auto"
                  )}>
                    {showExt && (
                      <section>
                        <div
                          className="relative h-full overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-md p-5 text-center transition-all hover:shadow-2xl hover:bg-card/60 group border-white/10"
                          style={{ borderColor: `${color}25` }}
                        >
                          <div
                            className="absolute -top-10 -right-10 h-40 w-40 rounded-full blur-[80px] opacity-[0.08] transition-all group-hover:opacity-20 group-hover:scale-110"
                            style={{ background: color }}
                          />
                          <div className="relative z-10 flex flex-col h-full">
                            <div
                              className="mb-4 mx-auto inline-flex items-center justify-center w-12 h-12 rounded-2xl shadow-md transform transition-transform group-hover:scale-110 group-hover:rotate-3"
                              style={{ background: `linear-gradient(135deg, ${color}cc, ${color}80)`, color: '#fff' }}
                            >
                              <Download className="h-6 w-6" />
                            </div>
                            <h2 className="text-base font-bold tracking-tight mb-1">Acessar Extensão</h2>
                            <p className="text-[11px] text-muted-foreground mb-4 flex-1 leading-relaxed">
                              Baixe a versão mais recente e comece a usar agora.
                            </p>
                            <Button
                              size="sm"
                              onClick={handleAccessExtension}
                              disabled={downloadingExt}
                              className="w-full h-10 font-bold transition-all hover:brightness-110 active:scale-95 shadow-md"
                              style={{ background: `linear-gradient(135deg, ${color}e6, ${color}b3)`, color: '#fff' }}
                            >
                              {downloadingExt ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-4 w-4" />
                              )}
                              Baixar
                            </Button>
                          </div>
                        </div>
                      </section>
                    )}

                    {showSupport && (
                      <section>
                        <div
                          className="relative h-full overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-md p-5 text-center transition-all hover:shadow-2xl hover:bg-card/60 group"
                          style={{ borderColor: `${color}35` }}
                        >
                          <div
                            className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full blur-[80px] opacity-[0.1] transition-all group-hover:opacity-25"
                            style={{ background: color }}
                          />
                          <div className="relative z-10 flex flex-col h-full items-center">
                            <div
                              className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-2xl shadow-md transform transition-all group-hover:scale-110 group-hover:rotate-6"
                              style={{ background: `linear-gradient(135deg, ${color}cc, ${color}80)`, color: '#fff' }}
                            >
                              <div className="h-6 w-6">
                                <SupportIcon />
                              </div>
                            </div>
                            <h2 className="text-base font-bold tracking-tight mb-1">Suporte Rápido</h2>
                            <p className="text-[11px] text-muted-foreground mb-4 flex-1 leading-relaxed">
                              Nossa equipe está online para te ajudar agora.
                            </p>
                            <Button
                              size="sm"
                              asChild
                              className="w-full h-10 font-bold transition-all hover:brightness-110 active:scale-95 shadow-md"
                              style={{ background: `linear-gradient(135deg, ${color}e6, ${color}b3)`, color: '#fff' }}
                            >
                              <a href={supportHref} target="_blank" rel="noopener noreferrer">
                                <div className="mr-2 h-4 w-4">
                                  <SupportIcon />
                                </div>
                                {supportLabel}
                              </a>
                            </Button>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                )}

                {showReset && activeTab === "extension" && (
                  <section className="max-w-md mx-auto w-full">
                    <div
                      className="relative h-full overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-md p-6 text-center transition-all hover:shadow-xl hover:bg-card/60 group"
                      style={{ borderColor: `${color}30` }}
                    >
                      <div
                        className="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-[80px] opacity-10 transition-opacity group-hover:opacity-20"
                        style={{ background: color }}
                      />
                      <div className="relative z-10 flex flex-col h-full">
                        <div
                          className="mb-4 mx-auto inline-flex items-center justify-center w-12 h-12 rounded-xl"
                          style={{ background: `${color}15`, color }}
                        >
                          <RefreshCw className={cn("h-6 w-6", resetting && "animate-spin")} />
                        </div>
                        <h2 className="text-xl font-bold tracking-tight mb-2">Liberar Dispositivo</h2>
                        <p className="text-xs text-muted-foreground mb-6">
                          Libere o acesso da sua licença para usar em um novo computador.
                        </p>
                        <div className="space-y-3 mt-auto">
                          <div className="relative">
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Sua chave de licença"
                              value={resetKey}
                              onChange={(e) => setResetKey(e.target.value)}
                              className="pl-9 h-10 text-xs bg-background/50 border-border/50"
                            />
                          </div>
                          <Button
                            variant="outline"
                            className="w-full h-11 font-semibold transition-all hover:scale-[1.02]"
                            onClick={handleResetDevice}
                            disabled={resetting}
                            style={{ borderColor: `${color}40`, color }}
                          >
                            {resetting ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Liberar Agora
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {showReset && activeTab === "recharge" && (
                  <section className="max-w-md mx-auto w-full">
                    <div
                      className="relative h-full overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-md p-6 text-center transition-all hover:shadow-xl hover:bg-card/60 group"
                      style={{ borderColor: `${color}30` }}
                    >
                      <div
                        className="absolute bottom-0 left-0 h-32 w-32 rounded-full blur-[80px] opacity-10 transition-opacity group-hover:opacity-20"
                        style={{ background: color }}
                      />
                      <div className="relative z-10 flex flex-col h-full">
                        <div
                          className="mb-4 mx-auto inline-flex items-center justify-center w-12 h-12 rounded-xl"
                          style={{ background: `${color}15`, color }}
                        >
                          <QrCode className="h-6 w-6" />
                        </div>
                        <h2 className="text-xl font-bold tracking-tight mb-2">Verificar Pedido</h2>
                        <p className="text-xs text-muted-foreground mb-6">
                          Acompanhe o status da sua recarga informando o ID do pedido.
                        </p>
                        <div className="space-y-3 mt-auto">
                          <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              placeholder="ID do pedido"
                              value={checkOrderId}
                              onChange={(e) => setCheckOrderId(e.target.value)}
                              className="pl-9 h-10 text-xs bg-background/50 border-border/50"
                            />
                          </div>
                          <Button
                            variant="outline"
                            className="w-full h-11 font-semibold transition-all hover:scale-[1.02]"
                            onClick={handleCheckOrder}
                            disabled={checkingOrder}
                            style={{ borderColor: `${color}40`, color }}
                          >
                            {checkingOrder ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Verificar Agora
                          </Button>
                          {checkedOrder && (
                            <div
                              className="mt-2 rounded-lg border bg-background/40 p-3 text-left text-xs space-y-1"
                              style={{ borderColor: `${color}30` }}
                            >
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Status</span>
                                <span className="font-bold uppercase" style={{ color }}>
                                  {checkedOrder.status === "completed"
                                    ? "Concluído"
                                    : checkedOrder.status === "failed"
                                    ? "Falhou"
                                    : checkedOrder.status === "pending"
                                    ? "Pendente"
                                    : checkedOrder.status}
                                </span>
                              </div>
                              {checkedOrder.buyer_name && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Comprador</span>
                                  <span className="font-medium">{checkedOrder.buyer_name}</span>
                                </div>
                              )}
                              {typeof checkedOrder.price_cents === "number" && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Valor</span>
                                  <span className="font-medium">
                                    {(checkedOrder.price_cents / 100).toLocaleString("pt-BR", {
                                      style: "currency",
                                      currency: "BRL",
                                    })}
                                  </span>
                                </div>
                              )}
                              {checkedOrder.paid_at && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Pago em</span>
                                  <span className="font-medium">
                                    {new Date(checkedOrder.paid_at).toLocaleString("pt-BR")}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {testimonials.length > 0 && (
                  <section className="w-full mt-12">
                    <div className="flex flex-col items-center gap-2 mb-8 text-center">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20">
                        <Quote className="h-3 w-3" /> Clientes Satisfeitos
                      </div>
                      <h2 className="text-2xl font-black uppercase tracking-tight">O que dizem sobre nós</h2>
                    </div>
                    <Carousel opts={{ align: "start", loop: true }} className="w-full">
                      <CarouselContent className="-ml-3">
                        {testimonials.map((t) => (
                          <CarouselItem key={t.id} className="pl-3 md:basis-1/2">
                            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/30 backdrop-blur-xl p-6 transition-all hover:bg-card/50 h-full">
                              <div className="flex gap-1 text-yellow-500 mb-3">
                                {Array.from({ length: t.rating }).map((_, i) => (
                                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                                ))}
                              </div>
                              <p className="text-sm italic text-muted-foreground mb-4 leading-relaxed">
                                "{t.content}"
                              </p>
                              <div className="flex items-center gap-3">
                                <div
                                  className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm text-white border border-white/10"
                                  style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}
                                >
                                  {t.customer_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold tracking-tight">{t.customer_name}</span>
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Cliente Verificado</span>
                                </div>
                              </div>
                            </div>
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                      {testimonials.length > 1 && (
                        <>
                          <CarouselPrevious className="hidden sm:flex -left-4 bg-card/60 border-white/10" />
                          <CarouselNext className="hidden sm:flex -right-4 bg-card/60 border-white/10" />
                        </>
                      )}
                    </Carousel>
                  </section>
                )}
              </div>
            );
          })()}
        </main>

        <footer className="mt-16 text-center text-xs text-muted-foreground space-y-1">
          <div>Loja oficial de {reseller.display_name}</div>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="underline underline-offset-2 hover:text-destructive transition-colors"
          >
            Denunciar loja
          </button>
        </footer>
      </div>

      <ReportStoreDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        resellerId={reseller.id}
        resellerName={reseller.display_name}
      />
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent className="bg-black/95 border-white/10 text-white backdrop-blur-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display text-xl font-black uppercase tracking-tight text-primary">
              <AlertTriangle className="h-6 w-6" /> Confirmação de Reset
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-medium leading-relaxed pt-2">
              Você está prestes a liberar o vínculo desta licença. <br /><br />
              <span className="font-black text-white uppercase tracking-tighter bg-primary/10 px-2 py-0.5 rounded">Atenção:</span> A guarda e o sigilo da sua chave são de sua <span className="font-bold text-white underline underline-offset-4">responsabilidade própria</span>. Evite compartilhar sua chave com terceiros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 pt-4">
            <AlertDialogCancel className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] h-10 px-6">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmReset}
              className="rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[10px] h-10 px-6 shadow-red-glow hover:shadow-red-glow-lg transition-all"
            >
              Confirmar e Resetar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={securityNoticeOpen} onOpenChange={setSecurityConfirmOpen}>
        <AlertDialogContent className="bg-black/95 border-white/10 text-white backdrop-blur-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-display text-xl font-black uppercase tracking-tight text-emerald-500">
              <ShieldCheck className="h-6 w-6" /> Segurança da Chave
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground font-medium leading-relaxed pt-2">
              Você acha que outra pessoa tem acesso à sua chave? <br /><br />
              Se suspeitar de uso indevido ou compartilhamento não autorizado, procure nosso suporte imediatamente para avaliarmos a situação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-3 pt-4">
            <AlertDialogCancel className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] h-10 px-6 sm:mt-0">
              Entendi
            </AlertDialogCancel>
            <AlertDialogAction 
              asChild
              className="rounded-xl bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] h-10 px-6 shadow-glow-sm hover:bg-indigo-500 transition-all cursor-pointer"
            >
              <a href="https://wa.me/5543996877745" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center">
                Suporte no WhatsApp <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
