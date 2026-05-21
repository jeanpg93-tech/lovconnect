import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Save, Upload, Download, ExternalLink, Copy, ImageIcon, AlertTriangle,
  CheckCircle2, Grid3x3, Circle, Flame, LayoutGrid, List, Square,
  Chrome, KeyRound, LifeBuoy, MessageCircle, Settings, Palette,
  ShoppingBag, HelpCircle, Zap, Eye, Globe, MessageSquare, Star, Trash2, Plus,
  TrendingUp, Users, DollarSign, Calendar, Package, Coins,
  Dot, Waves, Sparkles, Sun, Hexagon, Triangle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StorefrontPreview } from "@/components/storefront/StorefrontPreview";
import { StorefrontVisualEffects, VISUAL_EFFECTS, type VisualEffect } from "@/components/storefront/StorefrontVisualEffects";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';

type BgEffect = "none" | "grid" | "circles" | "flames" | "dots" | "waves" | "aurora" | "stars" | "mesh" | "rays";
type LayoutMode = "grid" | "list";

const BG_OPTIONS: { value: BgEffect; label: string; icon: any; desc: string }[] = [
  { value: "none",    label: "Liso",         icon: Square,   desc: "Sem efeito" },
  { value: "grid",    label: "Quadriculado", icon: Grid3x3,  desc: "Linhas finas" },
  { value: "dots",    label: "Pontos",       icon: Dot,      desc: "Malha de pontos" },
  { value: "circles", label: "Círculos",     icon: Circle,   desc: "Halos coloridos" },
  { value: "flames",  label: "Chamas",       icon: Flame,    desc: "Animação ascendente" },
  { value: "waves",   label: "Ondas",        icon: Waves,    desc: "Ondulações suaves" },
  { value: "aurora",  label: "Aurora",       icon: Sparkles, desc: "Brilho fluído" },
  { value: "stars",   label: "Estrelas",     icon: Star,     desc: "Pontos brilhantes" },
  { value: "mesh",    label: "Mesh",         icon: Hexagon,  desc: "Gradiente em malha" },
  { value: "rays",    label: "Raios",        icon: Sun,      desc: "Feixes de luz" },
];

const LAYOUT_OPTIONS: { value: LayoutMode; label: string; icon: any }[] = [
  { value: "grid", label: "Grade", icon: LayoutGrid },
  { value: "list", label: "Lista", icon: List },
];

const EMOJI_LICENSES: { value: string; label: string; placeholder: string }[] = [
  { value: "pro_1d",   label: "Pro 1 dia",    placeholder: "⚡" },
  { value: "pro_7d",   label: "Pro 7 dias",   placeholder: "🚀" },
  { value: "pro_15d",  label: "Pro 15 dias",  placeholder: "🔥" },
  { value: "pro_30d",  label: "Pro 30 dias",  placeholder: "💎" },
  { value: "lifetime", label: "Vitalícia",    placeholder: "👑" },
];

