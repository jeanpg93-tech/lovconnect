import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2, Copy, KeyRound, RotateCcw, Ban, Search, MoreVertical, FlaskConical, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Order = {
  id: string;
  license_type: string;
  status: string;
  license_key: string | null;
  created_at: string;
  is_test: boolean;
  notes: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  trial: "Teste 15min",
  flow_pro_1d: "1 dia",
  flow_pro_7d: "7 dias",
  flow_pro_30d: "30 dias",
  flow_lifetime: "Vitalícia",
  lovax_pro_1d: "1 dia",
  lovax_pro_7d: "7 dias",
  lovax_pro_30d: "30 dias",
  lovax_lifetime: "Vitalícia",
};

function parseNotes(s: string | null): { display_name?: string | null; whatsapp?: string | null } {
  if (!s) return {};
  try { return JSON.parse(s) ?? {}; } catch { return {}; }
}

export default function RevendedorMinhasChaves() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);
    const { data } = await supabase
      .from("orders")
      .select("id,license_type,status,license_key,created_at,is_test,notes")
      .eq("reseller_id", r.id)
      .eq("product_type", "extension")
      .order("created_at", { ascending: false })
      .limit(200);
    setOrders((data ?? []) as Order[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  const runAction = async (o: Order, action: "reset-hwid" | "revoke-license", confirmMsg: string) => {
    if (!o.license_key) return toast.error("Pedido sem chave");
    if (!confirm(confirmMsg)) return;
    setActionLoading(`${o.id}:${action}`);
    const { data, error } = await supabase.functions.invoke("reseller-license-action", {
      body: { action, license_key: o.license_key, order_id: o.id },
    });
    setActionLoading(null);
    if (error || (data as any)?.error) {
      return toast.error((data as any)?.error ?? error?.message ?? "Falha na ação");
    }
    toast.success(action === "reset-hwid" ? "Device resetado" : "Chave revogada");
    load();
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      completed: { label: "Ativa", cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
      pending: { label: "Pendente", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
      failed: { label: "Falhou", cls: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
      revoked: { label: "Revogada", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
    };
    const v = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
    return <Badge variant="outline" className={cn("text-[10px] font-bold uppercase", v.cls)}>{v.label}</Badge>;
  };

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const n = parseNotes(o.notes);
    return (
      (o.license_key ?? "").toLowerCase().includes(q) ||
      (n.display_name ?? "").toLowerCase().includes(q) ||
      (n.whatsapp ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <PageContainer>
      <PageHeader
        title="Minhas Chaves"
        description="Lista das chaves que você gerou — copie, revogue ou resete o device"
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por chave, nome ou WhatsApp..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-2 h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-4 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-5 w-5 text-primary/70" />
          </div>
          <p className="mt-3 text-sm font-medium">Nenhuma chave ainda</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Quando você gerar uma chave em "Gerar Chave", ela aparece aqui.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-6 hidden md:block overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Chave</th>
                  <th className="px-4 py-3 text-left font-semibold">Data</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const n = parseNotes(o.notes);
                  return (
                    <tr key={o.id} className="border-b border-border/50 last:border-b-0 hover:bg-background/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {o.is_test && <FlaskConical className="h-3.5 w-3.5 text-emerald-500" />}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{n.display_name || (o.is_test ? "Teste" : "—")}</div>
                            {n.whatsapp && <div className="truncate text-[11px] text-muted-foreground">{n.whatsapp}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">{TYPE_LABEL[o.license_type] ?? o.license_type}</td>
                      <td className="px-4 py-3">{statusBadge(o.status)}</td>
                      <td className="px-4 py-3">
                        {o.license_key ? (
                          <div className="flex items-center gap-1.5">
                            <code className="max-w-[180px] truncate rounded bg-background/70 px-2 py-1 font-mono text-[11px]">
                              {o.license_key}
                            </code>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(o.license_key!)} title="Copiar">
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {o.license_key && o.status === "completed" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7">
                                {actionLoading?.startsWith(o.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreVertical className="h-3.5 w-3.5" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => runAction(o, "reset-hwid", "Resetar o device dessa chave? O cliente poderá ativar em outro aparelho.")}>
                                <RotateCcw className="mr-2 h-3.5 w-3.5" /> Resetar device
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => runAction(o, "revoke-license", "Revogar esta chave? O cliente perderá o acesso.")} className="text-rose-500">
                                <Ban className="mr-2 h-3.5 w-3.5" /> Revogar chave
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-6 grid gap-3 md:hidden">
            {filtered.map((o) => {
              const n = parseNotes(o.notes);
              return (
                <div key={o.id} className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {o.is_test && <FlaskConical className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                        <span className="truncate text-sm font-semibold">{n.display_name || (o.is_test ? "Teste" : "—")}</span>
                      </div>
                      {n.whatsapp && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{n.whatsapp}</div>}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {TYPE_LABEL[o.license_type] ?? o.license_type}
                        </span>
                        {statusBadge(o.status)}
                      </div>
                    </div>
                    {o.license_key && o.status === "completed" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                            {actionLoading?.startsWith(o.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => runAction(o, "reset-hwid", "Resetar o device dessa chave? O cliente poderá ativar em outro aparelho.")}>
                            <RotateCcw className="mr-2 h-3.5 w-3.5" /> Resetar device
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => runAction(o, "revoke-license", "Revogar esta chave? O cliente perderá o acesso.")} className="text-rose-500">
                            <Ban className="mr-2 h-3.5 w-3.5" /> Revogar chave
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  {o.license_key && (
                    <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/50 p-2">
                      <code className="flex-1 truncate font-mono text-[11px]">{o.license_key}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copy(o.license_key!)} title="Copiar">
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(o.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </PageContainer>
  );
}