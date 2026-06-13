import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  RefreshCcw,
  Sparkles,
  Calendar,
  Copy,
  ExternalLink,
  CalendarClock,
  CheckCircle2,
  XCircle,
  SkipForward,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

type Sub = {
  id: string;
  order_token: string;
  plan_id: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  owner_email_required: string;
  workspace_name: string | null;
  status: string;
  duration_days: number;
  credits_per_day: number;
  total_credits_cap: number;
  delivery_hour: number;
  started_at: string | null;
  ends_at: string | null;
  cost_cents: number;
  sale_price_cents: number;
  source: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  completed_at: string | null;
  created_at: string;
};

type Delivery = {
  id: string;
  day_number: number;
  scheduled_date: string;
  credits: number;
  status: string;
  delivered_at: string | null;
  notes: string | null;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  awaiting_owner: { label: "Aguardando cliente", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  awaiting_confirm: { label: "Aguardando confirmar", cls: "bg-violet-500/15 text-violet-500 border-violet-500/30" },
  active: { label: "Em entrega", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  paused: { label: "Pausado", cls: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30" },
  cancelled: { label: "Cancelado", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  completed: { label: "Concluído", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  expired: { label: "Expirado", cls: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30" },
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  api: "API",
  storefront: "Loja",
};

const fmtBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
const fmtDateTimeBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

export default function RevendedorPlanosVendidos() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [selected, setSelected] = useState<Sub | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: r } = await supabase
        .from("resellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!r) {
        setSubs([]);
        setLoading(false);
        return;
      }
      setResellerId(r.id);
      const { data, error } = await supabase
        .from("reseller_recharge_plan_subscriptions")
        .select("*")
        .eq("reseller_id", r.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setSubs((data ?? []) as unknown as Sub[]);
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter((s) => {
      if (!q) return true;
      return (
        (s.customer_name ?? "").toLowerCase().includes(q) ||
        (s.workspace_name ?? "").toLowerCase().includes(q) ||
        (s.owner_email_required ?? "").toLowerCase().includes(q) ||
        (s.customer_whatsapp ?? "").toLowerCase().includes(q)
      );
    });
  }, [subs, search]);

  const buckets = useMemo(() => {
    const pending = filtered.filter(
      (s) => s.status === "awaiting_owner" || s.status === "awaiting_confirm",
    );
    const active = filtered.filter((s) => s.status === "active");
    const done = filtered.filter(
      (s) =>
        s.status === "completed" ||
        s.status === "cancelled" ||
        s.status === "expired" ||
        s.status === "paused",
    );
    return { pending, active, done };
  }, [filtered]);

  const totals = useMemo(() => {
    const sold = subs.filter(
      (s) => s.status === "active" || s.status === "completed",
    );
    const revenue = sold.reduce((acc, s) => acc + (s.sale_price_cents ?? 0), 0);
    const cost = sold.reduce((acc, s) => acc + (s.cost_cents ?? 0), 0);
    return {
      count: sold.length,
      revenue,
      profit: revenue - cost,
    };
  }, [subs]);

  return (
    <div>
      <PageHeader
        title="Vendas Plano 3k"
        description="Acompanhe todas as assinaturas de plano de recargas vendidas — manuais, via API ou pela loja."
      />

      <div className="grid gap-3 sm:grid-cols-3 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Vendas ativas + concluídas
            </div>
            <div className="text-2xl font-bold mt-1">{totals.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Receita gerada
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-500">
              {fmtBRL(totals.revenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Lucro estimado
            </div>
            <div className="text-2xl font-bold mt-1 text-primary">
              {fmtBRL(totals.profit)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Assinaturas
              </CardTitle>
              <CardDescription>
                Suas vendas de plano de recargas em todos os canais.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Buscar cliente, workspace, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-64"
              />
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary opacity-30" />
            </div>
          ) : (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="active">
                  Em entrega ({buckets.active.length})
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Aguardando cliente ({buckets.pending.length})
                </TabsTrigger>
                <TabsTrigger value="done">
                  Encerradas ({buckets.done.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="active" className="mt-4">
                <SubsTable subs={buckets.active} onOpen={setSelected} />
              </TabsContent>
              <TabsContent value="pending" className="mt-4">
                <SubsTable subs={buckets.pending} onOpen={setSelected} />
              </TabsContent>
              <TabsContent value="done" className="mt-4">
                <SubsTable subs={buckets.done} onOpen={setSelected} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {selected && (
        <SubDetailDialog
          sub={selected}
          open={!!selected}
          onOpenChange={(v) => !v && setSelected(null)}
        />
      )}
    </div>
  );
}

function SubsTable({ subs, onOpen }: { subs: Sub[]; onOpen: (s: Sub) => void }) {
  if (subs.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Nenhuma assinatura nesta categoria ainda.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
            <th className="text-left py-2 px-2">Cliente</th>
            <th className="text-left py-2 px-2">Workspace</th>
            <th className="text-left py-2 px-2">Origem</th>
            <th className="text-left py-2 px-2">Status</th>
            <th className="text-right py-2 px-2">Início</th>
            <th className="text-right py-2 px-2">Venda</th>
            <th className="text-right py-2 px-2">Custo</th>
            <th className="py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => {
            const meta = STATUS_LABEL[s.status] ?? { label: s.status, cls: "" };
            return (
              <tr key={s.id} className="border-b hover:bg-muted/30">
                <td className="py-2 px-2">{s.customer_name ?? "—"}</td>
                <td className="py-2 px-2 font-mono text-xs">{s.workspace_name ?? "—"}</td>
                <td className="py-2 px-2 text-xs text-muted-foreground">
                  {SOURCE_LABEL[s.source ?? ""] ?? s.source ?? "—"}
                </td>
                <td className="py-2 px-2">
                  <Badge variant="outline" className={meta.cls}>
                    {meta.label}
                  </Badge>
                </td>
                <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                  {fmtDateBR(s.started_at ?? s.created_at)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-emerald-500">
                  {fmtBRL(s.sale_price_cents)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-muted-foreground">
                  {fmtBRL(s.cost_cents)}
                </td>
                <td className="py-2 px-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(s)}>
                    Detalhes
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SubDetailDialog({
  sub,
  open,
  onOpenChange,
}: {
  sub: Sub;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    const run = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("recharge_plan_deliveries")
        .select("*")
        .eq("subscription_id", sub.id)
        .order("day_number", { ascending: true });
      setDeliveries((data ?? []) as Delivery[]);
      setLoading(false);
    };
    run();
  }, [open, sub.id]);

  const meta = STATUS_LABEL[sub.status] ?? { label: sub.status, cls: "" };
  const link = `${window.location.origin}/plano/${sub.order_token}`;
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  const delivered = deliveries.filter((d) => d.status === "delivered").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {sub.customer_name ?? "Cliente"}
            <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            {sub.workspace_name ?? "(workspace ainda não definido)"} ·{" "}
            {SOURCE_LABEL[sub.source ?? ""] ?? sub.source ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4 text-sm">
          <Info k="Email do bot" v={sub.owner_email_required} mono />
          <Info k="Créditos/dia" v={String(sub.credits_per_day)} />
          <Info k="Duração" v={`${sub.duration_days} dias`} />
          <Info k="Horário" v={`${String(sub.delivery_hour).padStart(2, "0")}h`} />
          <Info k="Início" v={fmtDateTimeBR(sub.started_at)} />
          <Info k="Fim previsto" v={fmtDateTimeBR(sub.ends_at)} />
          <Info k="Venda" v={fmtBRL(sub.sale_price_cents)} />
          <Info k="Custo" v={fmtBRL(sub.cost_cents)} />
        </div>

        {sub.customer_whatsapp && (
          <div className="text-xs text-muted-foreground">
            WhatsApp do cliente:{" "}
            <span className="font-mono">{sub.customer_whatsapp}</span>
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2">
          <Input value={link} readOnly className="font-mono text-xs h-8" />
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(link, "_blank")}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>

        {sub.cancelled_reason && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-500">
            <strong>Cancelado:</strong> {sub.cancelled_reason}
          </div>
        )}

        <div className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Entregas ({delivered}/{sub.duration_days})
          </div>

          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary opacity-30" />
            </div>
          ) : deliveries.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Entregas ainda não geradas (cliente não iniciou o plano).
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
              {deliveries.map((d) => {
                const isDone = d.status === "delivered";
                const isFailed = d.status === "failed";
                const isSkipped = d.status === "skipped";
                return (
                  <div
                    key={d.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-2.5"
                  >
                    <div className="w-10 text-center">
                      <div className="text-[10px] text-muted-foreground">Dia</div>
                      <div className="font-bold">{d.day_number}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {fmtDateBR(d.scheduled_date)} · {d.credits} créditos
                      </div>
                      <div className="text-xs">
                        {isDone && (
                          <span className="text-emerald-500 inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Entregue {fmtDateTimeBR(d.delivered_at)}
                          </span>
                        )}
                        {isFailed && (
                          <span className="text-rose-500 inline-flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Falhou
                          </span>
                        )}
                        {isSkipped && (
                          <span className="text-zinc-500 inline-flex items-center gap-1">
                            <SkipForward className="h-3 w-3" /> Pulado
                          </span>
                        )}
                        {!isDone && !isFailed && !isSkipped && (
                          <span className="text-muted-foreground inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Aguardando
                          </span>
                        )}
                      </div>
                      {d.notes && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {d.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className={`text-sm font-medium truncate ${mono ? "font-mono" : ""}`} title={v}>{v}</div>
    </div>
  );
}