import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Loader2,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  SkipForward,
  Copy,
  ExternalLink,
  Sparkles,
  Calendar,
  Clock,
  Ban,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

type Sub = {
  id: string;
  order_token: string;
  reseller_id: string;
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
  created_at: string;
  notes: string | null;
  owner_rejected_at: string | null;
  owner_rejected_reason: string | null;
  owner_rejected_count: number;
  owner_confirmation_attempts: number;
  resellers?: { display_name: string | null } | null;
};

type Delivery = {
  id: string;
  subscription_id: string;
  day_number: number;
  scheduled_date: string;
  credits: number;
  status: string;
  delivered_at: string | null;
  delivered_by: string | null;
  notes: string | null;
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  awaiting_owner: { label: "Aguardando cliente", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  awaiting_confirm: { label: "Verificar Owner", cls: "bg-violet-500/15 text-violet-500 border-violet-500/30" },
  owner_rejected: { label: "Owner rejeitado", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  active: { label: "Ativo", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  paused: { label: "Pausado", cls: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30" },
  cancelled: { label: "Cancelado", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30" },
  completed: { label: "Concluído", cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  expired: { label: "Expirado", cls: "bg-zinc-500/15 text-zinc-500 border-zinc-500/30" },
};

const fmtBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const todayBRT = () =>
  new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const fmtDateBR = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";

const fmtDateTimeBR = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";

export default function GerentePlanosAtivos() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("today");
  const [selected, setSelected] = useState<Sub | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reseller_recharge_plan_subscriptions")
        .select(`*, resellers ( display_name )`)
        .order("created_at", { ascending: false });
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
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter((s) => {
      if (q) {
        const hit =
          (s.customer_name ?? "").toLowerCase().includes(q) ||
          (s.workspace_name ?? "").toLowerCase().includes(q) ||
          (s.resellers?.display_name ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [subs, search]);

  const buckets = useMemo(() => {
    const pending = filtered.filter(
      (s) =>
        s.status === "awaiting_owner" ||
        s.status === "awaiting_confirm" ||
        s.status === "owner_rejected",
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

  const toVerifyCount = useMemo(
    () =>
      filtered.filter(
        (s) => s.status === "awaiting_confirm" || s.status === "owner_rejected",
      ).length,
    [filtered],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-30" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Planos vendidos
              </CardTitle>
              <CardDescription>
                Acompanhe e execute as entregas diárias manualmente.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Buscar cliente / workspace / revendedor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-72"
              />
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="today">
                Para entregar hoje
              </TabsTrigger>
              <TabsTrigger value="verify" className="gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verificar Owner
                {toVerifyCount > 0 && (
                  <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                    {toVerifyCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="active">
                Ativos ({buckets.active.length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                Aguardando cliente ({buckets.pending.length})
              </TabsTrigger>
              <TabsTrigger value="done">
                Histórico ({buckets.done.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="today" className="mt-4">
              <TodayList subs={buckets.active} onOpen={setSelected} />
            </TabsContent>
            <TabsContent value="verify" className="mt-4">
              <SubsTable
                subs={filtered.filter(
                  (s) => s.status === "awaiting_confirm" || s.status === "owner_rejected",
                )}
                onOpen={setSelected}
              />
            </TabsContent>
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
        </CardContent>
      </Card>

      {selected && (
        <SubDetailDialog
          sub={selected}
          open={!!selected}
          onOpenChange={(v) => !v && setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

/* ---------- Today list ---------- */
function TodayList({ subs, onOpen }: { subs: Sub[]; onOpen: (s: Sub) => void }) {
  const [pending, setPending] = useState<Record<string, Delivery | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      if (subs.length === 0) {
        setPending({});
        setLoading(false);
        return;
      }
      const today = todayBRT();
      const { data } = await supabase
        .from("recharge_plan_deliveries")
        .select("*")
        .in("subscription_id", subs.map((s) => s.id))
        .lte("scheduled_date", today)
        .eq("status", "pending");
      const map: Record<string, Delivery | null> = {};
      for (const s of subs) map[s.id] = null;
      (data ?? []).forEach((d: any) => {
        // pega o menor day_number pendente por sub
        const cur = map[d.subscription_id];
        if (!cur || d.day_number < cur.day_number) map[d.subscription_id] = d as Delivery;
      });
      setPending(map);
      setLoading(false);
    };
    run();
  }, [subs]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary opacity-30" />
      </div>
    );
  }

  const due = subs.filter((s) => pending[s.id]);
  if (due.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Nenhuma entrega pendente para hoje. 🎉
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {due.map((s) => {
        const d = pending[s.id]!;
        return (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:bg-muted/40"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30 flex items-center justify-center font-bold text-sm">
                {d.day_number}/{s.duration_days}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {s.customer_name ?? "—"}{" "}
                  <span className="text-muted-foreground font-normal">→</span>{" "}
                  <span className="font-mono text-sm">{s.workspace_name}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {s.credits_per_day} créditos • {s.resellers?.display_name ?? "—"} • agendado {fmtDateBR(d.scheduled_date)}
                </div>
              </div>
            </div>
            <Button size="sm" onClick={() => onOpen(s)}>
              Abrir e entregar
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Generic table ---------- */
function SubsTable({ subs, onOpen }: { subs: Sub[]; onOpen: (s: Sub) => void }) {
  if (subs.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        Nada por aqui.
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
            <th className="text-left py-2 px-2">Revendedor</th>
            <th className="text-left py-2 px-2">Status</th>
            <th className="text-right py-2 px-2">Início</th>
            <th className="text-right py-2 px-2">Valor</th>
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
                <td className="py-2 px-2 text-muted-foreground">{s.resellers?.display_name ?? "—"}</td>
                <td className="py-2 px-2">
                  <Badge variant="outline" className={meta.cls}>
                    {meta.label}
                  </Badge>
                </td>
                <td className="py-2 px-2 text-right text-xs text-muted-foreground">
                  {fmtDateBR(s.started_at ?? s.created_at)}
                </td>
                <td className="py-2 px-2 text-right font-mono">{fmtBRL(s.sale_price_cents)}</td>
                <td className="py-2 px-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => onOpen(s)}>
                    Abrir
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

/* ---------- Detail dialog ---------- */
function SubDetailDialog({
  sub,
  open,
  onOpenChange,
  onChanged,
}: {
  sub: Sub;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesByDay, setNotesByDay] = useState<Record<number, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectPreset, setRejectPreset] = useState<string>("Email não encontrado nos membros do workspace");
  const [rejectCustom, setRejectCustom] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);

  const REJECT_PRESETS = [
    "Email não encontrado nos membros do workspace",
    "Email está como Editor — precisa ser Owner",
    "Email está como Admin — precisa ser Owner",
    "Workspace não encontrado com o nome informado",
    "Convite ainda não foi aceito",
    "Outro (descreva abaixo)",
  ];

  const approveOwner = async () => {
    setApproving(true);
    try {
      const now = new Date();
      const endsAt = new Date(now);
      endsAt.setUTCDate(endsAt.getUTCDate() + sub.duration_days);

      const { error: updErr } = await supabase
        .from("reseller_recharge_plan_subscriptions")
        .update({
          status: "active",
          started_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
          owner_rejected_at: null,
          owner_rejected_reason: null,
        })
        .eq("id", sub.id)
        .in("status", ["awaiting_confirm", "owner_rejected"]);
      if (updErr) throw updErr;

      const rows = [];
      for (let i = 1; i <= sub.duration_days; i++) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() + (i - 1));
        rows.push({
          subscription_id: sub.id,
          day_number: i,
          scheduled_date: d.toISOString().slice(0, 10),
          credits: sub.credits_per_day,
          status: "pending",
        });
      }
      const { error: insErr } = await supabase
        .from("recharge_plan_deliveries")
        .upsert(rows, { onConflict: "subscription_id,day_number" });
      if (insErr) throw insErr;

      toast.success("Owner aprovado! Entregas iniciadas.");
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro ao aprovar", { description: e.message });
    } finally {
      setApproving(false);
    }
  };

  const rejectOwner = async () => {
    const isCustom = rejectPreset.startsWith("Outro");
    const reason = (isCustom ? rejectCustom : rejectPreset).trim();
    if (!reason) {
      toast.error("Descreva o motivo da rejeição");
      return;
    }
    setRejecting(true);
    try {
      const { error } = await supabase
        .from("reseller_recharge_plan_subscriptions")
        .update({
          status: "owner_rejected",
          owner_rejected_at: new Date().toISOString(),
          owner_rejected_reason: reason,
          owner_rejected_count: (sub.owner_rejected_count ?? 0) + 1,
        })
        .eq("id", sub.id)
        .in("status", ["awaiting_confirm", "owner_rejected"]);
      if (error) throw error;
      toast.success("Rejeitado. O cliente foi avisado para corrigir.");
      setRejectOpen(false);
      setRejectCustom("");
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro", { description: e.message });
    } finally {
      setRejecting(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("recharge_plan_deliveries")
      .select("*")
      .eq("subscription_id", sub.id)
      .order("day_number", { ascending: true });
    setDeliveries((data ?? []) as Delivery[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open, sub.id]);

  const meta = STATUS_LABEL[sub.status] ?? { label: sub.status, cls: "" };
  const link = `${window.location.origin}/plano/${sub.order_token}`;

  const setDeliveryStatus = async (d: Delivery, status: "delivered" | "skipped" | "failed") => {
    setActing(d.id);
    try {
      const { data: ures } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("recharge_plan_deliveries")
        .update({
          status,
          delivered_at: new Date().toISOString(),
          delivered_by: ures.user?.id ?? null,
          notes: notesByDay[d.day_number]?.trim() || d.notes,
        })
        .eq("id", d.id);
      if (error) throw error;
      // se for a última entrega entregue → marcar plano como concluído
      const fresh = await supabase
        .from("recharge_plan_deliveries")
        .select("status")
        .eq("subscription_id", sub.id);
      const all = (fresh.data ?? []) as { status: string }[];
      if (all.length > 0 && all.every((x) => x.status === "delivered" || x.status === "skipped")) {
        await supabase
          .from("reseller_recharge_plan_subscriptions")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", sub.id);
      }
      toast.success(
        status === "delivered"
          ? "Entrega registrada"
          : status === "skipped"
            ? "Dia pulado"
            : "Marcado como falha",
      );
      await load();
      onChanged();
    } catch (e: any) {
      toast.error("Erro", { description: e.message });
    } finally {
      setActing(null);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado");
  };

  const deliveredCount = deliveries.filter((d) => d.status === "delivered").length;
  const canCancel = !["cancelled", "completed", "expired"].includes(sub.status);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const { data, error } = await invokeAuthenticatedFunction<{
        ok?: boolean;
        error?: string;
        refund_cents?: number;
        refundable_days?: number;
        duration_days?: number;
      }>("recharge-plan-cancel", {
        method: "POST",
        body: {
          subscription_id: sub.id,
          reason: cancelReason.trim() || "Cancelado manualmente pelo gerente",
        },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || "Falha ao cancelar");
      }
      const refundBRL = ((data.refund_cents ?? 0) / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      toast.success("Assinatura cancelada", {
        description: `Estorno de ${refundBRL} (${data.refundable_days}/${data.duration_days} dias) creditado ao revendedor.`,
      });
      setCancelOpen(false);
      setCancelReason("");
      onOpenChange(false);
      onChanged();
    } catch (e: any) {
      toast.error("Erro ao cancelar", { description: e.message });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {sub.customer_name ?? "Cliente"}
            <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
          </DialogTitle>
          <DialogDescription>
            {sub.workspace_name ?? "(workspace ainda não definido)"} •{" "}
            {sub.resellers?.display_name ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4 text-sm">
          <Info k="Email do bot" v={sub.owner_email_required} mono />
          <Info k="Créditos/dia" v={String(sub.credits_per_day)} />
          <Info k="Duração" v={`${sub.duration_days} dias`} />
          <Info k="Horário" v={`${String(sub.delivery_hour).padStart(2, "0")}h BRT`} />
          <Info k="Início" v={fmtDateTimeBR(sub.started_at)} />
          <Info k="Fim" v={fmtDateTimeBR(sub.ends_at)} />
          <Info k="Custo" v={fmtBRL(sub.cost_cents)} />
          <Info k="Venda" v={fmtBRL(sub.sale_price_cents)} />
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-2">
          <Input value={link} readOnly className="font-mono text-xs h-8" />
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(link, "_blank")}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>

        {sub.notes && (
          <div className="rounded-lg border bg-amber-500/5 border-amber-500/30 p-2 text-xs text-amber-700 dark:text-amber-300">
            <strong>Anotação interna:</strong> {sub.notes}
          </div>
        )}

        {(sub.status === "awaiting_confirm" || sub.status === "owner_rejected") && (
          <div className="rounded-xl border-2 border-violet-500/40 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-violet-600 dark:text-violet-300">
              <ShieldCheck className="h-4 w-4" />
              Verificação manual do Owner
              {(sub.owner_confirmation_attempts ?? 0) > 1 && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  Tentativa #{sub.owner_confirmation_attempts}
                </Badge>
              )}
            </div>

            {sub.status === "owner_rejected" && sub.owner_rejected_reason && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div>
                  <strong>Última rejeição ({sub.owner_rejected_count}x):</strong>{" "}
                  {sub.owner_rejected_reason}
                  <div className="text-[10px] opacity-70 mt-0.5">
                    Cliente foi notificado. Aguardando reenvio.
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground leading-relaxed">
              Abra o workspace{" "}
              <code className="font-mono bg-muted px-1 rounded">{sub.workspace_name}</code>{" "}
              no Lovable e confirme que{" "}
              <code className="font-mono bg-muted px-1 rounded">{sub.owner_email_required}</code>{" "}
              está marcado como <strong>Owner</strong> (não Editor / não Admin).
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                onClick={() => setRejectOpen(true)}
                disabled={approving || sub.status === "owner_rejected"}
              >
                <ShieldAlert className="h-4 w-4 mr-2" />
                Rejeitar — não está como Owner
              </Button>
              <Button
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white ml-auto"
                onClick={approveOwner}
                disabled={approving}
              >
                {approving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Aprovar e iniciar entregas
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Entregas ({deliveredCount}/{sub.duration_days})
            </div>
          </div>

          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary opacity-30" />
            </div>
          ) : deliveries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Sem entregas geradas (plano ainda não foi iniciado pelo cliente).
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
              {deliveries.map((d) => {
                const isPending = d.status === "pending";
                const isDone = d.status === "delivered";
                const isFailed = d.status === "failed";
                const isSkipped = d.status === "skipped";
                const due = d.scheduled_date <= todayBRT();
                return (
                  <div
                    key={d.id}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 ${
                      isPending && due
                        ? "bg-emerald-500/5 border-emerald-500/30"
                        : "bg-card"
                    }`}
                  >
                    <div className="w-10 text-center">
                      <div className="text-xs text-muted-foreground">Dia</div>
                      <div className="font-bold">{d.day_number}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {fmtDateBR(d.scheduled_date)} • {d.credits} créditos
                      </div>
                      <div className="text-xs">
                        {isDone && (
                          <span className="text-emerald-500">
                            Entregue {fmtDateTimeBR(d.delivered_at)}
                          </span>
                        )}
                        {isFailed && (
                          <span className="text-rose-500">
                            Falhou {fmtDateTimeBR(d.delivered_at)}
                          </span>
                        )}
                        {isSkipped && (
                          <span className="text-zinc-500">Pulado</span>
                        )}
                        {isPending && !due && (
                          <span className="text-muted-foreground">Aguardando data</span>
                        )}
                        {isPending && due && (
                          <span className="text-emerald-500 font-medium">Pendente para hoje</span>
                        )}
                      </div>
                      {d.notes && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {d.notes}
                        </div>
                      )}
                    </div>
                    {isPending && due && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          placeholder="nota (opcional)"
                          value={notesByDay[d.day_number] ?? ""}
                          onChange={(e) =>
                            setNotesByDay((s) => ({ ...s, [d.day_number]: e.target.value }))
                          }
                          className="h-8 w-44 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => setDeliveryStatus(d, "skipped")}
                          disabled={acting === d.id}
                          title="Pular dia"
                        >
                          <SkipForward className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-rose-500"
                          onClick={() => setDeliveryStatus(d, "failed")}
                          disabled={acting === d.id}
                          title="Falhou"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => setDeliveryStatus(d, "delivered")}
                          disabled={acting === d.id}
                        >
                          {acting === d.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Entregue
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          {canCancel && (
            <Button
              variant="outline"
              className="mr-auto text-rose-500 border-rose-500/40 hover:bg-rose-500/10"
              onClick={() => setCancelOpen(true)}
            >
              <Ban className="h-4 w-4 mr-2" />
              Cancelar assinatura
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>

        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
              <AlertDialogDescription>
                A assinatura será marcada como cancelada e as entregas pendentes/falhas
                não rodarão mais. O valor proporcional aos dias não entregues será
                <strong> estornado automaticamente </strong>
                ao saldo do revendedor.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="cancel-reason" className="text-xs">
                Motivo (opcional)
              </Label>
              <Textarea
                id="cancel-reason"
                placeholder="Ex.: cliente solicitou, fraude, etc."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleCancel();
                }}
                disabled={cancelling}
                className="bg-rose-600 hover:bg-rose-700"
              >
                {cancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Cancelar e estornar"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600">
                <ShieldAlert className="h-5 w-5" />
                Rejeitar verificação do Owner
              </DialogTitle>
              <DialogDescription>
                O cliente receberá a mensagem na página dele explicando o motivo.
                Ele poderá corrigir e reenviar quantas vezes precisar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Motivo da rejeição</Label>
                <div className="grid gap-1.5 mt-1.5">
                  {REJECT_PRESETS.map((p) => (
                    <label
                      key={p}
                      className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm cursor-pointer transition ${
                        rejectPreset === p
                          ? "border-rose-500/60 bg-rose-500/10"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reject-preset"
                        value={p}
                        checked={rejectPreset === p}
                        onChange={() => setRejectPreset(p)}
                        className="accent-rose-500"
                      />
                      <span>{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              {rejectPreset.startsWith("Outro") && (
                <div>
                  <Label htmlFor="reject-custom" className="text-xs">
                    Descreva (será mostrado ao cliente)
                  </Label>
                  <Textarea
                    id="reject-custom"
                    placeholder="Ex.: o email está com erro de digitação no convite…"
                    value={rejectCustom}
                    onChange={(e) => setRejectCustom(e.target.value)}
                    rows={3}
                    maxLength={300}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {rejectCustom.length}/300
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>
                Voltar
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={rejectOwner}
                disabled={rejecting}
              >
                {rejecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Confirmar rejeição
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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