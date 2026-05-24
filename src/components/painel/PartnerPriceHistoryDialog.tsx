import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, History, RotateCcw, Coins, Calendar, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Entry = {
  id: string;
  kind: "credit" | "license";
  pack_key: string;
  old_price_cents: number | null;
  new_price_cents: number | null;
  action: "set" | "clear" | "revert";
  changed_by_name: string | null;
  created_at: string;
};

const LICENSE_LABEL: Record<string, string> = {
  "1d": "Licença 1 dia",
  "7d": "Licença 7 dias",
  "30d": "Licença 30 dias",
  "90d": "Licença 90 dias",
  "365d": "Licença 365 dias",
  lifetime: "Licença Vitalícia",
};

const fmt = (c: number | null) =>
  c == null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

export default function PartnerPriceHistoryDialog({
  open,
  onOpenChange,
  resellerId,
  resellerName,
  onReverted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resellerId: string | null;
  resellerName: string;
  onReverted?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reverting, setReverting] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "credit" | "license">("all");

  const load = async () => {
    if (!resellerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("partner_price_history")
      .select("id,kind,pack_key,old_price_cents,new_price_cents,action,changed_by_name,created_at")
      .eq("reseller_id", resellerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setEntries((data ?? []) as Entry[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resellerId]);

  const revert = async (e: Entry) => {
    if (!resellerId) return;
    setReverting(e.id);
    try {
      // Estado atual antes do revert (para registrar no log)
      let currentCents: number | null = null;
      if (e.kind === "credit") {
        const { data } = await supabase
          .from("reseller_credit_cost_overrides")
          .select("price_cents,is_active")
          .eq("reseller_id", resellerId)
          .eq("credits_amount", Number(e.pack_key))
          .maybeSingle();
        currentCents = data?.is_active ? Number(data.price_cents) : null;
      } else {
        const { data } = await supabase
          .from("reseller_license_cost_overrides")
          .select("price_cents,is_active")
          .eq("reseller_id", resellerId)
          .eq("pack_id", e.pack_key)
          .maybeSingle();
        currentCents = data?.is_active ? Number(data.price_cents) : null;
      }

      // Aplica o old_price_cents da entrada
      const target = e.old_price_cents;
      if (target == null || target <= 0) {
        // Era "sem override" — apaga override atual
        if (e.kind === "credit") {
          const { error } = await supabase
            .from("reseller_credit_cost_overrides")
            .delete()
            .eq("reseller_id", resellerId)
            .eq("credits_amount", Number(e.pack_key));
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("reseller_license_cost_overrides")
            .delete()
            .eq("reseller_id", resellerId)
            .eq("pack_id", e.pack_key);
          if (error) throw error;
        }
      } else {
        if (e.kind === "credit") {
          const { error } = await supabase
            .from("reseller_credit_cost_overrides")
            .upsert(
              { reseller_id: resellerId, credits_amount: Number(e.pack_key), price_cents: target, is_active: true },
              { onConflict: "reseller_id,credits_amount" },
            );
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("reseller_license_cost_overrides")
            .upsert(
              { reseller_id: resellerId, pack_id: e.pack_key, price_cents: target, is_active: true },
              { onConflict: "reseller_id,pack_id" },
            );
          if (error) throw error;
        }
      }

      // Registra a reversão
      const { data: u } = await supabase.auth.getUser();
      const name = u.user?.user_metadata?.display_name || u.user?.email || null;
      await supabase.from("partner_price_history").insert({
        reseller_id: resellerId,
        kind: e.kind,
        pack_key: e.pack_key,
        old_price_cents: currentCents,
        new_price_cents: target,
        action: "revert",
        changed_by: u.user?.id ?? null,
        changed_by_name: name,
        note: `Reverteu para valor de ${fmtDate(e.created_at)}`,
      });

      toast.success("Valor restaurado.");
      await load();
      onReverted?.();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao reverter");
    } finally {
      setReverting(null);
    }
  };

  const filtered = entries.filter((e) => tab === "all" || e.kind === tab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 font-display">
            <History className="h-4 w-4 text-primary" />
            Histórico de custos — {resellerName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Todas as alterações de custo deste parceiro. Use o botão para restaurar um valor anterior.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="px-6 pt-3">
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">Tudo</TabsTrigger>
            <TabsTrigger value="license" className="text-xs gap-1.5">
              <Calendar className="h-3 w-3" /> Licenças
            </TabsTrigger>
            <TabsTrigger value="credit" className="text-xs gap-1.5">
              <Coins className="h-3 w-3" /> Recargas
            </TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-0" />
        </Tabs>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground italic">
              Sem alterações registradas ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => {
                const label =
                  e.kind === "credit"
                    ? `${e.pack_key} créditos`
                    : LICENSE_LABEL[e.pack_key] ?? e.pack_key;
                const Icon = e.kind === "credit" ? Coins : Calendar;
                const actionBadge =
                  e.action === "set" ? (
                    <Badge variant="secondary" className="h-5 text-[10px]">Definiu</Badge>
                  ) : e.action === "clear" ? (
                    <Badge variant="outline" className="h-5 text-[10px] gap-1">
                      <Trash2 className="h-2.5 w-2.5" /> Removeu
                    </Badge>
                  ) : (
                    <Badge className="h-5 text-[10px] gap-1 bg-primary/15 text-primary border-primary/30">
                      <RotateCcw className="h-2.5 w-2.5" /> Reverteu
                    </Badge>
                  );
                return (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/60 p-3 hover:border-primary/30 transition-all"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{label}</span>
                        {actionBadge}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <span className={e.old_price_cents == null ? "italic" : ""}>
                          {e.old_price_cents == null ? "sem custo" : fmt(e.old_price_cents)}
                        </span>
                        <ArrowRight className="h-3 w-3" />
                        <span className={`font-bold ${e.new_price_cents == null ? "italic text-muted-foreground" : "text-foreground"}`}>
                          {e.new_price_cents == null ? "sem custo" : fmt(e.new_price_cents)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {fmtDate(e.created_at)}
                        {e.changed_by_name ? ` • por ${e.changed_by_name}` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revert(e)}
                      disabled={reverting === e.id}
                      title="Restaurar o valor anterior a esta alteração"
                      className="h-8 gap-1.5 text-xs"
                    >
                      {reverting === e.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Restaurar anterior
                    </Button>
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