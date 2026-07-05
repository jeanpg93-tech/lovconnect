import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Save, History, Sparkles, Plus, CalendarIcon, Play, Square, Pencil, Trash2, Zap, Gift, Tag, Copy, ChevronDown,
  Rocket,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Promotion = {
  id: string;
  name: string;
  description: string | null;
  extension_discount_pct: number | null;
  credit_discount_pct: number | null;
  recharge_bonus_pct: number | null;
  activation_discount_pct: number | null;
  activation_discount_cents: number | null;
  activation_fixed_price_cents: number | null;
  activation_bonus_cents: number | null;
  activation_promote_to_tier_id: string | null;
  activation_referral_extra_pct: number | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "scheduled" | "active" | "paused" | "ended";
  activated_at: string | null;
  deactivated_at: string | null;
  created_at: string;
  claude_discount_by_tier: Record<string, number> | null;
};

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PromotionLog = {
  id: string;
  promotion_id: string | null;
  event: string;
  details: any;
  created_at: string;
};

function fmtBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  return new Date(v).toISOString();
}

const EVENT_LABEL: Record<string, string> = {
  created: "Criada",
  edited: "Editada",
  scheduled: "Reagendada",
  activated: "Ativada",
  deactivated: "Pausada",
  ended: "Encerrada",
  deleted: "Excluída",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendada",
  active: "Ativa",
  paused: "Pausada",
  ended: "Encerrada",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  active: "default",
  paused: "outline",
  ended: "outline",
};