export default function RevendedorMinhaLoja() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingExt, setUploadingExt] = useState(false);

  const [resellerId, setResellerId] = useState<string | null>(null);
  const [resellerSlug, setResellerSlug] = useState<string | null>(null);
  const [misticpayOk, setMisticpayOk] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [tagline, setTagline] = useState("");
  const [welcome, setWelcome] = useState("");
  const [contact, setContact] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#7c3aed");
  const [backgroundColor, setBackgroundColor] = useState("#0a0a0a");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState<number>(80);
  const [productEmojis, setProductEmojis] = useState<Record<string, string>>({});
  const [backgroundEffect, setBackgroundEffect] = useState<BgEffect>("none");
  const [visualEffect, setVisualEffect] = useState<VisualEffect>("none");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [slugDraft, setSlugDraft] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);

  const [showExtensions, setShowExtensions] = useState(true);
  const [showProducts, setShowProducts] = useState(true);
  const [showFreeTrial, setShowFreeTrial] = useState(true);
  const [showCredits, setShowCredits] = useState(true);

  const [accessExtEnabled, setAccessExtEnabled] = useState(false);
  const [accessExtMode, setAccessExtMode] = useState<"native" | "custom">("native");
  const [accessExtCustomUrl, setAccessExtCustomUrl] = useState("");
  const [resetDeviceEnabled, setResetDeviceEnabled] = useState(false);
  const [supportEnabled, setSupportEnabled] = useState(false);
  const [supportChannel, setSupportChannel] = useState<"whatsapp" | "discord" | "telegram">("whatsapp");
  const [supportValue, setSupportValue] = useState("");
  const [supportTelegramUrl, setSupportTelegramUrl] = useState("");
  const [supportDiscordUrl, setSupportDiscordUrl] = useState("");

  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [fetchingTestimonials, setFetchingTestimonials] = useState(false);
  const [addingTestimonial, setAddingTestimonial] = useState(false);
  const [newTestimonial, setNewTestimonial] = useState({ name: "", content: "", rating: 5 });
  
  type Period = "today" | "yesterday" | "week" | "month" | "all";
  const [period, setPeriod] = useState<Period>("today");
  const [stats, setStats] = useState({
    ordersToday: 0,
    sales: 0,
    revenue: 0,
    salesPrev: 0,
    revenuePrev: 0,
    conversionRate: 0,
    chartData: [] as { name: string; tentativas: number; vendas: number }[],
  });

  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      const { data: r } = await supabase
        .from("resellers")
        .select("id, slug")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!r) { setLoading(false); return; }
      setResellerId(r.id);
      setResellerSlug(r.slug);
      setSlugDraft(r.slug);

      const [{ data: store }, { data: integ }] = await Promise.all([
        supabase.from("reseller_storefronts").select("*").eq("reseller_id", r.id).maybeSingle(),
        supabase.from("reseller_integrations").select("misticpay_enabled, misticpay_client_id, misticpay_client_secret").eq("reseller_id", r.id).maybeSingle(),
      ]);

      setMisticpayOk(!!(integ?.misticpay_enabled && integ.misticpay_client_id && integ.misticpay_client_secret));

      if (store) {
        setEnabled(store.is_enabled);
        setStoreName(store.store_name ?? "");
        setTagline(store.tagline ?? "");
        setWelcome(store.welcome_message ?? "");
        setContact(store.contact_whatsapp ?? "");
        setPrimaryColor(store.primary_color ?? "#7c3aed");
        setBackgroundColor(((store as any).background_color as string) ?? "#0a0a0a");
        setLogoUrl(store.logo_url);
        setBackgroundEffect((store.background_effect as BgEffect) ?? "none");
        setVisualEffect((((store as any).visual_effect) as VisualEffect) ?? "none");
        setLayoutMode((store.layout_mode as LayoutMode) ?? "grid");
        setLogoSize((store as any).logo_size ?? 80);
        setProductEmojis(((store as any).product_emojis as Record<string, string>) ?? {});
        setShowExtensions(!!(store as any).show_extensions);
        setShowProducts(!!(store as any).show_products);
        setShowFreeTrial(!!(store as any).show_free_trial);
        setShowCredits(!!(store as any).show_credits);
        setAccessExtEnabled(!!(store as any).access_extension_enabled);
        setAccessExtMode((((store as any).access_extension_mode) ?? "native") as "native" | "custom");
        setAccessExtCustomUrl((store as any).access_extension_custom_url ?? "");
        setResetDeviceEnabled(!!(store as any).reset_device_enabled);
        setSupportEnabled(!!(store as any).support_enabled);
        setSupportChannel(((store as any).support_channel ?? "whatsapp") as "whatsapp" | "discord" | "telegram");
        setSupportValue((store as any).support_value ?? "");
        setSupportTelegramUrl((store as any).support_telegram_url ?? "");
        setSupportDiscordUrl((store as any).support_discord_url ?? "");
        fetchTestimonials(r.id);
        // fetchStats é disparado pelo useEffect dependente de resellerId/period
      } else {
        setStoreName(`Loja ${r.slug}`);
      }
      setLoading(false);
    })();
  }, [user]);

  const fetchTestimonials = async (rId: string) => {
    setFetchingTestimonials(true);
    const { data } = await supabase
      .from("storefront_testimonials")
      .select("*")
      .eq("reseller_id", rId)
      .order("created_at", { ascending: false });
    if (data) setTestimonials(data);
    setFetchingTestimonials(false);
  };

  const handleAddTestimonial = async () => {
    if (!resellerId || !newTestimonial.name || !newTestimonial.content) return;
    setAddingTestimonial(true);
    const { error } = await supabase.from("storefront_testimonials").insert({
      reseller_id: resellerId,
      customer_name: newTestimonial.name,
      content: newTestimonial.content,
      rating: newTestimonial.rating,
    });
    setAddingTestimonial(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Depoimento adicionado");
      setNewTestimonial({ name: "", content: "", rating: 5 });
      fetchTestimonials(resellerId);
    }
  };

  const handleDeleteTestimonial = async (id: string) => {
    const { error } = await supabase.from("storefront_testimonials").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Depoimento removido");
      if (resellerId) fetchTestimonials(resellerId);
    }
  };

  const fetchStats = async (rId: string, periodArg: Period = period) => {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);

    let rangeStart: Date;
    let rangeEnd: Date = endToday;
    let prevStart: Date;
    let prevEnd: Date;
    let buckets: { start: Date; end: Date; label: string }[] = [];

    if (periodArg === "today") {
      rangeStart = startToday;
      prevStart = new Date(startToday); prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(prevStart); prevEnd.setHours(23, 59, 59, 999);
      buckets = Array.from({ length: 24 }).map((_, h) => {
        const s = new Date(startToday); s.setHours(h, 0, 0, 0);
        const e = new Date(startToday); e.setHours(h, 59, 59, 999);
        return { start: s, end: e, label: String(h).padStart(2, "0") + "h" };
      });
    } else if (periodArg === "yesterday") {
      rangeStart = new Date(startToday); rangeStart.setDate(rangeStart.getDate() - 1);
      rangeEnd = new Date(rangeStart); rangeEnd.setHours(23, 59, 59, 999);
      prevStart = new Date(rangeStart); prevStart.setDate(prevStart.getDate() - 1);
      prevEnd = new Date(prevStart); prevEnd.setHours(23, 59, 59, 999);
      buckets = Array.from({ length: 24 }).map((_, h) => {
        const s = new Date(rangeStart); s.setHours(h, 0, 0, 0);
        const e = new Date(rangeStart); e.setHours(h, 59, 59, 999);
        return { start: s, end: e, label: String(h).padStart(2, "0") + "h" };
      });
    } else if (periodArg === "week") {
      rangeStart = new Date(startToday); rangeStart.setDate(rangeStart.getDate() - 6);
      prevStart = new Date(rangeStart); prevStart.setDate(prevStart.getDate() - 7);
      prevEnd = new Date(rangeStart); prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
      const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      buckets = Array.from({ length: 7 }).map((_, i) => {
        const s = new Date(rangeStart); s.setDate(s.getDate() + i); s.setHours(0, 0, 0, 0);
        const e = new Date(s); e.setHours(23, 59, 59, 999);
        return { start: s, end: e, label: dayNames[s.getDay()] };
      });
    } else if (periodArg === "month") {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const days = Math.ceil((endToday.getTime() - rangeStart.getTime()) / 86400000) + 1;
      buckets = Array.from({ length: days }).map((_, i) => {
        const s = new Date(rangeStart); s.setDate(s.getDate() + i); s.setHours(0, 0, 0, 0);
        const e = new Date(s); e.setHours(23, 59, 59, 999);
        return { start: s, end: e, label: String(s.getDate()).padStart(2, "0") };
      });
    } else {
      // all
      rangeStart = new Date(2020, 0, 1);
      prevStart = new Date(2020, 0, 1);
      prevEnd = new Date(2020, 0, 1);
      const months = (now.getFullYear() - 2020) * 12 + now.getMonth() + 1;
      const start = new Date(2020, 0, 1);
      buckets = Array.from({ length: Math.min(months, 24) }).map((_, i) => {
        const idx = Math.max(0, months - Math.min(months, 24)) + i;
        const s = new Date(start.getFullYear(), start.getMonth() + idx, 1);
        const e = new Date(start.getFullYear(), start.getMonth() + idx + 1, 0, 23, 59, 59, 999);
        return { start: s, end: e, label: s.toLocaleDateString("pt-BR", { month: "short" }) };
      });
      // Adjust rangeStart to first bucket for query efficiency
      if (buckets.length > 0) rangeStart = buckets[0].start;
    }

    const fetchStart = new Date(Math.min(rangeStart.getTime(), prevStart.getTime()));
    const { data: ordersAll } = await supabase
      .from("storefront_orders")
      .select("created_at, status, price_cents, paid_at")
      .eq("reseller_id", rId)
      .gte("created_at", fetchStart.toISOString())
      .order("created_at", { ascending: false });

    const list = ordersAll ?? [];
    const isPaid = (o: any) => o.status === "paid" || !!o.paid_at;
    const inRange = (o: any) => {
      const d = new Date(o.created_at);
      return d >= rangeStart && d <= rangeEnd;
    };
    const inPrev = (o: any) => {
      const d = new Date(o.created_at);
      return d >= prevStart && d <= prevEnd;
    };

    const current = list.filter(inRange);
    const previous = list.filter(inPrev);

    const ordersToday = list.filter(o => {
      const d = new Date(o.created_at);
      return d >= startToday && d <= endToday;
    }).length;

    const sales = current.filter(isPaid).length;
    const revenue = current.filter(isPaid).reduce((s, o) => s + Number(o.price_cents ?? 0), 0) / 100;
    const salesPrev = previous.filter(isPaid).length;
    const revenuePrev = previous.filter(isPaid).reduce((s, o) => s + Number(o.price_cents ?? 0), 0) / 100;
    const conversionRate = current.length > 0 ? (sales / current.length) * 100 : 0;

    const chartData = buckets.map(b => {
      const items = list.filter(o => {
        const d = new Date(o.created_at);
        return d >= b.start && d <= b.end;
      });
      return {
        name: b.label,
        tentativas: items.length,
        vendas: items.filter(isPaid).length,
      };
    });

    setStats({ ordersToday, sales, revenue, salesPrev, revenuePrev, conversionRate, chartData });
  };

  useEffect(() => {
    if (resellerId) fetchStats(resellerId, period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, resellerId]);

  const handleLogoUpload = async (file: File) => {
    if (!resellerId) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${resellerId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("storefront-assets")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("storefront-assets").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      toast.success("Logo enviada");
    } catch (e: any) {
      toast.error(e.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  const handleExtensionUpload = async (file: File) => {
    if (!resellerId) return;
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 100MB)");
      return;
    }
    setUploadingExt(true);
    try {
      const ext = file.name.split(".").pop() ?? "zip";
      const path = `${resellerId}/extension-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("storefront-assets")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type || "application/zip" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("storefront-assets").getPublicUrl(path);
      setAccessExtCustomUrl(data.publicUrl);
      toast.success("Extensão enviada");
    } catch (e: any) {
      toast.error(e.message ?? "Falha no upload");
    } finally {
      setUploadingExt(false);
    }
  };

  const save = async () => {
    if (!resellerId) return;
    if (enabled && storeName.trim().length < 2) {
      toast.error("Defina um nome para a loja");
      return;
    }
    setSaving(true);
    const payload = {
      reseller_id: resellerId,
      is_enabled: enabled,
      store_name: storeName.trim(),
      tagline: tagline.trim() || null,
      welcome_message: welcome.trim() || null,
      contact_whatsapp: contact.replace(/\D+/g, "") || null,
      primary_color: primaryColor,
      background_color: backgroundColor,
      logo_url: logoUrl,
      background_effect: backgroundEffect,
      visual_effect: visualEffect,
      layout_mode: layoutMode,
      logo_size: logoSize,
      product_emojis: productEmojis,
      show_extensions: showExtensions,
      show_products: showProducts,
      show_free_trial: showFreeTrial,
      show_credits: showCredits,
      access_extension_enabled: accessExtEnabled,
      access_extension_mode: accessExtMode,
      access_extension_custom_url: accessExtCustomUrl.trim() || null,
      reset_device_enabled: resetDeviceEnabled,
      support_enabled: supportEnabled,
      support_channel: supportEnabled ? supportChannel : null,
      support_value: supportEnabled
        ? (supportChannel === "whatsapp"
            ? (supportValue.replace(/\D+/g, "") || null)
            : (supportValue.trim() || null))
        : null,
      support_telegram_url: supportTelegramUrl.trim() || null,
      support_discord_url: supportDiscordUrl.trim() || null,
    };
    const { error } = await supabase
      .from("reseller_storefronts")
      .upsert(payload, { onConflict: "reseller_id" });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Loja salva");
  };

  const saveSlug = async () => {
    if (!resellerId) return;
    const cleaned = slugify(slugDraft);
    if (cleaned.length < 3) {
      toast.error("O link deve ter ao menos 3 caracteres (a-z, 0-9, hífen)");
      return;
    }
    if (cleaned === resellerSlug) return;
    setSavingSlug(true);
    const { data: existing } = await supabase
      .from("resellers").select("id").eq("slug", cleaned).maybeSingle();
    if (existing && existing.id !== resellerId) {
      setSavingSlug(false);
      toast.error("Esse link já está em uso, escolha outro");
      return;
    }
    const { error } = await supabase
      .from("resellers").update({ slug: cleaned }).eq("id", resellerId);
    setSavingSlug(false);
    if (error) { toast.error(error.message); return; }
    setResellerSlug(cleaned);
    setSlugDraft(cleaned);
    toast.success("Link da loja atualizado");
  };

  const publicUrl = resellerSlug ? `${window.location.origin}/loja/${resellerSlug}` : "";

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 pb-20">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Sua Vitrine"
            description="Gerencie a apresentação pública da sua loja."
          />
          <div className="flex items-center gap-2">
            <Badge variant={enabled ? "default" : "secondary"} className="h-6 px-3 text-[10px] font-black uppercase tracking-wider">
              {enabled ? "Loja Online" : "Loja Offline"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">Resumo</h2>
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="w-[180px] h-9 text-xs font-bold">
            <Calendar className="h-3.5 w-3.5 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="yesterday">Ontem</SelectItem>
            <SelectItem value="week">Essa semana</SelectItem>
            <SelectItem value="month">Esse mês</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ShoppingBag className="h-3.5 w-3.5 text-primary" /> Pedidos (Hoje)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">{stats.ordersToday}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-1">
              Tentativas iniciadas hoje
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ShoppingBag className="h-3.5 w-3.5 text-blue-500" /> Vendas Realizadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">{stats.sales}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-1">
              {period === "today" ? "Hoje" : period === "yesterday" ? "Ontem" : period === "week" ? "Esta semana (7d)" : period === "month" ? "Este mês" : "Histórico total"}
              {stats.salesPrev > 0 && period !== "all" && ` · período anterior: ${stats.salesPrev}`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-emerald-500" /> Faturamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black">R$ {stats.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-1">
              Soma do preço de venda · Conversão: {stats.conversionRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Globe className="h-3.5 w-3.5 text-primary" /> Status da Loja
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant={enabled ? "default" : "secondary"} className="h-5 px-2 text-[10px] font-black uppercase">
                {enabled ? "Online" : "Offline"}
              </Badge>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <a href={publicUrl} target="_blank" rel="noreferrer" className="text-[10px] font-mono truncate block text-primary hover:underline">
              {resellerSlug ? `/${resellerSlug}` : "Sem link"}
            </a>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden border-primary/20 shadow-md">
            <CardHeader className="border-b bg-muted/30 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" /> Desempenho da Vitrine
                  </CardTitle>
                  <CardDescription className="text-xs">Visitas e conversões nos últimos 7 dias</CardDescription>
                </div>
                <div className="flex gap-1 bg-muted p-1 rounded-md h-8 items-center">
                  <div className="px-3 py-1 bg-background text-[10px] font-bold uppercase rounded-sm shadow-sm">Tentativas</div>
                  <div className="px-3 py-1 bg-background text-[10px] font-bold uppercase rounded-sm shadow-sm">Vendas</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.chartData}>
                    <defs>
                      <linearGradient id="colorTentativas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={primaryColor} stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888820" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 600 }}
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                      }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="tentativas" 
                      stroke={primaryColor} 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorTentativas)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="vendas" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorVendas)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Accordion type="single" collapsible className="w-full space-y-4">
            <AccordionItem value="geral" className="border rounded-xl px-4 bg-card shadow-sm overflow-hidden transition-all hover:shadow-md">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">Domínio e Acesso</div>
                    <div className="text-[10px] text-muted-foreground font-medium">Link público e status da vitrine</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-6 pt-2">
                <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold">Visibilidade da Loja</div>
                      <div className="text-xs text-muted-foreground">Controle se a loja está acessível ao público.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={enabled ? "default" : "secondary"} className="text-[10px] font-black uppercase">
                        {enabled ? "Ativa" : "Pausada"}
                      </Badge>
                      <Switch checked={enabled} onCheckedChange={setEnabled} />
                    </div>
                  </div>
                  
                  {resellerSlug && (
                    <div className="space-y-3 pt-3 border-t border-dashed">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">URL da sua Vitrine</Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex flex-1 items-center rounded-lg border bg-background overflow-hidden h-11 px-3">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground mr-2" />
                          <code className="flex-1 truncate text-xs font-mono font-bold">{publicUrl}</code>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="secondary" className="h-11 px-4 font-bold text-xs rounded-lg" onClick={() => {
                            navigator.clipboard.writeText(publicUrl);
                            toast.success("Link copiado!");
                          }}>
                            <Copy className="h-3.5 w-3.5 mr-2" /> Copiar
                          </Button>
                          <Button variant="outline" className="h-11 px-4 font-bold text-xs rounded-lg" asChild>
                            <a href={publicUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-2" /> Visitar
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 pt-3 border-t border-dashed">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Personalizar Slug</Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="flex flex-1 items-center rounded-lg border bg-background overflow-hidden h-11">
                        <span className="px-3 h-full flex items-center text-[10px] font-black text-muted-foreground bg-muted border-r uppercase">/loja/</span>
                        <Input
                          value={slugDraft}
                          onChange={(e) => setSlugDraft(slugify(e.target.value))}
                          placeholder="minha-loja"
                          className="border-0 focus-visible:ring-0 font-mono text-xs h-full"
                        />
                      </div>
                      <Button
                        variant="default"
                        className="h-11 font-bold text-xs rounded-lg bg-primary text-primary-foreground"
                        onClick={saveSlug}
                        disabled={savingSlug || slugDraft === resellerSlug}
                      >
                        {savingSlug ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                        Salvar Novo Link
                      </Button>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="identidade" className="border rounded-xl px-4 bg-card shadow-sm overflow-hidden transition-all hover:shadow-md">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                    <Palette className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">Branding e Design</div>
                    <div className="text-[10px] text-muted-foreground font-medium">Cores, logo e identidade visual</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pb-6 pt-2">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider">Nome da Loja</Label>
                      <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Ex: Premium Tools" className="rounded-lg h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider">Slogan da Vitrine</Label>
                      <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="As melhores ferramentas em um só lugar" className="rounded-lg h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider">Cor Principal</Label>
                      <div className="flex gap-2">
                        <div className="h-11 w-11 rounded-lg border p-1 shrink-0 bg-background overflow-hidden">
                          <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-full w-full cursor-pointer bg-transparent" />
                        </div>
                        <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono h-11 rounded-lg" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider">Cor do Fundo</Label>
                      <div className="flex gap-2">
                        <div className="h-11 w-11 rounded-lg border p-1 shrink-0 bg-background overflow-hidden">
                          <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="h-full w-full cursor-pointer bg-transparent" />
                        </div>
                        <Input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="font-mono h-11 rounded-lg" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider">Logotipo da Loja</Label>
                      <div className="flex items-center gap-4 p-4 rounded-xl border bg-muted/20">
                        <div className="h-16 w-16 rounded-xl border bg-background flex items-center justify-center overflow-hidden shadow-inner">
                          {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-2" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
                        </div>
                        <div className="flex flex-col gap-2 flex-1">
                          <label className="cursor-pointer">
                            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
                            <Button variant="secondary" className="w-full h-9 text-xs font-bold rounded-lg" asChild disabled={uploading}>
                              <span>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-2" />} {logoUrl ? "Trocar Logo" : "Upload"}</span>
                            </Button>
                          </label>
                          {logoUrl && <Button variant="ghost" className="h-8 text-xs font-bold text-destructive hover:bg-destructive/10" onClick={() => setLogoUrl(null)}>Remover</Button>}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tamanho da Logo</Label>
                        <span className="text-[10px] font-mono font-bold text-primary">{logoSize}px</span>
                      </div>
                      <input type="range" min={48} max={200} step={4} value={logoSize} onChange={e => setLogoSize(Number(e.target.value))} className="w-full accent-primary h-2 bg-muted rounded-full appearance-none cursor-pointer" />
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tema" className="border rounded-xl px-4 bg-card shadow-sm overflow-hidden transition-all hover:shadow-md">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">Tema e Layout</div>
                    <div className="text-[10px] text-muted-foreground font-medium">Efeitos de fundo e visualização</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pb-6 pt-2">
                <div className="space-y-4">
                  <Label className="text-xs font-bold uppercase tracking-wider">Estilo do Fundo</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {BG_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const active = backgroundEffect === opt.value;
                      return (
                        <button key={opt.value} onClick={() => setBackgroundEffect(opt.value)} className={cn("flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center", active ? "bg-primary/10 border-primary ring-1 ring-primary/20" : "bg-muted/30 border-transparent hover:border-muted-foreground/30")}>
                          <div className={cn("p-2 rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}><Icon className="h-4 w-4" /></div>
                          <span className="text-[10px] font-bold uppercase">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-dashed">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider">Efeito Visual em Tempo Real</Label>
                    <p className="text-[11px] text-muted-foreground mt-1">Animação que aparece sobre toda a loja para os clientes.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {VISUAL_EFFECTS.map((opt) => {
                      const active = visualEffect === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setVisualEffect(opt.value)}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center",
                            active
                              ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                              : "bg-muted/30 border-transparent hover:border-muted-foreground/30"
                          )}
                          title={opt.desc}
                        >
                          <span className="text-xl leading-none">{opt.emoji}</span>
                          <span className="text-[10px] font-bold uppercase">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-dashed">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider">Preview da Loja</Label>
                    <Badge variant="outline" className="text-[10px] font-bold">Modo Desktop</Badge>
                  </div>
                  <div className="rounded-xl overflow-hidden border shadow-inner bg-black/5 p-2">
                    <StorefrontPreview 
                      effect={backgroundEffect} 
                      layout={layoutMode} 
                      color={primaryColor} 
                      storeName={storeName} 
                      tagline={tagline} 
                      logoUrl={logoUrl} 
                      showExtensions={showExtensions}
                      showProducts={showProducts}
                      showFreeTrial={showFreeTrial}
                      showCredits={showCredits}
                      visualEffect={visualEffect}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="produtos" className="border rounded-xl px-4 bg-card shadow-sm overflow-hidden transition-all hover:shadow-md">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-pink-500/10 text-pink-500">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">Produtos e Itens</div>
                    <div className="text-[10px] text-muted-foreground font-medium">Controle a visibilidade de produtos e vendas</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pb-6 pt-2">
                <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold flex items-center gap-2">
                        <Coins className="h-3.5 w-3.5 text-emerald-500" /> Venda de Recarga na conta
                      </div>
                      <div className="text-xs text-muted-foreground">Permite que clientes comprem créditos diretamente.</div>
                    </div>
                    <Switch checked={showCredits} onCheckedChange={setShowCredits} />
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-dashed">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold flex items-center gap-2">
                        <KeyRound className="h-3.5 w-3.5 text-blue-500" /> Venda de Chaves da extensão
                      </div>
                      <div className="text-xs text-muted-foreground">Exibe o catálogo de chaves/licenças para compra.</div>
                    </div>
                    <Switch checked={showExtensions} onCheckedChange={setShowExtensions} />
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-dashed">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-yellow-500" /> Teste da chave da extensão
                      </div>
                      <div className="text-xs text-muted-foreground">Exibe o botão para solicitação de teste gratuito.</div>
                    </div>
                    <Switch checked={showFreeTrial} onCheckedChange={setShowFreeTrial} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="suporte" className="border rounded-xl px-4 bg-card shadow-sm overflow-hidden transition-all hover:shadow-md">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">Atendimento e Canais</div>
                    <div className="text-[10px] text-muted-foreground font-medium">Como seus clientes falam com você</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pb-6 pt-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase tracking-wider">Boas-vindas (Pop-up)</Label>
                    <Textarea value={welcome} onChange={e => setWelcome(e.target.value)} placeholder="Olá! Seja bem-vindo à nossa loja oficial..." className="min-h-[100px] rounded-xl resize-none" />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><MessageCircle className="h-3 w-3 text-green-500" /> WhatsApp</Label>
                      <Input value={contact} onChange={e => setContact(e.target.value)} placeholder="(11) 99999-9999" className="h-11 rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Plus className="h-3 w-3 text-blue-500" /> Telegram (Opcional)</Label>
                      <Input value={supportTelegramUrl} onChange={e => setSupportTelegramUrl(e.target.value)} placeholder="t.me/seuusuario" className="h-11 rounded-lg" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><LifeBuoy className="h-3 w-3 text-indigo-500" /> Discord (Opcional)</Label>
                      <Input value={supportDiscordUrl} onChange={e => setSupportDiscordUrl(e.target.value)} placeholder="discord.gg/link" className="h-11 rounded-lg" />
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="extensao" className="border rounded-xl px-4 bg-card shadow-sm overflow-hidden transition-all hover:shadow-md">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Chrome className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">Download da Extensão</div>
                    <div className="text-[10px] text-muted-foreground font-medium">Como o cliente baixa a extensão na sua loja</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 pb-6 pt-2">
                <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-bold flex items-center gap-2">
                        <Download className="h-3.5 w-3.5 text-indigo-500" /> Botão "Acessar Extensão"
                      </div>
                      <div className="text-xs text-muted-foreground">Mostra o card de download na loja pública.</div>
                    </div>
                    <Switch checked={accessExtEnabled} onCheckedChange={setAccessExtEnabled} />
                  </div>

                  {accessExtEnabled && (
                    <div className="space-y-4 pt-3 border-t border-dashed">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider">Origem do arquivo</Label>
                        <p className="text-[11px] text-muted-foreground mt-1">Escolha qual extensão será entregue ao cliente final.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setAccessExtMode("native")}
                          className={cn(
                            "text-left rounded-xl border p-4 transition-all",
                            accessExtMode === "native"
                              ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                              : "bg-background border-transparent hover:border-muted-foreground/30"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className={cn("h-4 w-4", accessExtMode === "native" ? "text-primary" : "text-muted-foreground")} />
                            <span className="text-sm font-bold">Versão oficial</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Usa sempre a extensão mais recente publicada pelo gerente. Atualiza automaticamente.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAccessExtMode("custom")}
                          className={cn(
                            "text-left rounded-xl border p-4 transition-all",
                            accessExtMode === "custom"
                              ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                              : "bg-background border-transparent hover:border-muted-foreground/30"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Upload className={cn("h-4 w-4", accessExtMode === "custom" ? "text-primary" : "text-muted-foreground")} />
                            <span className="text-sm font-bold">Minha extensão (upload)</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Envie seu próprio .zip personalizado. Você é responsável por mantê-lo atualizado.
                          </p>
                        </button>
                      </div>

                      {accessExtMode === "custom" && (
                        <div className="space-y-3 rounded-xl border border-dashed bg-background p-4">
                          <Label className="text-xs font-bold uppercase tracking-wider">Arquivo .zip da extensão</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="file"
                              accept=".zip,application/zip,application/x-zip-compressed"
                              disabled={uploadingExt}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleExtensionUpload(f);
                              }}
                              className="cursor-pointer"
                            />
                            {uploadingExt && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                          </div>
                          <div>
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ou cole uma URL pública (.zip)</Label>
                            <Input
                              value={accessExtCustomUrl}
                              onChange={(e) => setAccessExtCustomUrl(e.target.value)}
                              placeholder="https://exemplo.com/minha-extensao.zip"
                              className="mt-1 font-mono text-xs"
                            />
                          </div>
                          {accessExtCustomUrl && (
                            <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 break-all">
                              <CheckCircle2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">Arquivo configurado</span>
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            Tamanho máximo: 100MB. Apenas arquivos .zip são aceitos.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>


            <AccordionItem value="depoimentos" className="border rounded-xl px-4 bg-card shadow-sm overflow-hidden transition-all hover:shadow-md">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                    <Star className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold">Prova Social</div>
                    <div className="text-[10px] text-muted-foreground font-medium">Gerenciar depoimentos de clientes</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pb-6 pt-2">
                <div className="grid gap-6 md:grid-cols-5">
                  <div className="md:col-span-2 space-y-4">
                    <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                      <div className="text-xs font-black uppercase tracking-widest text-primary">Novo Depoimento</div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase">Nome do Cliente</Label>
                          <Input value={newTestimonial.name} onChange={e => setNewTestimonial({...newTestimonial, name: e.target.value})} placeholder="Ex: Lucas Ribeiro" className="h-10 text-xs" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase">Nota</Label>
                          <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <button key={s} onClick={() => setNewTestimonial({...newTestimonial, rating: s})} className={cn("p-1 transition-all hover:scale-110", newTestimonial.rating >= s ? "text-yellow-500" : "text-muted-foreground/30")}>
                                <Star className={cn("h-5 w-5", newTestimonial.rating >= s && "fill-current")} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase">Mensagem</Label>
                          <Textarea value={newTestimonial.content} onChange={e => setNewTestimonial({...newTestimonial, content: e.target.value})} placeholder="O que o cliente disse?" className="text-xs resize-none" rows={3} />
                        </div>
                        <Button className="w-full h-10 font-bold text-xs" onClick={handleAddTestimonial} disabled={addingTestimonial || !newTestimonial.name}>
                          {addingTestimonial ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Plus className="h-3 w-3 mr-2" />} Adicionar
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-3 space-y-3">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Depoimentos Ativos ({testimonials.length})</Label>
                    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
                      {testimonials.length === 0 ? (
                        <div className="h-32 rounded-xl border border-dashed flex items-center justify-center text-xs text-muted-foreground">Nenhum depoimento ainda.</div>
                      ) : testimonials.map(t => (
                        <div key={t.id} className="group p-3 rounded-lg border bg-background/50 flex justify-between gap-4 transition-all hover:border-primary/30">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs truncate">{t.customer_name}</span>
                              <div className="flex text-yellow-500">
                                {Array.from({length: t.rating}).map((_, i) => <Star key={i} className="h-2.5 w-2.5 fill-current" />)}
                              </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 italic">"{t.content}"</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteTestimonial(t.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 overflow-hidden">
            <CardHeader className="bg-primary/5 pb-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Sugestões da IA</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-[11px] font-medium text-blue-700 leading-relaxed">Sua conversão aumentou 15% após adicionar os novos depoimentos ontem!</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-[11px] font-medium text-emerald-700 leading-relaxed">Dica: lojas com logos coloridos convertem 8% mais no mobile.</p>
              </div>
              <Button variant="outline" className="w-full text-xs font-bold border-dashed border-2 py-6">Personalizar Sugestões</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> Próximos Passos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: 'Integrar MisticPay', done: misticpayOk },
                { label: 'Definir Slug Próprio', done: !!resellerSlug },
                { label: 'Upload de Logotipo', done: !!logoUrl },
                { label: 'Ativar Modo Premium', done: backgroundEffect !== 'none' },
              ].map((task, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn("h-4 w-4 rounded-full border flex items-center justify-center shrink-0", task.done ? "bg-emerald-500 border-emerald-500" : "bg-muted")}>
                    {task.done && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className={cn("text-xs font-medium", task.done ? "text-muted-foreground line-through" : "text-foreground")}>{task.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      
      <div className="fixed bottom-6 right-6 z-50">
        <Button onClick={save} disabled={saving} size="lg" className="h-14 px-8 shadow-2xl shadow-primary/30 rounded-2xl bg-primary text-white hover:scale-105 active:scale-95 transition-all font-black uppercase tracking-widest text-xs">
          {saving ? <Loader2 className="h-5 w-5 mr-3 animate-spin" /> : <Save className="h-5 w-5 mr-3" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
