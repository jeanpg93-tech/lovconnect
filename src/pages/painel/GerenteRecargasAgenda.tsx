import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2, Plus, Trash2, Zap, Hand, AlertTriangle, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useRechargeSettings } from "@/hooks/useRechargeSettings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type TargetMode = "automatico" | "manual" | "maintenance";

type Entry = {
  id: string;
  scheduled_at: string;
  target_mode: TargetMode;
  maintenance_message: string | null;
  note: string | null;
  executed_at: string | null;
  executed_result: string | null;
  created_at: string;
};

const MODE_LABEL: Record<TargetMode, string> = {
  automatico: "Automático",
  manual: "Manual",
  maintenance: "Manutenção",
};

function ModeBadge({ mode }: { mode: TargetMode }) {
  if (mode === "automatico")
    return <Badge className="bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 gap-1"><Zap className="h-3 w-3" />Automático</Badge>;
  if (mode === "manual")
    return <Badge className="bg-blue-500/15 text-blue-500 border border-blue-500/30 gap-1"><Hand className="h-3 w-3" />Manual</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/30 gap-1"><AlertTriangle className="h-3 w-3" />Manutenção</Badge>;
}

export default function GerenteRecargasAgenda() {
  const { settings, save, reload } = useRechargeSettings();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);

  // form
  const [date, setDate] = useState<Date | undefined>();
  const [time, setTime] = useState<string>("");
  const [mode, setMode] = useState<TargetMode>("automatico");
  const [maintMsg, setMaintMsg] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recharge_schedule")
      .select("*")
      .order("scheduled_at", { ascending: true });
    if (error) toast.error(error.message);
    setEntries((data ?? []) as Entry[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const pending = useMemo(() => entries.filter((e) => !e.executed_at), [entries]);
  const history = useMemo(() => entries.filter((e) => e.executed_at).reverse(), [entries]);

  const nextEntry = pending[0];

  const canSubmit = !!date && /^\d{2}:\d{2}$/.test(time);

  const onSubmit = async () => {
    if (!canSubmit || !date) return;
    const [hh, mm] = time.split(":").map(Number);
    const when = new Date(date);
    when.setHours(hh, mm, 0, 0);
    if (when.getTime() <= Date.now()) {
      toast.error("Escolha uma data/hora futura.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("recharge_schedule").insert({
      scheduled_at: when.toISOString(),
      target_mode: mode,
      maintenance_message: mode === "maintenance" ? (maintMsg || null) : null,
      note: note || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    // Notificação Telegram
    try {
      const whenStr = format(when, "dd/MM/yyyy HH:mm", { locale: ptBR });
      await supabase.from("telegram_outbox").insert({
        text:
          `🗓️ <b>Nova troca agendada</b>\n` +
          `Modo: <b>${MODE_LABEL[mode]}</b>\n` +
          `Quando: <b>${whenStr}</b>` +
          (note ? `\n📝 ${note}` : "") +
          (mode === "maintenance" && maintMsg ? `\n💬 ${maintMsg}` : ""),
      });
    } catch { /* não bloqueia */ }
    toast.success("Entrada agendada.");
    setDate(undefined);
    setTime("");
    setMaintMsg("");
    setNote("");
    setMode("automatico");
    void load();
  };

  const onDelete = async (id: string) => {
    const target = entries.find((x) => x.id === id);
    const { error } = await supabase.from("recharge_schedule").delete().eq("id", id);
    if (error) return toast.error(error.message);
    try {
      if (target) {
        const whenStr = format(new Date(target.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR });
        await supabase.from("telegram_outbox").insert({
          text:
            `❌ <b>Troca agendada removida</b>\n` +
            `Modo: <b>${MODE_LABEL[target.target_mode]}</b>\n` +
            `Era para: <b>${whenStr}</b>`,
        });
      }
    } catch { /* ignore */ }
    toast.success("Entrada removida.");
    void load();
  };

  const togglePause = async () => {
    setTogglingPause(true);
    const next = { ...settings, schedule_paused: !settings.schedule_paused };
    const { error } = await save(next);
    setTogglingPause(false);
    if (error) return toast.error(error.message);
    toast.success(next.schedule_paused ? "Agenda pausada." : "Agenda reativada.");
    void reload();
  };

  return (
    <div className="space-y-6">
      {/* Status da agenda */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center",
            settings.schedule_paused ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
          )}>
            {settings.schedule_paused ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </div>
          <div>
            <div className="text-sm font-semibold">
              Agenda {settings.schedule_paused ? "pausada" : "ativa"}
            </div>
            <div className="text-xs text-muted-foreground">
              {settings.schedule_paused
                ? "Trocas agendadas serão ignoradas até reativar."
                : "Trocas agendadas serão aplicadas no horário definido."}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {nextEntry && !settings.schedule_paused && (
            <Badge variant="outline" className="gap-1">
              Próxima: <ModeBadge mode={nextEntry.target_mode} />
              <span className="ml-1">
                {format(new Date(nextEntry.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            </Badge>
          )}
          <Button
            variant={settings.schedule_paused ? "default" : "outline"}
            size="sm"
            onClick={togglePause}
            disabled={togglingPause}
          >
            {togglingPause && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {settings.schedule_paused ? "Reativar agenda" : "Pausar agenda"}
          </Button>
        </div>
      </Card>

      {/* Form nova entrada */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Nova troca agendada</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {date ? format(date, "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  disabled={(d) => d < new Date(new Date().toDateString())}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hora</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Modo a ativar</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as TargetMode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="automatico">Automático</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="maintenance">Manutenção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observação (opcional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: madrugada" />
          </div>
        </div>
        {mode === "maintenance" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem de manutenção (opcional)</Label>
            <Textarea
              value={maintMsg}
              onChange={(e) => setMaintMsg(e.target.value)}
              rows={2}
              placeholder="Sobrescreve a mensagem atual. Deixe em branco para manter."
            />
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={!canSubmit || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Agendar
          </Button>
        </div>
      </Card>

      {/* Pendentes */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">Pendentes</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>
        ) : pending.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">Nenhuma troca agendada.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Observação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    {format(new Date(e.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell><ModeBadge mode={e.target_mode} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{e.note ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover entrada?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A troca para <strong>{MODE_LABEL[e.target_mode]}</strong> em{" "}
                            {format(new Date(e.scheduled_at), "dd/MM HH:mm", { locale: ptBR })} será cancelada.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(e.id)}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Histórico */}
      {history.length > 0 && (
        <Card className="p-4 space-y-3">
          <h2 className="text-sm font-semibold">Histórico recente</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agendada para</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Executada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.slice(0, 20).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    {format(new Date(e.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell><ModeBadge mode={e.target_mode} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.executed_result ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.executed_at ? format(new Date(e.executed_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}