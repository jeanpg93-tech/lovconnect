import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
  Loader2, Save, History, Sparkles, Plus, Calendar, Play, Square, Pencil, Trash2, Zap, Gift, Tag,
} from "lucide-react";

type Promotion = {
  id: string;
  name: string;
  description: string | null;
  extension_discount_pct: number | null;
  credit_discount_pct: number | null;
  recharge_bonus_pct: number | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "scheduled" | "active" | "paused" | "ended";
  activated_at: string | null;
  deactivated_at: string | null;
  created_at: string;
};

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

  const activePromo = promotions.find((p) => p.status === "active") || null;
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
    // Encerra qualquer outra ativa
    if (activePromo && activePromo.id !== p.id) {
      await supabase.from("promotions")
        .update({ status: "ended", deactivated_at: new Date().toISOString() })
        .eq("id", activePromo.id);
    }
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

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ações Especiais</h1>
          <p className="text-muted-foreground">
            Promoções programadas e descontos padrão para todo o sistema.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setCreateOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nova promoção
        </Button>
      </div>

      {/* === PROMOÇÃO ATIVA === */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Promoção ativa agora
        </h2>
        {loadingPromos ? (
          <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>
        ) : activePromo ? (
          <Card className="border-primary/50 bg-primary/5">
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {activePromo.name}
                    <Badge>Ativa</Badge>
                  </CardTitle>
                  {activePromo.description && (
                    <CardDescription className="mt-1">{activePromo.description}</CardDescription>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="gap-1.5">
                      <Square className="h-3.5 w-3.5" /> Desativar agora
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Desativar promoção?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A promoção "{activePromo.name}" será encerrada imediatamente.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deactivateNow(activePromo)}>Desativar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <PromoValues p={activePromo} />
              <div className="text-sm text-muted-foreground grid sm:grid-cols-2 gap-2">
                <div><span className="font-medium text-foreground">Início:</span> {fmtBR(activePromo.starts_at ?? activePromo.activated_at)}</div>
                <div><span className="font-medium text-foreground">Fim:</span> {activePromo.ends_at ? fmtBR(activePromo.ends_at) : "sem data fim"}</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma promoção ativa no momento.
            </CardContent>
          </Card>
        )}
      </section>

      {/* === AGENDADAS === */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Promoções agendadas
        </h2>
        {scheduledPromos.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Nenhuma promoção agendada.</CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {scheduledPromos.map((p) => (
              <Card key={p.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {p.name}
                        <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                      </CardTitle>
                      {p.description && <CardDescription className="mt-1">{p.description}</CardDescription>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <PromoValues p={p} compact />
                  <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1">
                    <div>Início: {fmtBR(p.starts_at)}</div>
                    <div>Fim: {p.ends_at ? fmtBR(p.ends_at) : "sem fim"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => activateNow(p)} className="gap-1.5">
                      <Play className="h-3.5 w-3.5" /> Ativar agora
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setEditing(p); setCreateOpen(true); }} className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" /> Cancelar
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
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Tag className="h-4 w-4" /> Descontos padrão (sempre ativos)
        </h2>
        <p className="text-sm text-muted-foreground -mt-1">
          Valores aplicados continuamente. Promoções programadas têm prioridade enquanto estiverem ativas.
        </p>
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
            title="Desconto em Recargas"
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
            title="Bônus de Recarga"
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
        <Card>
          <CardContent className="pt-6">
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Nenhum evento registrado ainda.
              </p>
            ) : (
              <div className="divide-y">
                {logs.map((l) => {
                  const promo = promotions.find((p) => p.id === l.promotion_id);
                  return (
                    <div key={l.id} className="py-2 text-sm flex items-center justify-between gap-3">
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">{icon}{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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

function PromoValues({ p, compact }: { p: Promotion; compact?: boolean }) {
  const items: { icon: React.ReactNode; label: string; value: string }[] = [];
  if (p.extension_discount_pct != null) items.push({ icon: <Tag className="h-3.5 w-3.5" />, label: "Extensões", value: `-${p.extension_discount_pct}%` });
  if (p.credit_discount_pct != null) items.push({ icon: <Zap className="h-3.5 w-3.5" />, label: "Recargas", value: `-${p.credit_discount_pct}%` });
  if (p.recharge_bonus_pct != null) items.push({ icon: <Gift className="h-3.5 w-3.5" />, label: "Bônus", value: `+${p.recharge_bonus_pct}%` });
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "gap-3"}`}>
      {items.map((it) => (
        <Badge key={it.label} variant="secondary" className="gap-1.5">
          {it.icon}{it.label} <span className="font-bold">{it.value}</span>
        </Badge>
      ))}
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
  const [startMode, setStartMode] = useState<"now" | "schedule">("now");
  const [endMode, setEndMode] = useState<"none" | "schedule">("none");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

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
        setStartMode(editing.starts_at ? "schedule" : "now");
        setEndMode(editing.ends_at ? "schedule" : "none");
        setStartsAt(toLocalInputValue(editing.starts_at));
        setEndsAt(toLocalInputValue(editing.ends_at));
      } else {
        setName(""); setDescription("");
        setUseExt(false); setUseCred(false); setUseBonus(false);
        setExtPct(10); setCredPct(10); setBonusPct(10);
        setStartMode("now"); setEndMode("none");
        setStartsAt(""); setEndsAt("");
      }
    }
  }, [open, editing]);

  async function handleSave(activateNow: boolean) {
    if (!name.trim()) { toast.error("Dê um nome para a promoção"); return; }
    if (!useExt && !useCred && !useBonus) { toast.error("Selecione pelo menos um desconto/bônus"); return; }

    const starts_at = startMode === "schedule" ? fromLocalInputValue(startsAt) : null;
    const ends_at = endMode === "schedule" ? fromLocalInputValue(endsAt) : null;

    if (startMode === "schedule" && !starts_at) { toast.error("Defina a data de início"); return; }
    if (endMode === "schedule" && !ends_at) { toast.error("Defina a data de fim"); return; }
    if (starts_at && ends_at && new Date(ends_at) <= new Date(starts_at)) {
      toast.error("Data de fim deve ser depois do início"); return;
    }

    const willActivate = activateNow || (startMode === "now" && !editing);
    const payload: any = {
      name: name.trim(),
      description: description.trim() || null,
      extension_discount_pct: useExt ? extPct : null,
      credit_discount_pct: useCred ? credPct : null,
      recharge_bonus_pct: useBonus ? bonusPct : null,
      starts_at,
      ends_at,
      status: willActivate ? "active" : "scheduled",
      activated_at: willActivate ? new Date().toISOString() : null,
    };

    setSaving(true);
    try {
      if (willActivate) {
        // Encerra ativa atual (se houver) para respeitar unique partial index
        const { data: cur } = await supabase.from("promotions")
          .select("id").eq("status", "active").maybeSingle();
        if (cur && (!editing || cur.id !== editing.id)) {
          await supabase.from("promotions")
            .update({ status: "ended", deactivated_at: new Date().toISOString() })
            .eq("id", cur.id);
        }
      }

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
            <PctRow enabled={useCred} setEnabled={setUseCred} label="Desconto em recargas" value={credPct} setValue={setCredPct} max={100} suffix="%" />
            <PctRow enabled={useBonus} setEnabled={setUseBonus} label="Bônus de recarga" value={bonusPct} setValue={setBonusPct} max={500} suffix="%" />
          </div>

          <Separator />
          <div className="space-y-3">
            <Label>Quando iniciar?</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={startMode === "now" ? "default" : "outline"} onClick={() => setStartMode("now")}>Agora</Button>
              <Button type="button" size="sm" variant={startMode === "schedule" ? "default" : "outline"} onClick={() => setStartMode("schedule")}>Agendar</Button>
            </div>
            {startMode === "schedule" && (
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            )}
          </div>

          <div className="space-y-3">
            <Label>Quando terminar?</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={endMode === "none" ? "default" : "outline"} onClick={() => setEndMode("none")}>Sem data fim</Button>
              <Button type="button" size="sm" variant={endMode === "schedule" ? "default" : "outline"} onClick={() => setEndMode("schedule")}>Agendar fim</Button>
            </div>
            {endMode === "schedule" && (
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          {!editing && startMode === "schedule" && (
            <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar e ativar agora"}
            </Button>
          )}
          <Button onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (startMode === "now" && !editing ? "Ativar" : "Salvar")}
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
      <Label className="flex-1">{label}</Label>
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