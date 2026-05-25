import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, PageContainer } from "@/components/painel/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { KeyRound, Search, Loader2, Copy, FlaskConical, CheckCircle2, RefreshCw, Infinity as InfinityIcon, ArrowUpRight, Trash2, XCircle, ChevronDown, ChevronUp, Info, RotateCcw, Zap, Sparkles, Undo2, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import RefundSaleDialog, { type RefundSaleData } from "@/components/painel/RefundSaleDialog";
import { CancelSaleDialog, type CancelSaleTarget } from "@/components/painel/CancelSaleDialog";

const PLAN_DAYS: Record<string, number | null> = {
  pro_1d: 1,
  pro_7d: 7,
  pro_15d: 15,
  pro_30d: 30,
  trial: 15 / (24 * 60),
  lifetime: null,
};

const LABEL: Record<string, string> = {
  pro_1d: "Pro 1 dia",
  pro_7d: "Pro 7 dias",
  pro_15d: "Pro 15 dias",
  pro_30d: "Pro 30 dias",
  lifetime: "Vitalícia",
  trial: "Teste 15min",
};

type GenSource = "manual" | "storefront" | "api" | "provider";
type DeliveryMethod = "flow" | "lovax";

type OrderRow = {
  id: string;
  local_order_id?: string | null;
  local_sale_status?: string | null;
  cancellation_status?: string | null;
  license_key: string;
  license_type: string;
  status: string;
  created_at: string;
  expires_at?: string | null;
  lifetime?: boolean;
  days?: number | null;
  reseller_id: string | null;
  api_key_id: string | null;
  is_test: boolean;
  customer_id: string | null;
  client_id: string | null;
  price_cents: number | null;
  license_id?: string;
  display_name?: string;
  creator_email?: string | null;
  source?: GenSource;
  method?: DeliveryMethod;
  full_data?: any;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function getExpiry(o: { license_type: string; created_at: string; expires_at?: string | null; lifetime?: boolean; days?: number | null }) {
  if (o.lifetime || o.license_type === "lifetime") {
    return { date: null as Date | null, label: "Vitalícia", expired: false, lifetime: true };
  }
  // 1) Usa expires_at do provedor se disponível
  if (o.expires_at) {
    const exp = new Date(o.expires_at);
    if (!isNaN(exp.getTime())) {
      return { date: exp, label: formatDate(exp.toISOString()), expired: exp.getTime() < Date.now(), lifetime: false };
    }
  }
  // 2) Usa days do provedor ou PLAN_DAYS como fallback
  const days = (typeof o.days === "number" ? o.days : null) ?? PLAN_DAYS[o.license_type];
  if (days === null || days === undefined) {
    return { date: null, label: "—", expired: false, lifetime: false };
  }
  const created = new Date(o.created_at).getTime();
  const exp = new Date(created + days * 24 * 60 * 60 * 1000);
  return { date: exp, label: formatDate(exp.toISOString()), expired: exp.getTime() < Date.now(), lifetime: false };
}

function formatCountdown(target: Date, now: number): string {
  let diff = Math.max(0, target.getTime() - now);
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000); diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function computeStatus(o: { status: string }, exp: { expired: boolean; lifetime: boolean }) {
  const s = (o.status || "").toLowerCase();
  if (["revoked", "revogado", "revogada", "banned", "blocked"].includes(s)) {
    return { kind: "revoked" as const, label: "Revogada", className: "bg-destructive/15 text-destructive border border-destructive/30" };
  }
  const isStatusActive = ["success", "active", "trial", "valid", "approved"].includes(s);
  if (!isStatusActive || (!exp.lifetime && exp.expired)) {
    return { kind: "expired" as const, label: "Expirada", className: "bg-amber-500/15 text-amber-400 border border-amber-500/30" };
  }
  return { kind: "active" as const, label: "Ativa", className: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]" };
}

export default function GerenteLicencasAcompanhar() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [resellers, setResellers] = useState<Record<string, string>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, { label: string; reseller_id: string }>>({});
  const [refundInfo, setRefundInfo] = useState<Record<string, { order_id: string; price_cents: number; refunded: boolean; reseller_id: string | null }>>({});
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundData, setRefundData] = useState<RefundSaleData | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelSaleTarget | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [showExpired, setShowExpired] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [mobileExpandedRow, setMobileExpandedRow] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "revoke" | "delete" | "reset";
    key: string;
    method: DeliveryMethod;
    title: string;
    description: string;
  }>({
    open: false,
    type: "revoke",
    key: "",
    method: "flow",
    title: "",
    description: "",
  });

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const sess = (await supabase.auth.getSession()).data.session;
      const accessToken = sess?.access_token ?? "";
      const SUPA_URL = (import.meta as any).env.VITE_SUPABASE_URL as string;
      const SUPA_ANON = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const fetchFn = async (path: string) => {
        try {
          const r = await fetch(`${SUPA_URL}/functions/v1/${path}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "apikey": SUPA_ANON,
              "Content-Type": "application/json",
            },
          });
          const body = await r.text();
          let parsed = {};
          try { 
            parsed = JSON.parse(body); 
          } catch { 
            parsed = { error: body || `HTTP ${r.status}` }; 
          }
          
          if (!r.ok) {
            return { data: parsed, error: { message: (parsed as any).error || `HTTP ${r.status}` } };
          }
          return { data: parsed, error: null };
        } catch (e: any) {
          console.error(`[fetchFn] Error for ${path}:`, e);
          return { data: null, error: { message: e?.message || "network error" } };
        }
      };
      const [
        resProvider,
        resLovax,
        { data: resellersData },
        { data: apiKeysData },
        { data: dbOrdersData },
        { data: storefrontData },
      ] = await Promise.all([
        fetchFn("provider-api?action=usage-all"),
        fetchFn("lovax-api?action=usage&limit=500"),
        supabase.from("resellers").select("id, display_name, user_id"),
        supabase.from("reseller_api_keys").select("id, label, reseller_id"),
        supabase.from("orders")
          .select("id, license_key, reseller_id, api_key_id, price_cents, license_type, status, created_at, is_test, cancellation_status")
          .not("license_key", "is", null)
          .order("created_at", { ascending: false }),
        supabase.from("storefront_orders")
          .select("id, license_key, reseller_id, price_cents, cost_cents, license_type, status, created_at, buyer_name, cancellation_status")
          .not("license_key", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      const providerData = resProvider?.data;
      const providerError = resProvider?.error;
      const lovaxData = resLovax?.data;
      const lovaxError = resLovax?.error;

      if (providerError && lovaxError) {
        toast.error(`Erro ao carregar: ${providerError.message} / ${lovaxError.message}`);
        setLoading(false);
        return;
      }

      const resMap: Record<string, string> = {};
      const userIds: string[] = [];
      const resellerToUser: Record<string, string> = {};
      (resellersData ?? []).forEach((r: any) => {
        resMap[r.id] = r.display_name;
        if (r.user_id) {
          userIds.push(r.user_id);
          resellerToUser[r.id] = r.user_id;
        }
      });
      setResellers(resMap);

      // Carrega emails dos revendedores
      const emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", userIds);
        (profilesData ?? []).forEach((p: any) => {
          emailMap[p.id] = p.email;
        });
      }

      const keysMap: Record<string, { label: string; reseller_id: string }> = {};
      (apiKeysData ?? []).forEach((k: any) => {
        keysMap[k.id] = { label: k.label, reseller_id: k.reseller_id };
      });
      setApiKeys(keysMap);

      const ordersMap: Record<string, any> = {};
      (dbOrdersData ?? []).forEach((o: any) => {
        ordersMap[o.license_key] = o;
      });
      const storefrontMap: Record<string, any> = {};
      (storefrontData ?? []).forEach((o: any) => {
        storefrontMap[o.license_key] = o;
      });

      // Carrega quais orders já foram estornados (kind license_purchase_refund)
      const orderIds = (dbOrdersData ?? []).map((o: any) => o.id);
      const refundedSet = new Set<string>();
      if (orderIds.length > 0) {
        const { data: refundTx } = await supabase
          .from("balance_transactions")
          .select("reference_id")
          .eq("kind", "license_purchase_refund")
          .in("reference_id", orderIds);
        (refundTx ?? []).forEach((t: any) => { if (t.reference_id) refundedSet.add(t.reference_id); });
      }
      const refundMap: Record<string, { order_id: string; price_cents: number; refunded: boolean; reseller_id: string | null }> = {};
      (dbOrdersData ?? []).forEach((o: any) => {
        if (o.license_key && (o.price_cents ?? 0) > 0) {
          refundMap[o.license_key] = {
            order_id: o.id,
            price_cents: o.price_cents,
            refunded: refundedSet.has(o.id),
            reseller_id: o.reseller_id ?? null,
          };
        }
      });
      setRefundInfo(refundMap);

      const usage = ((providerData as any)?.usage ?? []) as any[];
      const list: OrderRow[] = usage.map(u => {
        const local = ordersMap[u.license_key];
        const sf = storefrontMap[u.license_key];
        const reseller_id = u.reseller_id || sf?.reseller_id || local?.reseller_id || null;
        const api_key_id = local?.api_key_id || null;

        // Determina origem real
        let source: GenSource = "provider";
        if (api_key_id) source = "api";
        else if (sf) source = "storefront";
        else if (local) source = "manual";

        // Email responsável: revendedor (se conhecido), ou o que veio do provedor
        const userId = reseller_id ? resellerToUser[reseller_id] : null;
        const email = (userId && emailMap[userId]) || u.creator_email || null;

        return {
          id: u.license_key,
          local_order_id: local?.id ?? null,
          local_sale_status: local?.status ?? sf?.status ?? null,
          cancellation_status: local?.cancellation_status ?? sf?.cancellation_status ?? null,
          license_id: u.id,
          license_key: u.license_key,
          display_name: u.display_name,
          license_type: u.license_type,
          status: u.status,
          created_at: u.created_at,
          expires_at: u.expires_at ?? null,
          lifetime: !!u.lifetime,
          days: typeof u.days === "number" ? u.days : null,
          is_test: u.license_type === 'trial',
          reseller_id,
          api_key_id,
          customer_id: null,
          client_id: null,
          price_cents: null,
          creator_email: email,
          source,
          method: "flow" as DeliveryMethod,
          full_data: u,
        };
      });

      const lovaxUsage = ((lovaxData as any)?.usage ?? []) as any[];
      const lovaxList: OrderRow[] = lovaxUsage.map((u: any) => {
        const local = ordersMap[u.license_key];
        const sf = storefrontMap[u.license_key];
        const reseller_id = sf?.reseller_id || local?.reseller_id || null;
        const api_key_id = local?.api_key_id || null;
        let source: GenSource = "provider";
        if (api_key_id) source = "api";
        else if (sf) source = "storefront";
        else if (local) source = "manual";
        const userId = reseller_id ? resellerToUser[reseller_id] : null;
        const email = (userId && emailMap[userId]) || u.creator_email || u.email || null;

        // Derive license_type from days when possible
        const days = typeof u.days === "number" ? u.days
          : (u.expires_at && u.created_at)
            ? Math.round((new Date(u.expires_at).getTime() - new Date(u.created_at).getTime()) / 86400000)
            : null;
        const lifetime = days !== null && days >= 3650;
        let license_type = u.license_type || "active";
        if (u.status === "trial" || license_type === "trial") license_type = "trial";
        else if (lifetime) license_type = "lifetime";
        else if (days === 1) license_type = "pro_1d";
        else if (days === 7) license_type = "pro_7d";
        else if (days === 15) license_type = "pro_15d";
        else if (days === 30) license_type = "pro_30d";

        return {
          id: `lovax:${u.license_key}`,
          local_order_id: local?.id ?? null,
          local_sale_status: local?.status ?? sf?.status ?? null,
          cancellation_status: local?.cancellation_status ?? sf?.cancellation_status ?? null,
          license_id: u.id,
          license_key: u.license_key,
          display_name: u.display_name || u.customer_name,
          license_type,
          status: u.status,
          created_at: u.created_at,
          expires_at: u.expires_at ?? null,
          lifetime,
          days,
          is_test: license_type === "trial",
          reseller_id,
          api_key_id,
          customer_id: null,
          client_id: null,
          price_cents: null,
          creator_email: email,
          source,
          method: "lovax" as DeliveryMethod,
          full_data: u,
        };
      });

      // Local orders (manual / storefront) whose license_key isn't returned by provider/lovax usage
      const seenKeys = new Set<string>([...list, ...lovaxList].map((r) => r.license_key));
      const localOnly: OrderRow[] = [];
      (dbOrdersData ?? []).forEach((o: any) => {
        if (!o.license_key || seenKeys.has(o.license_key)) return;
        const userId = o.reseller_id ? resellerToUser[o.reseller_id] : null;
        const email = (userId && emailMap[userId]) || null;
        localOnly.push({
          id: o.license_key,
          local_order_id: o.id,
          local_sale_status: o.status,
          cancellation_status: o.cancellation_status ?? null,
          license_id: o.id,
          license_key: o.license_key,
          display_name: undefined,
          license_type: o.license_type,
          status: o.status,
          created_at: o.created_at,
          expires_at: null,
          lifetime: o.license_type === "lifetime",
          days: null,
          is_test: !!o.is_test,
          reseller_id: o.reseller_id ?? null,
          api_key_id: o.api_key_id ?? null,
          customer_id: null,
          client_id: null,
          price_cents: o.price_cents ?? null,
          creator_email: email,
          source: o.api_key_id ? "api" : "manual",
          method: String(o.license_type ?? "").startsWith("lovax_") ? "lovax" : "flow",
          full_data: o,
        });
        seenKeys.add(o.license_key);
      });
      (storefrontData ?? []).forEach((o: any) => {
        if (!o.license_key || seenKeys.has(o.license_key)) return;
        const userId = o.reseller_id ? resellerToUser[o.reseller_id] : null;
        const email = (userId && emailMap[userId]) || null;
        localOnly.push({
          id: o.license_key,
          local_order_id: null,
          local_sale_status: o.status,
          cancellation_status: o.cancellation_status ?? null,
          license_id: o.id,
          license_key: o.license_key,
          display_name: o.buyer_name ?? undefined,
          license_type: o.license_type,
          status: o.status === "paid" ? "active" : o.status,
          created_at: o.created_at,
          expires_at: null,
          lifetime: o.license_type === "lifetime",
          days: null,
          is_test: false,
          reseller_id: o.reseller_id ?? null,
          api_key_id: null,
          customer_id: null,
          client_id: null,
          price_cents: o.price_cents ?? null,
          creator_email: email,
          source: "storefront",
          method: String(o.license_type ?? "").startsWith("lovax_") ? "lovax" : "flow",
          full_data: o,
        });
        seenKeys.add(o.license_key);
      });

      setOrders([...list, ...lovaxList, ...localOnly].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (e: any) {
      toast.error(e.message || "Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRevoke = async (key: string, method: DeliveryMethod = "flow") => {
    setActionLoading(key);
    try {
      const fn = method === "lovax" ? "lovax-api?action=delete-license" : "provider-api?action=revoke-license";
      const { data: res, error } = await supabase.functions.invoke(fn, {
        method: "POST",
        body: { license_key: key }
      });
      if (error || res?.error || res?.provider_error) throw new Error(error?.message || res?.error || res?.provider_error || "Erro ao revogar");
      toast.success("Licença revogada com sucesso!");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (key: string, method: DeliveryMethod = "flow") => {
    setActionLoading(key);
    try {
      const fn = method === "lovax" ? "lovax-api?action=delete-license" : "provider-api?action=delete-license";
      const { data: res, error } = await supabase.functions.invoke(fn, {
        method: "POST",
        body: { license_key: key }
      });
      if (error || res?.error || res?.provider_error) throw new Error(error?.message || res?.error || res?.provider_error || "Erro ao excluir. Verifique se a licença está revogada.");
      toast.success("Licença excluída com sucesso!");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetHWID = async (key: string, method: DeliveryMethod = "flow") => {
    setActionLoading(key);
    try {
      const fn = method === "lovax" ? "lovax-api?action=reset-hwid" : "provider-api?action=reset-hwid";
      const { data: res, error } = await supabase.functions.invoke(fn, {
        method: "POST",
        body: { license_key: key }
      });
      if (error || res?.error || res?.provider_error) throw new Error(error?.message || res?.error || res?.provider_error || "Erro ao resetar dispositivo");
      toast.success("Dispositivo resetado com sucesso!");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openConfirm = (type: "revoke" | "delete" | "reset", key: string, method: DeliveryMethod = "flow") => {
    const configs = {
      revoke: {
        title: "Revogar Licença",
        description: "Tem certeza que deseja revogar esta licença? Ela deixará de funcionar imediatamente para o cliente.",
      },
      delete: {
        title: "Excluir Licença",
        description: "Tem certeza que deseja excluir permanentemente esta licença? Esta ação não pode ser desfeita.",
      },
      reset: {
        title: "Resetar Dispositivo",
        description: "Deseja resetar o HWID desta licença? O cliente poderá vincular um novo dispositivo.",
      },
    };
    setConfirmDialog({
      open: true,
      type,
      key,
      method,
      ...configs[type],
    });
  };

  const executeAction = () => {
    const { type, key, method } = confirmDialog;
    setConfirmDialog((prev) => ({ ...prev, open: false }));
    if (type === "revoke") handleRevoke(key, method);
    else if (type === "delete") handleDelete(key, method);
    else if (type === "reset") handleResetHWID(key, method);
  };

  // Retorna true se a licença está em um estado em que cabe estorno
  const isCancelable = (o: OrderRow) => {
    const s = (o.status || "").toLowerCase();
    return ["revoked", "revogado", "revogada", "canceled", "cancelled", "cancelado", "queimado", "queimada"].includes(s);
  };

  const openRefundLicense = (o: OrderRow) => {
    const info = refundInfo[o.license_key];
    if (!info) return;
    setRefundData({
      tipo: "license",
      provider_pedido_id: o.license_key,
      reseller_label: (o.reseller_id && resellers[o.reseller_id]) || o.creator_email || null,
      price_cents: info.price_cents,
      extra_info: LABEL[o.license_type] || o.license_type,
    });
    setRefundDialogOpen(true);
  };

  const canCancelSale = (o: OrderRow) => {
    if (!o.local_order_id || o.source === "provider") return false;
    const saleStatus = (o.local_sale_status || o.status || "").toLowerCase();
    const cancellationStatus = o.cancellation_status || "none";
    return ["completed", "paid", "delivered"].includes(saleStatus) && cancellationStatus === "none";
  };

  const openCancelSale = (o: OrderRow) => {
    const info = refundInfo[o.license_key];
    if (!o.local_order_id) return;
    setCancelTarget({
      sale_id: o.local_order_id,
      sale_type: o.source === "storefront" ? "storefront" : "manual",
      label: o.license_key ? o.license_key.slice(0, 12) + "…" : `#${o.local_order_id.slice(0, 8)}`,
      price_cents: Number(info?.price_cents ?? o.price_cents ?? 0),
      cost_cents: Number(info?.price_cents ?? o.price_cents ?? 0),
      license_key: o.license_key,
    });
  };

  const getGenerationType = (o: OrderRow) => {
    switch (o.source) {
      case "api":
        return { label: "API", sub: "Via API", color: "text-sky-300 bg-sky-500/10 border-sky-500/20" };
      case "storefront":
        return { label: "Loja do Cliente", sub: "Compra na loja", color: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20" };
      case "manual":
        return { label: "Painel", sub: "Manual", color: "text-amber-300 bg-amber-500/10 border-amber-500/20" };
      default:
        return { label: "Provedor", sub: "Direto no provedor", color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" };
    }
  };

  // Detecta o método de entrega usado pra gerar a licença.
  // Procura marcadores explícitos no payload do provedor; fallback "MétodoFlow".
  const getDeliveryMethod = (o: OrderRow) => {
    return o.method === "lovax"
      ? { id: "lovax" as const, label: "MétodoLovax", Icon: Sparkles, color: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20" }
      : { id: "flow" as const, label: "MétodoFlow", Icon: Zap, color: "text-primary bg-primary/10 border-primary/20" };
  };

  const copy = async (txt: string) => {
    await navigator.clipboard.writeText(txt);
    toast.success("Copiado!");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const exp = getExpiry(o);
      const st = computeStatus(o, exp);
      const isActive = st.kind === "active";
      if (showExpired === "active" && !isActive) return false;
      if (showExpired === "expired" && isActive) return false;
      if (planFilter !== "all" && o.license_type !== planFilter) return false;
      if (!q) return true;
      const reseller = o.reseller_id ? (resellers[o.reseller_id] ?? "") : "";
      const apiKeyLabel = o.api_key_id && apiKeys[o.api_key_id] ? apiKeys[o.api_key_id].label : "";
      return (
        (o.local_order_id ?? "").toLowerCase().includes(q) ||
        (o.license_id ?? "").toLowerCase().includes(q) ||
        (o.id ?? "").toLowerCase().includes(q) ||
        (o.license_key ?? "").toLowerCase().includes(q) ||
        (o.display_name ?? "").toLowerCase().includes(q) ||
        (o.creator_email ?? "").toLowerCase().includes(q) ||
        reseller.toLowerCase().includes(q) ||
        apiKeyLabel.toLowerCase().includes(q)
      );
    });
  }, [orders, search, planFilter, showExpired, resellers, apiKeys]);

  const stats = useMemo(() => {
    const active = orders.filter((o) => {
      const e = getExpiry(o);
      const isStatusActive = ["success", "active", "trial", "valid", "approved"].includes(o.status?.toLowerCase() || "");
      return isStatusActive;
    });
    return {
      total: active.filter((o) => o.license_type !== "trial").length,
      tests: active.filter((o) => o.license_type === "trial").length,
      lifetime: active.filter((o) => o.license_type === "lifetime").length,
      paid: active.filter((o) => o.license_type !== "trial" && o.license_type !== "lifetime").length,
      all: orders.filter((o) => o.license_type !== "trial").length,
    };
  }, [orders]);

  return (
    <PageContainer>
      <PageHeader
        title={
          <h1 className="font-display text-4xl font-black tracking-tighter sm:text-5xl">
            Todas as <span className="text-primary italic">Licenças</span>
          </h1>
        }
        description="Acompanhe todas as chaves geradas no ecossistema em tempo real com controle total de expiração."
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Licenças Ativas" value={stats.total} icon={CheckCircle2} className="p-4 sm:p-6" />
        <StatCard label="Testes em Uso" value={stats.tests} icon={FlaskConical} className="p-4 sm:p-6 border-primary/20 bg-white/5" />
        <StatCard label="Chaves Vitalícias" value={stats.lifetime} icon={InfinityIcon} className="p-4 sm:p-6" />
        <StatCard label="Total Histórico" value={stats.all} icon={KeyRound} className="p-4 sm:p-6" />
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative group">
          <div className="pointer-events-none absolute inset-0 bg-primary/5 blur-xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            placeholder="Buscar por ID, chave, revendedor ou cliente…"
            className="pl-11 h-12 bg-white/5 border-white/10 rounded-2xl text-sm transition-all focus:bg-white/10 focus:ring-primary/20"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none w-full">
          <Select value={showExpired} onValueChange={setShowExpired}>
            <SelectTrigger className="h-10 min-w-[150px] bg-white/5 border-white/10 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background/95 backdrop-blur-xl border-white/10">
              <SelectItem value="active">Apenas ativas</SelectItem>
              <SelectItem value="expired">Apenas expiradas</SelectItem>
              <SelectItem value="all">Todas as licenças</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="h-10 min-w-[150px] bg-white/5 border-white/10 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-colors hover:bg-white/10">
              <SelectValue placeholder="Filtrar por Plano" />
            </SelectTrigger>
            <SelectContent className="bg-background/95 backdrop-blur-xl border-white/10">
              <SelectItem value="all">Todos os planos</SelectItem>
              {Object.entries(LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-3xl border border-white/5 bg-card/20 backdrop-blur-sm p-4 sm:p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-8 w-1 bg-primary rounded-full" />
          <h3 className="font-display text-lg font-bold tracking-tight">Listagem de Licenças</h3>
        </div>

        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-white/5 bg-black/20 p-4 h-24" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground italic bg-black/10 rounded-2xl border border-white/5">
            Nenhuma licença encontrada.
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="hidden md:block overflow-hidden rounded-2xl border border-white/5 bg-black/40 shadow-inner">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-white/5 hover:bg-transparent bg-white/[0.02]">
                    <TableHead className="text-[10px] font-mono uppercase tracking-[0.2em] py-5 text-muted-foreground/60 pl-6">Nome / Provedor</TableHead>
                    <TableHead className="text-[10px] font-mono uppercase tracking-[0.2em] py-5 text-muted-foreground/60">Geração</TableHead>
                    <TableHead className="text-[10px] font-mono uppercase tracking-[0.2em] py-5 text-muted-foreground/60">Data</TableHead>
                    <TableHead className="text-[10px] font-mono uppercase tracking-[0.2em] py-5 text-muted-foreground/60">Método</TableHead>
                    <TableHead className="text-[10px] font-mono uppercase tracking-[0.2em] py-5 text-muted-foreground/60">Responsável</TableHead>
                    <TableHead className="text-[10px] font-mono uppercase tracking-[0.2em] py-5 text-muted-foreground/60 text-center">Status</TableHead>
                    <TableHead className="text-[10px] font-mono uppercase tracking-[0.2em] py-5 text-muted-foreground/60 text-center">Validade</TableHead>
                    <TableHead className="text-[10px] font-mono uppercase tracking-[0.2em] py-5 text-muted-foreground/60 text-right pr-6">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => {
                    const exp = getExpiry(o);
                    const isExpanded = expandedRow === o.id;
                    const gen = getGenerationType(o);
                    const method = getDeliveryMethod(o);
                    const st = computeStatus(o, exp);
                    const isActive = st.kind === "active";

                    return (
                      <Fragment key={o.id}>
                        <TableRow className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors group">
                          <TableCell className="pl-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <span className="rounded-lg bg-primary/10 px-3 py-1.5 font-display text-xs text-primary font-black border border-primary/20 block whitespace-nowrap">
                                  {o.display_name || o.license_key}
                                </span>
                                <button onClick={() => o.license_key && copy(o.license_key)} className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-background border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary">
                                  <Copy className="h-2.5 w-2.5" />
                                </button>
                              </div>
                              {(o.is_test || o.license_type === "trial") && (
                                <Badge variant="outline" className="h-5 gap-1 px-2 text-[9px] uppercase font-black border-amber-500/30 bg-amber-500/10 text-amber-500">
                                  <FlaskConical className="h-3 w-3" /> teste
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={cn("inline-flex flex-col rounded-lg px-2.5 py-1 border", gen.color)}>
                              <span className="text-[10px] font-black uppercase tracking-wider">{gen.label}</span>
                              <span className="text-[8px] opacity-70 leading-none">{gen.sub}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col leading-tight">
                              <span className="text-[11px] font-bold tabular-nums text-foreground/90">
                                {new Date(o.created_at).toLocaleDateString("pt-BR")}
                              </span>
                              <span className="text-[9px] font-mono text-muted-foreground tabular-nums">
                                {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 border", method.color)}>
                              <method.Icon className="h-3 w-3" />
                              <span className="text-[10px] font-black uppercase tracking-wider">{method.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {o.creator_email ? (
                              <button
                                onClick={() => copy(o.creator_email!)}
                                className="text-[11px] font-mono text-foreground/80 hover:text-primary transition-colors max-w-[200px] truncate inline-block"
                                title={o.creator_email}
                              >
                                {o.creator_email}
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full", st.className)}>
                              <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-emerald-400 animate-pulse" : st.kind === "revoked" ? "bg-destructive" : "bg-amber-400")} />
                              {st.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              {exp.lifetime ? (
                                <span className="text-xs font-black text-amber-500 uppercase tracking-tighter bg-amber-500/10 px-2 py-0.5 rounded-md">Vitalícia</span>
                              ) : st.kind !== "active" ? (
                                <span className="text-[10px] font-black text-destructive uppercase tracking-tighter bg-destructive/10 px-2 py-0.5 rounded-md">{st.kind === "revoked" ? "Revogada" : "Expirada"}</span>
                              ) : exp.date ? (
                                <>
                                  <span className="text-[11px] font-black tabular-nums text-emerald-400">{formatCountdown(exp.date, now)}</span>
                                  <span className="text-[9px] text-muted-foreground">{exp.label}</span>
                                </>
                              ) : (
                                <span className="text-xs font-bold">{exp.label}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <div className="flex items-center justify-end gap-2">
                              {(() => {
                                const info = refundInfo[o.license_key];
                                if (canCancelSale(o)) {
                                  return (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-rose-500 hover:bg-rose-500/10"
                                      onClick={() => openCancelSale(o)}
                                      title="Cancelar venda"
                                    >
                                      <Ban className="h-4 w-4" />
                                    </Button>
                                  );
                                }
                                if (!info) return null;
                                if (info.refunded) {
                                  return (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-400" title="Já estornado">
                                      <Undo2 className="h-2.5 w-2.5" /> Estornado
                                    </span>
                                  );
                                }
                                if (!isCancelable(o)) return null;
                                return (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-rose-500 hover:bg-rose-500/10"
                                    onClick={() => openRefundLicense(o)}
                                    title={`Estornar (${(info.price_cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})})`}
                                  >
                                    <Undo2 className="h-4 w-4" />
                                  </Button>
                                );
                              })()}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500 transition-colors disabled:opacity-30"
                                onClick={() => openConfirm("reset", o.license_key, o.method)}
                                disabled={actionLoading === o.license_key}
                                title="Resetar Dispositivo (HWID)"
                              >
                                {actionLoading === o.license_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30"
                                onClick={() => openConfirm("revoke", o.license_key, o.method)}
                                disabled={!isActive || actionLoading === o.license_key}
                                title="Revogar Licença"
                              >
                                {actionLoading === o.license_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors disabled:opacity-30"
                                onClick={() => openConfirm("delete", o.license_key, o.method)}
                                disabled={isActive || actionLoading === o.license_key}
                                title="Excluir Licença"
                              >
                                {actionLoading === o.license_key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-8 w-8 transition-all",
                                  isExpanded ? "bg-primary text-white" : "text-muted-foreground hover:bg-white/5"
                                )}
                                onClick={() => setExpandedRow(isExpanded ? null : o.id)}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-black/40">
                            <TableCell colSpan={8} className="p-6">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2">
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-primary flex items-center gap-2"><Info className="h-3 w-3" /> Detalhes</h4>
                                  <div className="grid gap-2 text-xs">
                                    <div className="flex flex-col"><span className="opacity-50 text-[10px]">Chave</span>
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-primary font-bold">{o.license_key}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-primary/20 hover:text-primary" onClick={() => copy(o.license_key)}>
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="flex flex-col"><span className="opacity-50 text-[10px]">ID Provedor</span><span className="font-mono">{o.license_id || "—"}</span></div>
                                    <div className="flex flex-col"><span className="opacity-50 text-[10px]">Responsável</span>
                                      <span className={cn(o.creator_email ? "text-primary font-bold" : "text-muted-foreground italic")}>
                                        {o.creator_email || "Gerado no provedor"}
                                      </span>
                                    </div>
                                    <div className="flex flex-col"><span className="opacity-50 text-[10px]">Plano</span><span>{LABEL[o.license_type] || o.license_type}</span></div>
                                    <div className="flex flex-col"><span className="opacity-50 text-[10px]">Criada em</span><span>{formatDate(o.created_at)}</span></div>
                                    {(() => {
                                      const info = refundInfo[o.license_key];
                                      const cents = info?.price_cents ?? o.price_cents ?? null;
                                      if (cents == null) return (
                                        <div className="flex flex-col"><span className="opacity-50 text-[10px]">Valor cobrado</span><span className="italic text-muted-foreground">Sem custo no painel</span></div>
                                      );
                                      const brl = (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
                                      return (
                                        <>
                                          <div className="flex flex-col"><span className="opacity-50 text-[10px]">Valor cobrado do revendedor</span><span className="font-mono font-bold text-emerald-400">{brl}</span></div>
                                          <div className="flex flex-col"><span className="opacity-50 text-[10px]">Origem da venda</span><span className="capitalize">{o.source === "storefront" ? "Loja pública" : o.source === "api" ? "API revendedor" : o.source === "manual" ? "Painel (manual)" : "Provedor"}</span></div>
                                          <div className="flex flex-col"><span className="opacity-50 text-[10px]">Status pagamento</span>
                                            <span className={cn("font-bold", info?.refunded ? "text-sky-400" : "text-emerald-400")}>
                                              {info?.refunded ? "Estornado ao revendedor" : "Cobrado (debitado do saldo)"}
                                            </span>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </div>
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-primary flex items-center gap-2"><KeyRound className="h-3 w-3" /> JSON</h4>
                                  <pre className="text-[9px] bg-black/60 p-4 rounded-xl border border-white/5 max-h-[150px] overflow-auto text-emerald-400 font-mono">
                                    {JSON.stringify(o.full_data, null, 2)}
                                  </pre>
                                </div>
                                <div className="space-y-4">
                                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-primary flex items-center gap-2"><ArrowUpRight className="h-3 w-3" /> Gestão</h4>
                                  <div className="grid gap-2">
                                    <Button variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/20" onClick={() => openConfirm("revoke", o.license_key, o.method)} disabled={!isActive}><XCircle className="mr-2 h-3.5 w-3.5" /> Revogar</Button>
                                    <Button variant="outline" size="sm" className="w-full text-xs border-white/10" onClick={() => openConfirm("delete", o.license_key, o.method)} disabled={isActive}><Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir</Button>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden grid gap-4">
              {filtered.map((o) => {
                const exp = getExpiry(o);
                const isExpanded = mobileExpandedRow === o.id;
                const gen = getGenerationType(o);
                const method = getDeliveryMethod(o);
                const st = computeStatus(o, exp);
                const isActive = st.kind === "active";

                return (
                  <div key={o.id} className="rounded-3xl border border-white/5 bg-black/40 p-5 transition-all group overflow-hidden relative">
                    <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl" />
                    <div className="relative z-10 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-display text-[11px] text-primary font-black border border-primary/20 block w-fit">
                            {o.display_name || o.license_key}
                          </span>
                            {(o.is_test || o.license_type === "trial") && (
                              <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[8px] uppercase font-black border-amber-500/30 bg-amber-500/10 text-amber-500">
                                <FlaskConical className="h-2.5 w-2.5" /> teste
                              </Badge>
                            )}
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full", st.className)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-emerald-400 animate-pulse" : st.kind === "revoked" ? "bg-destructive" : "bg-amber-400")} />
                          {st.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] opacity-50 uppercase font-mono">Geração</span>
                          <span className={cn("text-[9px] font-bold uppercase p-1 rounded w-fit border", gen.color)}>{gen.label}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[9px] opacity-50 uppercase font-mono">Método</span>
                          <span className={cn("inline-flex items-center gap-1 text-[9px] font-bold uppercase p-1 rounded w-fit border", method.color)}>
                            <method.Icon className="h-2.5 w-2.5" />
                            {method.label}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] opacity-50 uppercase font-mono">Expira</span>
                          {exp.lifetime ? (
                            <span className="text-[10px] font-black uppercase tracking-tighter text-right px-2 py-0.5 rounded border text-amber-500 bg-amber-500/10 border-amber-500/20">Vitalícia</span>
                          ) : st.kind !== "active" ? (
                            <span className="text-[10px] font-black uppercase tracking-tighter text-right px-2 py-0.5 rounded border text-destructive bg-destructive/10 border-destructive/20">{st.kind === "revoked" ? "Revogada" : "Expirada"}</span>
                          ) : exp.date ? (
                            <div className="text-right">
                              <div className="text-[11px] font-black tabular-nums text-emerald-400">{formatCountdown(exp.date, now)}</div>
                              <div className="text-[8px] text-muted-foreground">{exp.label}</div>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold">{exp.label}</span>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 col-span-2">
                          <span className="text-[9px] opacity-50 uppercase font-mono">Responsável</span>
                          <span className={cn("text-[10px] font-mono truncate", o.creator_email ? "text-foreground/80" : "text-muted-foreground italic")}>{o.creator_email || "—"}</span>
                        </div>
                        <div className="flex flex-col gap-1 col-span-2">
                          <span className="text-[9px] opacity-50 uppercase font-mono">Data da Geração</span>
                          <span className="text-[10px] font-mono tabular-nums text-foreground/80">
                            {formatDate(o.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 gap-1 overflow-x-auto pb-1 scrollbar-none">
                        {(() => {
                          const info = refundInfo[o.license_key];
                          if (canCancelSale(o)) {
                            return (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 flex-1 bg-white/5 text-rose-500 hover:bg-rose-500/10"
                                onClick={() => openCancelSale(o)}
                                title="Cancelar venda"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            );
                          }
                          if (!info) return null;
                          if (info.refunded) {
                            return (
                              <span className="inline-flex items-center justify-center gap-1 h-9 px-2 rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-400 text-[9px] font-bold uppercase shrink-0">
                                <Undo2 className="h-3 w-3" /> Estornado
                              </span>
                            );
                          }
                          if (!isCancelable(o)) return null;
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 flex-1 bg-white/5 text-rose-500 hover:bg-rose-500/10"
                              onClick={() => openRefundLicense(o)}
                              title="Estornar"
                            >
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          );
                        })()}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 flex-1 bg-white/5 text-amber-500 hover:bg-amber-500/10 disabled:opacity-30"
                          onClick={() => openConfirm("reset", o.license_key, o.method)}
                          disabled={actionLoading === o.license_key}
                          title="Reset"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 flex-1 bg-white/5 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                          onClick={() => openConfirm("revoke", o.license_key, o.method)}
                          disabled={!isActive || actionLoading === o.license_key}
                          title="Revogar"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 flex-1 bg-white/5 text-muted-foreground hover:bg-white/10 disabled:opacity-30"
                          onClick={() => openConfirm("delete", o.license_key, o.method)}
                          disabled={isActive || actionLoading === o.license_key}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-9 flex-1 transition-all",
                            isExpanded ? "bg-primary text-white" : "bg-white/5 text-muted-foreground hover:bg-white/10"
                          )}
                          onClick={() => setMobileExpandedRow(isExpanded ? null : o.id)}
                          title="Detalhes"
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </div>

                      {isExpanded && (
                        <div className="pt-4 mt-4 border-t border-white/5 space-y-4 animate-in slide-in-from-top-2">
                          <div className="grid gap-2 text-[10px]">
                            <div className="flex justify-between items-center">
                              <span className="opacity-50">Chave</span>
                              <div className="flex items-center gap-1">
                                <span className="font-mono font-bold text-primary">{o.license_key}</span>
                                <Button variant="ghost" size="icon" className="h-5 w-5 p-0 hover:text-primary" onClick={() => copy(o.license_key)}>
                                  <Copy className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex justify-between"><span className="opacity-50">ID Provedor</span><span className="font-mono">{o.license_id || "—"}</span></div>
                            <div className="flex justify-between">
                              <span className="opacity-50">Responsável</span>
                              <span className={cn("font-medium", o.creator_email ? "text-primary" : "italic")}>
                                {o.creator_email || "Gerado no provedor"}
                              </span>
                            </div>
                            <div className="flex justify-between"><span className="opacity-50">Plano</span><span>{LABEL[o.license_type] || o.license_type}</span></div>
                            <div className="flex justify-between"><span className="opacity-50">Criada em</span><span>{formatDate(o.created_at)}</span></div>
                            {(() => {
                              const info = refundInfo[o.license_key];
                              const cents = info?.price_cents ?? o.price_cents ?? null;
                              if (cents == null) return (
                                <div className="flex justify-between"><span className="opacity-50">Valor cobrado</span><span className="italic text-muted-foreground">—</span></div>
                              );
                              const brl = (cents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
                              return (
                                <>
                                  <div className="flex justify-between"><span className="opacity-50">Valor cobrado</span><span className="font-mono font-bold text-emerald-400">{brl}</span></div>
                                  <div className="flex justify-between"><span className="opacity-50">Origem</span><span className="capitalize">{o.source === "storefront" ? "Loja pública" : o.source === "api" ? "API revendedor" : o.source === "manual" ? "Painel" : "Provedor"}</span></div>
                                  <div className="flex justify-between"><span className="opacity-50">Status</span>
                                    <span className={cn("font-bold", info?.refunded ? "text-sky-400" : "text-emerald-400")}>
                                      {info?.refunded ? "Estornado" : "Cobrado"}
                                    </span>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                          <pre className="text-[8px] bg-black/60 p-3 rounded-xl border border-white/5 max-h-[100px] overflow-auto text-emerald-400 font-mono">
                            {JSON.stringify(o.full_data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <AlertDialog open={confirmDialog.open} onOpenChange={(o) => setConfirmDialog(p => ({ ...p, open: o }))}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-xl border-white/10 rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-xl font-bold">{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground">
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeAction}
              className={cn(
                "rounded-xl font-bold uppercase tracking-wider text-[11px]",
                confirmDialog.type === "reset" ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              )}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RefundSaleDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        data={refundData}
        onSuccess={() => { load(); }}
      />
    </PageContainer>
  );
}