export default function GerenteAcoesEspeciais() {
  // Defaults sempre ativos
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [defaults, setDefaults] = useState({
    extension_discount_pct: 0,
    credit_discount_pct: 0,
    recharge_bonus_pct: 0,
  });

  // Promoções
  const [loadingPromos, setLoadingPromos] = useState(true);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [logs, setLogs] = useState<PromotionLog[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);

  const activePromos = promotions.filter((p) => p.status === "active");
  const scheduledPromos = promotions.filter((p) => p.status === "scheduled");
  const endedPromos = promotions.filter((p) => p.status === "ended" || p.status === "paused").slice(0, 10);

  const fetchDefaults = useCallback(async () => {
    setLoadingDefaults(true);
    const { data, error } = await supabase.from("global_settings").select("key, value");
    if (error) { toast.error("Erro ao carregar padrões"); setLoadingDefaults(false); return; }
    const next = { ...defaults };
    data?.forEach((it: any) => {
      if (it.key in next) (next as any)[it.key] = Number(it.value);
    });
    setDefaults(next);
    setLoadingDefaults(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPromotions = useCallback(async () => {
    setLoadingPromos(true);
    const [pRes, lRes] = await Promise.all([
      supabase.from("promotions").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("promotion_logs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    if (pRes.error) toast.error("Erro ao carregar promoções");
    else setPromotions((pRes.data as any) || []);
    if (!lRes.error) setLogs((lRes.data as any) || []);
    setLoadingPromos(false);
  }, []);

  useEffect(() => {
    fetchDefaults();
    fetchPromotions();
  }, [fetchDefaults, fetchPromotions]);

  async function saveDefault(key: string, value: number) {
    setSavingKey(key);
    const { error } = await supabase
      .from("global_settings")
      .upsert({ key, value: value.toString(), updated_at: new Date().toISOString() });
    setSavingKey(null);
    if (error) { toast.error("Erro ao salvar"); return; }
    await supabase.from("admin_audit_logs").insert({ action: "update_setting", details: { key, value } });
    toast.success("Padrão atualizado");
  }

  async function activateNow(p: Promotion) {
    const { error } = await supabase.from("promotions")
      .update({ status: "active", activated_at: new Date().toISOString(), starts_at: p.starts_at ?? new Date().toISOString() })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success("Promoção ativada"); fetchPromotions(); }
  }

  async function deactivateNow(p: Promotion) {
    const { error } = await supabase.from("promotions")
      .update({ status: "ended", deactivated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success("Promoção desativada"); fetchPromotions(); }
  }

  async function deletePromo(p: Promotion) {
    const { error } = await supabase.from("promotions").delete().eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success("Promoção removida"); fetchPromotions(); }
  }

  function duplicatePromo(p: Promotion) {
    setEditing({
      ...p,
      id: "" as any,
      name: `${p.name} (cópia)`,
      status: "scheduled",
      activated_at: null,
      deactivated_at: null,
      starts_at: null,
      ends_at: null,
    });
    setCreateOpen(true);
  }

  function reactivatePromo(p: Promotion) {
    // Reabre a mesma promoção para edição rápida: mantém id e valores,
    // zera datas/estados para o usuário revisar e ativar em poucos cliques.
    setEditing({
      ...p,
      status: "scheduled",
      activated_at: null,
      deactivated_at: null,
      starts_at: null,
      ends_at: null,
    });
    setCreateOpen(true);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Promoções</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Promoções programadas e descontos padrão para todo o sistema.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setCreateOpen(true); }} className="gap-2 w-full sm:w-auto shrink-0">
          <Plus className="h-4 w-4" /> Nova promoção
        </Button>
      </div>

      {/* === PROMOÇÕES ATIVAS === */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {activePromos.length > 1 ? `Promoções ativas agora (${activePromos.length})` : "Promoção ativa agora"}
        </h2>
        {loadingPromos ? (
          <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>
        ) : activePromos.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {activePromos.map((ap) => (
              <Card
                key={ap.id}
                className="relative overflow-hidden border-primary/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-md shadow-primary/10"
              >
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base leading-tight break-words">{ap.name}</CardTitle>
                        <Badge className="gap-1.5 text-[10px] uppercase tracking-wide font-semibold">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                          </span>
                          Ao vivo
                        </Badge>
                      </div>
                      {ap.description && (
                        <CardDescription className="mt-1.5 line-clamp-2">{ap.description}</CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PromoValues p={ap} compact />
                  {ap.ends_at && <Countdown endsAt={ap.ends_at} />}

                  <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Play className="h-3 w-3 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Início</div>
                        <div className="font-medium truncate">{fmtBR(ap.starts_at ?? ap.activated_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Square className="h-3 w-3 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fim</div>
                        <div className="font-medium truncate">{ap.ends_at ? fmtBR(ap.ends_at) : "sem data fim"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditing(ap); setCreateOpen(true); }}
                      className="gap-1.5 h-8 px-2.5"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => duplicatePromo(ap)}
                      className="gap-1.5 h-8 px-2.5"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Duplicar</span>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 h-8 px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                        >
                          <Square className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Desativar</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Desativar promoção?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A promoção "{ap.name}" será encerrada imediatamente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deactivateNow(ap)}>Desativar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-10 text-center space-y-2">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma promoção ativa no momento.</p>
              <Button variant="link" size="sm" onClick={() => { setEditing(null); setCreateOpen(true); }}>
                Criar uma agora
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      {/* === AGENDADAS === */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarIcon className="h-4 w-4" /> Promoções agendadas
        </h2>
        {scheduledPromos.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Nenhuma promoção agendada.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {scheduledPromos.map((p) => (
              <Card
                key={p.id}
                className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-primary/5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base leading-tight">{p.name}</CardTitle>
                        <Badge variant="secondary" className="gap-1 text-[10px] uppercase tracking-wide font-semibold">
                          <CalendarIcon className="h-3 w-3" /> Agendada
                        </Badge>
                      </div>
                      {p.description && (
                        <CardDescription className="mt-1.5 line-clamp-2">{p.description}</CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <PromoValues p={p} compact />

                  <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Play className="h-3 w-3 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Início</div>
                        <div className="font-medium truncate">{p.starts_at ? fmtBR(p.starts_at) : "ao ativar"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Square className="h-3 w-3 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fim</div>
                        <div className="font-medium truncate">{p.ends_at ? fmtBR(p.ends_at) : "sem fim"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <Button
                      size="sm"
                      onClick={() => activateNow(p)}
                      className="gap-1.5 flex-1 sm:flex-none bg-gradient-to-r from-primary to-primary/85 hover:from-primary hover:to-primary shadow-sm shadow-primary/30"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" /> Ativar agora
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditing(p); setCreateOpen(true); }}
                      className="gap-1.5 h-8 px-2.5"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => duplicatePromo(p)}
                      className="gap-1.5 h-8 px-2.5"
                      title="Duplicar"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Duplicar</span>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 h-8 px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                          title="Cancelar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Cancelar</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancelar promoção agendada?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Voltar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deletePromo(p)}>Cancelar promoção</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* === DEFAULTS PERMANENTES === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2 text-muted-foreground">
            <Tag className="h-4 w-4" /> Descontos padrão (sempre ativos)
          </h2>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Valores de base. Promoções programadas substituem enquanto estiverem ativas.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <DefaultCard
            icon={<Tag className="h-4 w-4" />}
            title="Desconto em Extensões"
            description="Aplicado a todas as licenças/extensões."
            value={defaults.extension_discount_pct}
            max={100}
            disabled={loadingDefaults}
            saving={savingKey === "extension_discount_pct"}
            onChange={(v) => setDefaults({ ...defaults, extension_discount_pct: v })}
            onSave={() => saveDefault("extension_discount_pct", defaults.extension_discount_pct)}
          />
          <DefaultCard
            icon={<Zap className="h-4 w-4" />}
            title="Desconto em Recargas de Créditos"
            description="Aplicado na compra de pacotes de crédito."
            value={defaults.credit_discount_pct}
            max={100}
            disabled={loadingDefaults}
            saving={savingKey === "credit_discount_pct"}
            onChange={(v) => setDefaults({ ...defaults, credit_discount_pct: v })}
            onSave={() => saveDefault("credit_discount_pct", defaults.credit_discount_pct)}
          />
          <DefaultCard
            icon={<Gift className="h-4 w-4" />}
            title="Bônus de Recargas de Saldo no Painel"
            description="Crédito extra na carteira após confirmar recarga."
            value={defaults.recharge_bonus_pct}
            max={500}
            disabled={loadingDefaults}
            saving={savingKey === "recharge_bonus_pct"}
            onChange={(v) => setDefaults({ ...defaults, recharge_bonus_pct: v })}
            onSave={() => saveDefault("recharge_bonus_pct", defaults.recharge_bonus_pct)}
          />
        </div>
      </section>

      {/* === HISTÓRICO === */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <History className="h-4 w-4" /> Histórico
        </h2>
        <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-muted/20">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-muted-foreground/40 via-muted-foreground/20 to-transparent" />
          <CardContent className="pt-6">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Nenhum evento registrado ainda.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {logs.map((l) => {
                  const promo = promotions.find((p) => p.id === l.promotion_id);
                  return (
                    <div key={l.id} className="py-2.5 text-sm flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <span className="font-medium">{EVENT_LABEL[l.event] || l.event}</span>
                        {promo && <span className="text-muted-foreground"> — {promo.name}</span>}
                        {l.details?.from && l.details?.to && (
                          <span className="text-muted-foreground"> ({l.details.from} → {l.details.to})</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{fmtBR(l.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        {endedPromos.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {endedPromos.length} promoção(ões) encerrada(s) recentemente.
          </p>
        )}
      </section>

      <PromotionDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        onSaved={() => { setCreateOpen(false); setEditing(null); fetchPromotions(); }}
      />
    </div>
  );
}

function DefaultCard({ icon, title, description, value, max, saving, disabled, onChange, onSave }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: number;
  max: number;
  saving: boolean;
  disabled: boolean;
  onChange: (v: number) => void;
  onSave: () => void;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-primary/5 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary/30 to-transparent" />
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-start gap-2 leading-tight">
          <span className="shrink-0 mt-0.5 text-primary">{icon}</span>
          <span>{title}</span>
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            type="number" min={0} max={max}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <Button onClick={onSave} disabled={saving || disabled}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PromoValues({ p, compact, big }: { p: Promotion; compact?: boolean; big?: boolean }) {
  const items: { icon: React.ReactNode; label: string; value: string }[] = [];
  const sz = big ? "h-4 w-4" : "h-3.5 w-3.5";
  if (p.extension_discount_pct != null) items.push({ icon: <Tag className={sz} />, label: "Extensões", value: `-${p.extension_discount_pct}%` });
  if (p.credit_discount_pct != null) items.push({ icon: <Zap className={sz} />, label: "Recargas de Créditos", value: `-${p.credit_discount_pct}%` });
  if (p.recharge_bonus_pct != null) items.push({ icon: <Gift className={sz} />, label: "Bônus de Saldo", value: `+${p.recharge_bonus_pct}%` });
  if (p.activation_discount_pct != null) items.push({ icon: <Rocket className={sz} />, label: "Adesão", value: `-${p.activation_discount_pct}%` });
  if (p.activation_discount_cents != null) items.push({ icon: <Rocket className={sz} />, label: "Adesão", value: `-${fmtBRL(p.activation_discount_cents)}` });
  if (p.activation_fixed_price_cents != null) items.push({ icon: <Rocket className={sz} />, label: "Adesão por", value: fmtBRL(p.activation_fixed_price_cents) });
  if (p.activation_bonus_cents != null && p.activation_bonus_cents > 0) items.push({ icon: <Gift className={sz} />, label: "Bônus na adesão", value: `+${fmtBRL(p.activation_bonus_cents)}` });
  if (p.claude_discount_by_tier && Object.keys(p.claude_discount_by_tier).length > 0) {
    const parts = Object.entries(p.claude_discount_by_tier)
      .filter(([, v]) => Number(v) > 0)
      .map(([slug, v]) => `${slug} -${v}%`)
      .join(" / ");
    if (parts) items.push({ icon: <Sparkles className={sz} />, label: "Claude por nível", value: parts });
  }
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Badge key={it.label} variant="secondary" className={cn("gap-1.5", big && "px-3 py-1.5 text-sm")}>
          {it.icon}{it.label} <span className="font-bold">{it.value}</span>
        </Badge>
      ))}
    </div>
  );
}

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = new Date(endsAt).getTime();
  const diff = Math.max(0, end - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (diff <= 0) {
    return <div className="text-xs text-muted-foreground">Encerrando…</div>;
  }
  const parts = [
    { v: d, l: "d" },
    { v: h, l: "h" },
    { v: m, l: "min" },
    { v: s, l: "s" },
  ].filter((x, i) => i > 0 || x.v > 0);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Termina em</span>
      <div className="flex items-center gap-1 font-mono font-semibold tabular-nums">
        {parts.map((p, i) => (
          <span key={p.l} className="rounded bg-background/60 border px-1.5 py-0.5">
            {String(p.v).padStart(2, "0")}<span className="text-[10px] text-muted-foreground ml-0.5">{p.l}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PromotionDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Promotion | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [useExt, setUseExt] = useState(false);
  const [useCred, setUseCred] = useState(false);
  const [useBonus, setUseBonus] = useState(false);
  const [extPct, setExtPct] = useState(10);
  const [credPct, setCredPct] = useState(10);
  const [bonusPct, setBonusPct] = useState(10);
  // Promo de adesão
  const [useActivation, setUseActivation] = useState(false);
  const [activationMode, setActivationMode] = useState<"pct" | "amount" | "fixed">("pct");
  const [activationPct, setActivationPct] = useState(50);
  const [activationDiscountReais, setActivationDiscountReais] = useState(100); // R$
  const [activationFixedReais, setActivationFixedReais] = useState(100); // R$
  const [useActivationBonus, setUseActivationBonus] = useState(false);
  const [activationBonusReais, setActivationBonusReais] = useState(50); // R$
  // Promo de adesão — nível inicial e comissão extra de indicação
  const [usePromoteTier, setUsePromoteTier] = useState(false);
  const [promoteTierId, setPromoteTierId] = useState<string>("");
  const [useReferralExtra, setUseReferralExtra] = useState(false);
  const [referralExtraPct, setReferralExtraPct] = useState<number>(5);
  const [tiers, setTiers] = useState<Array<{ id: string; name: string; slug: string; sort_order: number }>>([]);
  // Desconto Claude por nível
  const [useClaude, setUseClaude] = useState(false);
  const [claudeByTier, setClaudeByTier] = useState<Record<string, number>>({});
  const [startMode, setStartMode] = useState<"now" | "schedule">("now");
  const [endMode, setEndMode] = useState<"none" | "schedule">("none");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("reseller_tiers")
      .select("id,name,slug,sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setTiers((data ?? []) as any));
  }, [open]);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setDescription(editing.description ?? "");
        setUseExt(editing.extension_discount_pct != null);
        setUseCred(editing.credit_discount_pct != null);
        setUseBonus(editing.recharge_bonus_pct != null);
        if (editing.extension_discount_pct != null) setExtPct(Number(editing.extension_discount_pct));
        if (editing.credit_discount_pct != null) setCredPct(Number(editing.credit_discount_pct));
        if (editing.recharge_bonus_pct != null) setBonusPct(Number(editing.recharge_bonus_pct));
        const hasActivation =
          editing.activation_discount_pct != null ||
          editing.activation_discount_cents != null ||
          editing.activation_fixed_price_cents != null;
        setUseActivation(hasActivation);
        if (editing.activation_discount_pct != null) {
          setActivationMode("pct");
          setActivationPct(Number(editing.activation_discount_pct));
        } else if (editing.activation_discount_cents != null) {
          setActivationMode("amount");
          setActivationDiscountReais(Number(editing.activation_discount_cents) / 100);
        } else if (editing.activation_fixed_price_cents != null) {
          setActivationMode("fixed");
          setActivationFixedReais(Number(editing.activation_fixed_price_cents) / 100);
        }
        setUseActivationBonus(editing.activation_bonus_cents != null && editing.activation_bonus_cents > 0);
        if (editing.activation_bonus_cents != null) {
          setActivationBonusReais(Number(editing.activation_bonus_cents) / 100);
        }
        setUsePromoteTier(!!editing.activation_promote_to_tier_id);
        setPromoteTierId(editing.activation_promote_to_tier_id ?? "");
        setUseReferralExtra(editing.activation_referral_extra_pct != null);
        if (editing.activation_referral_extra_pct != null) {
          setReferralExtraPct(Number(editing.activation_referral_extra_pct));
        }
        const cbt = editing.claude_discount_by_tier;
        setUseClaude(!!cbt && Object.keys(cbt).length > 0);
        setClaudeByTier(cbt ? Object.fromEntries(Object.entries(cbt).map(([k, v]) => [k, Number(v)])) : {});
        setStartMode(editing.starts_at ? "schedule" : "now");
        setEndMode(editing.ends_at ? "schedule" : "none");
        setStartsAt(toLocalInputValue(editing.starts_at));
        setEndsAt(toLocalInputValue(editing.ends_at));
      } else {
        setName(""); setDescription("");
        setUseExt(false); setUseCred(false); setUseBonus(false);
        setExtPct(10); setCredPct(10); setBonusPct(10);
        setUseActivation(false);
        setActivationMode("pct");
        setActivationPct(50);
        setActivationDiscountReais(100);
        setActivationFixedReais(100);
        setUseActivationBonus(false);
        setActivationBonusReais(50);
        setUsePromoteTier(false);
        setPromoteTierId("");
        setUseReferralExtra(false);
        setReferralExtraPct(5);
        setUseClaude(false);
        setClaudeByTier({});
        setStartMode("now"); setEndMode("none");
        setStartsAt(""); setEndsAt("");
      }
    }
  }, [open, editing]);

  async function handleSave(activateNow: boolean) {
    if (!name.trim()) { toast.error("Dê um nome para a promoção"); return; }
    if (!useExt && !useCred && !useBonus && !useActivation && !useActivationBonus && !usePromoteTier && !useReferralExtra && !useClaude) {
      toast.error("Selecione pelo menos um desconto/bônus"); return;
    }
    if (usePromoteTier && !promoteTierId) {
      toast.error("Escolha o nível inicial"); return;
    }
    if (useReferralExtra && (referralExtraPct <= 0 || referralExtraPct > 100)) {
      toast.error("Informe um % de indicação válido (1-100)"); return;
    }

    const starts_at = startMode === "schedule" ? fromLocalInputValue(startsAt) : null;
    const ends_at = endMode === "schedule" ? fromLocalInputValue(endsAt) : null;

    if (startMode === "schedule" && !starts_at) { toast.error("Defina a data de início"); return; }
    if (endMode === "schedule" && !ends_at) { toast.error("Defina a data de fim"); return; }
    if (starts_at && ends_at && new Date(ends_at) <= new Date(starts_at)) {
      toast.error("Data de fim deve ser depois do início"); return;
    }

    // Monta desconto Claude por nível (apenas tiers com valor > 0)
    let claudePayload: Record<string, number> | null = null;
    if (useClaude) {
      const entries = Object.entries(claudeByTier)
        .map(([slug, v]) => [slug, Number(v)] as const)
        .filter(([, v]) => Number.isFinite(v) && v > 0);
      if (entries.length === 0) {
        toast.error("Informe pelo menos um % de desconto Claude para algum nível"); return;
      }
      if (entries.some(([, v]) => v < 0 || v > 100)) {
        toast.error("Descontos Claude devem estar entre 0 e 100%"); return;
      }
      claudePayload = Object.fromEntries(entries);
    }

    const willActivate =
      activateNow || (startMode === "now" && (!editing || editing.status !== "active"));
    const payload: any = {
      name: name.trim(),
      description: description.trim() || null,
      extension_discount_pct: useExt ? extPct : null,
      credit_discount_pct: useCred ? credPct : null,
      recharge_bonus_pct: useBonus ? bonusPct : null,
      activation_discount_pct:      useActivation && activationMode === "pct"    ? activationPct                                     : null,
      activation_discount_cents:    useActivation && activationMode === "amount" ? Math.round(activationDiscountReais * 100)         : null,
      activation_fixed_price_cents: useActivation && activationMode === "fixed"  ? Math.round(activationFixedReais * 100)            : null,
      activation_bonus_cents:       useActivationBonus                            ? Math.round(activationBonusReais * 100)           : null,
      activation_promote_to_tier_id: usePromoteTier ? promoteTierId : null,
      activation_referral_extra_pct: useReferralExtra ? referralExtraPct : null,
      claude_discount_by_tier: claudePayload,
      starts_at,
      ends_at,
      status: willActivate ? "active" : "scheduled",
      activated_at: willActivate ? new Date().toISOString() : null,
    };

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("promotions").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("promotions").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
      toast.success(editing ? "Promoção atualizada" : willActivate ? "Promoção ativada" : "Promoção agendada");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar promoção" : "Nova promoção"}</DialogTitle>
          <DialogDescription>
            Configure descontos, bônus e a janela de validade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Promo Black Friday" />
          </div>
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <Separator />
          <div className="space-y-3">
            <Label>O que esta promoção oferece?</Label>
            <PctRow enabled={useExt} setEnabled={setUseExt} label="Desconto em extensões" value={extPct} setValue={setExtPct} max={100} suffix="%" />
            <PctRow enabled={useCred} setEnabled={setUseCred} label="Desconto em recargas de créditos" value={credPct} setValue={setCredPct} max={100} suffix="%" />
            <PctRow enabled={useBonus} setEnabled={setUseBonus} label="Bônus de recargas de saldo no painel" value={bonusPct} setValue={setBonusPct} max={500} suffix="%" />
          </div>

          <Separator />
          <div className="space-y-3">
            <div>
              <Label className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" /> Desconto Claude por nível
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Aplicado automaticamente no <span className="font-medium text-foreground">custo debitado da carteira</span> do revendedor a cada emissão/renovação de chave Claude. O preço de venda ao cliente final <span className="font-medium text-foreground">não muda</span>.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={useClaude} onCheckedChange={setUseClaude} />
              <Label className="flex-1 text-sm leading-tight">Aplicar desconto no custo Claude por nível</Label>
            </div>
            {useClaude && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                {tiers.length === 0 && (
                  <p className="text-xs text-muted-foreground">Carregando níveis…</p>
                )}
                {tiers.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <Label className="flex-1 text-sm">{t.name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      value={claudeByTier[t.slug] ?? 0}
                      onChange={(e) => setClaudeByTier({ ...claudeByTier, [t.slug]: Number(e.target.value) })}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                  Deixe 0% para não aplicar desconto naquele nível.
                </p>
              </div>
            )}
          </div>

          <Separator />
          <div className="space-y-3">
            <div>
              <Label className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" /> Promoção de adesão (novos revendedores)
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Preço normal da adesão ao painel: <span className="font-medium text-foreground">R$ 200,00</span>.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={useActivation} onCheckedChange={setUseActivation} />
              <Label className="flex-1 text-sm leading-tight">Aplicar desconto na adesão</Label>
            </div>

            {useActivation && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant={activationMode === "pct" ? "default" : "outline"} onClick={() => setActivationMode("pct")}>Percentual</Button>
                  <Button type="button" size="sm" variant={activationMode === "amount" ? "default" : "outline"} onClick={() => setActivationMode("amount")}>Desconto em R$</Button>
                  <Button type="button" size="sm" variant={activationMode === "fixed" ? "default" : "outline"} onClick={() => setActivationMode("fixed")}>Preço fixo</Button>
                </div>

                {activationMode === "pct" && (
                  <div className="flex items-center gap-2">
                    <Label className="flex-1 text-sm">Desconto sobre R$ 200,00</Label>
                    <Input type="number" min={0} max={100} value={activationPct} onChange={(e) => setActivationPct(Number(e.target.value))} className="w-24" />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
                {activationMode === "amount" && (
                  <div className="flex items-center gap-2">
                    <Label className="flex-1 text-sm">Desconto fixo</Label>
                    <span className="text-sm text-muted-foreground">R$</span>
                    <Input type="number" min={0} step="0.01" value={activationDiscountReais} onChange={(e) => setActivationDiscountReais(Number(e.target.value))} className="w-28" />
                  </div>
                )}
                {activationMode === "fixed" && (
                  <div className="flex items-center gap-2">
                    <Label className="flex-1 text-sm">Preço promocional</Label>
                    <span className="text-sm text-muted-foreground">R$</span>
                    <Input type="number" min={0} step="0.01" value={activationFixedReais} onChange={(e) => setActivationFixedReais(Number(e.target.value))} className="w-28" />
                  </div>
                )}

                <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                  Revendedor pagará: <span className="font-semibold text-foreground">
                    {fmtBRL(
                      activationMode === "fixed"
                        ? Math.round(activationFixedReais * 100)
                        : activationMode === "pct"
                          ? Math.max(0, 20000 - Math.round(20000 * activationPct / 100))
                          : Math.max(0, 20000 - Math.round(activationDiscountReais * 100))
                    )}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch checked={useActivationBonus} onCheckedChange={setUseActivationBonus} />
              <Label className="flex-1 text-sm leading-tight">Bônus de saldo extra na carteira (além do que ele pagar)</Label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">R$</span>
                <Input type="number" min={0} step="0.01" value={activationBonusReais} disabled={!useActivationBonus} onChange={(e) => setActivationBonusReais(Number(e.target.value))} className="w-24" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={usePromoteTier} onCheckedChange={setUsePromoteTier} />
              <Label className="flex-1 text-sm leading-tight">Nível inicial do novo revendedor (piso mínimo)</Label>
              <Select value={promoteTierId} onValueChange={setPromoteTierId} disabled={!usePromoteTier}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="Escolher" />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {usePromoteTier && (
              <p className="text-xs text-muted-foreground -mt-1 ml-12">
                O revendedor começa neste nível, mas a progressão por gasto continua normal — ele sobe para o próximo nível quando atingir a meta de gastos configurada.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Switch checked={useReferralExtra} onCheckedChange={setUseReferralExtra} />
              <Label className="flex-1 text-sm leading-tight">Bônus extra de indicação sobre a adesão</Label>
              <div className="flex items-center gap-1">
                <Input type="number" min={0} max={100} step="0.5" value={referralExtraPct} disabled={!useReferralExtra} onChange={(e) => setReferralExtraPct(Number(e.target.value))} className="w-20" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
            {useReferralExtra && (
              <p className="text-xs text-muted-foreground -mt-1 ml-12">
                Quem indicou o novo revendedor ganha a comissão normal do nível dele <span className="font-medium text-foreground">+ {referralExtraPct}%</span> extras sobre o valor pago da adesão. Creditado direto no saldo.
              </p>
            )}
          </div>

          <Separator />
          <div className="space-y-3">
            <Label>Quando iniciar?</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={startMode === "now" ? "default" : "outline"} onClick={() => setStartMode("now")}>Agora</Button>
              <Button type="button" size="sm" variant={startMode === "schedule" ? "default" : "outline"} onClick={() => setStartMode("schedule")}>Agendar</Button>
            </div>
            {startMode === "schedule" && (
              <DateTimeField value={startsAt} onChange={setStartsAt} />
            )}
          </div>

          <div className="space-y-3">
            <Label>Quando terminar?</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={endMode === "none" ? "default" : "outline"} onClick={() => setEndMode("none")}>Sem data fim</Button>
              <Button type="button" size="sm" variant={endMode === "schedule" ? "default" : "outline"} onClick={() => setEndMode("schedule")}>Agendar fim</Button>
            </div>
            {endMode === "schedule" && (
              <DateTimeField value={endsAt} onChange={setEndsAt} />
            )}
          </div>

          <Separator />
          <PromotionSummary
            name={name}
            useExt={useExt} extPct={extPct}
            useCred={useCred} credPct={credPct}
            useBonus={useBonus} bonusPct={bonusPct}
            useActivation={useActivation}
            activationMode={activationMode}
            activationPct={activationPct}
            activationDiscountReais={activationDiscountReais}
            activationFixedReais={activationFixedReais}
            useActivationBonus={useActivationBonus}
            activationBonusReais={activationBonusReais}
            usePromoteTier={usePromoteTier}
            promoteTierId={promoteTierId}
            tiers={tiers}
            useReferralExtra={useReferralExtra}
            referralExtraPct={referralExtraPct}
            useClaude={useClaude}
            claudeByTier={claudeByTier}
            startMode={startMode}
            startsAt={startsAt}
            endMode={endMode}
            endsAt={endsAt}
          />
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          {!editing && startMode === "schedule" && (
            <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar e ativar agora"}
            </Button>
          )}
          <Button onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              startMode === "now" && (!editing || editing.status !== "active") ? "Ativar" : "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PctRow({ enabled, setEnabled, label, value, setValue, max, suffix }: {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  label: string;
  value: number;
  setValue: (v: number) => void;
  max: number;
  suffix: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Switch checked={enabled} onCheckedChange={setEnabled} />
      <Label className="flex-1 text-sm leading-tight">{label}</Label>
      <div className="flex items-center gap-1">
        <Input
          type="number" min={0} max={max} value={value}
          disabled={!enabled}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-20"
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );
}

function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // value is "YYYY-MM-DDTHH:mm" (local). Split into date + time.
  const date = value ? new Date(value) : undefined;
  const time = value ? value.slice(11, 16) : "12:00";

  function setDate(d: Date | undefined) {
    if (!d) return;
    const [hh, mm] = (time || "12:00").split(":");
    const next = new Date(d);
    next.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
    const tz = next.getTimezoneOffset() * 60000;
    onChange(new Date(next.getTime() - tz).toISOString().slice(0, 16));
  }
  function setTime(t: string) {
    const base = date ?? new Date();
    const [hh, mm] = t.split(":");
    const next = new Date(base);
    next.setHours(Number(hh) || 0, Number(mm) || 0, 0, 0);
    const tz = next.getTimezoneOffset() * 60000;
    onChange(new Date(next.getTime() - tz).toISOString().slice(0, 16));
  }

  return (
    <div className="flex gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("flex-1 justify-start text-left font-normal", !date && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, "PPP", { locale: ptBR }) : "Escolha a data"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            initialFocus
            locale={ptBR}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-28"
      />
    </div>
  );
}

function PromotionSummary(props: {
  name: string;
  useExt: boolean; extPct: number;
  useCred: boolean; credPct: number;
  useBonus: boolean; bonusPct: number;
  useActivation: boolean;
  activationMode: "pct" | "amount" | "fixed";
  activationPct: number;
  activationDiscountReais: number;
  activationFixedReais: number;
  useActivationBonus: boolean;
  activationBonusReais: number;
  usePromoteTier: boolean;
  promoteTierId: string;
  tiers: Array<{ id: string; name: string; slug: string; sort_order: number }>;
  useReferralExtra: boolean;
  referralExtraPct: number;
  useClaude: boolean;
  claudeByTier: Record<string, number>;
  startMode: "now" | "schedule";
  startsAt: string;
  endMode: "none" | "schedule";
  endsAt: string;
}) {
  const items: Array<{ icon: JSX.Element; title: string; desc: string }> = [];

  if (props.useExt) items.push({
    icon: <Tag className="h-4 w-4 text-fuchsia-500" />,
    title: `${props.extPct}% OFF em extensões`,
    desc: "Aplicado automaticamente nas compras de extensões.",
  });
  if (props.useCred) items.push({
    icon: <Zap className="h-4 w-4 text-amber-500" />,
    title: `${props.credPct}% OFF em recargas de créditos`,
    desc: "Desconto no valor de cada recarga de créditos.",
  });
  if (props.useBonus) items.push({
    icon: <Gift className="h-4 w-4 text-emerald-500" />,
    title: `+${props.bonusPct}% de bônus em recargas de saldo`,
    desc: "Saldo extra creditado no painel a cada recarga.",
  });

  if (props.useActivation) {
    const finalCents =
      props.activationMode === "fixed"
        ? Math.round(props.activationFixedReais * 100)
        : props.activationMode === "pct"
          ? Math.max(0, 20000 - Math.round(20000 * props.activationPct / 100))
          : Math.max(0, 20000 - Math.round(props.activationDiscountReais * 100));
    const modeLabel =
      props.activationMode === "pct" ? `${props.activationPct}% OFF` :
      props.activationMode === "amount" ? `R$ ${props.activationDiscountReais.toFixed(2)} OFF` :
      `Preço fixo`;
    items.push({
      icon: <Rocket className="h-4 w-4 text-primary" />,
      title: `Adesão por ${fmtBRL(finalCents)} (${modeLabel})`,
      desc: "Novos revendedores pagam esse valor para ativar o painel.",
    });
  }
  if (props.useActivationBonus) items.push({
    icon: <Gift className="h-4 w-4 text-emerald-500" />,
    title: `+${fmtBRL(Math.round(props.activationBonusReais * 100))} de saldo extra`,
    desc: "Creditado na carteira do novo revendedor além do valor que ele pagou.",
  });
  if (props.usePromoteTier) {
    const tier = props.tiers.find((t) => t.id === props.promoteTierId);
    items.push({
      icon: <Sparkles className="h-4 w-4 text-violet-500" />,
      title: `Começa no nível ${tier?.name ?? "—"}`,
      desc: "Piso mínimo. A progressão por gasto continua normal a partir daí.",
    });
  }
  if (props.useReferralExtra) items.push({
    icon: <Gift className="h-4 w-4 text-emerald-500" />,
    title: `+${props.referralExtraPct}% extras para o indicador`,
    desc: "Quem indicou ganha a comissão do nível dele + esses % sobre o valor da adesão.",
  });
  if (props.useClaude) {
    const parts = Object.entries(props.claudeByTier)
      .filter(([, v]) => Number(v) > 0)
      .map(([slug, v]) => {
        const t = props.tiers.find((x) => x.slug === slug);
        return `${t?.name ?? slug}: -${v}%`;
      });
    if (parts.length > 0) {
      items.push({
        icon: <Sparkles className="h-4 w-4 text-violet-500" />,
        title: `Desconto Claude por nível`,
        desc: parts.join(" · ") + ". Aplicado no custo debitado da carteira do revendedor.",
      });
    }
  }

  const startLabel =
    props.startMode === "now" ? "Inicia: agora ao salvar" :
    props.startsAt ? `Inicia: ${fmtBR(fromLocalInputValue(props.startsAt))}` : "Inicia: defina a data";
  const endLabel =
    props.endMode === "none" ? "Sem data de término" :
    props.endsAt ? `Termina: ${fmtBR(fromLocalInputValue(props.endsAt))}` : "Termina: defina a data";

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold">Resumo da promoção</Label>
      </div>
      {props.name.trim() && (
        <div className="text-sm">
          <span className="text-muted-foreground">Nome: </span>
          <span className="font-medium">{props.name.trim()}</span>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum benefício selecionado ainda. Ative ao menos um desconto ou bônus acima.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">{it.icon}</div>
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">{it.title}</div>
                <div className="text-xs text-muted-foreground leading-snug">{it.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="pt-2 border-t border-border/50 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><CalendarIcon className="h-3 w-3" />{startLabel}</span>
        <span className="inline-flex items-center gap-1"><CalendarIcon className="h-3 w-3" />{endLabel}</span>
      </div>
    </div>
  );
}