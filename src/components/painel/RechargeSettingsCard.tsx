import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings2, Zap, Hand, AlertTriangle, Save, Loader2, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useRechargeSettings,
  type RechargeSettings,
  DEFAULT_RECHARGE_SETTINGS,
} from "@/hooks/useRechargeSettings";

export function RechargeSettingsCard() {
  const { settings, loading, save } = useRechargeSettings();
  const [draft, setDraft] = useState<RechargeSettings>(DEFAULT_RECHARGE_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingMode, setPendingMode] = useState<"automatico" | "manual" | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => { setDraft(settings); }, [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const isAuto = draft.active_mode === "automatico";

  const handleSave = async () => {
    setSaving(true);
    const { error } = await save(draft);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações atualizadas.");
    setOpen(false);
  };

  const requestMode = (mode: "automatico" | "manual") => {
    if (mode === settings.active_mode) return;
    setPendingMode(mode);
  };

  const confirmModeChange = async () => {
    if (!pendingMode) return;
    setSwitching(true);
    const next = { ...settings, active_mode: pendingMode };
    const { error } = await save(next);
    setSwitching(false);
    if (error) toast.error(error.message);
    else toast.success(`Modo ${pendingMode === "automatico" ? "Automático" : "Manual"} ativado.`);
    setPendingMode(null);
  };

  return (
    <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
      {loading ? (
        <div className="flex h-8 w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings2 className="h-4 w-4" />
            </div>
            <div className="text-sm font-medium">Entrega</div>
          </div>

          {/* Mode toggle (segmented) */}
          <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => requestMode("automatico")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                isAuto ? "bg-emerald-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Zap className="h-3.5 w-3.5" /> Automático
            </button>
            <button
              type="button"
              onClick={() => requestMode("manual")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                !isAuto ? "bg-blue-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Hand className="h-3.5 w-3.5" /> Manual
            </button>
          </div>

          {/* Maintenance indicator */}
          {settings.maintenance_enabled && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/10 gap-1">
              <AlertTriangle className="h-3 w-3" /> Em manutenção
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Manutenção
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Label className="text-sm font-semibold">Aviso de manutenção</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Bloqueia novas compras e exibe banner.
                    </p>
                  </div>
                  <Switch
                    checked={draft.maintenance_enabled}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, maintenance_enabled: v }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Mensagem ao revendedor</Label>
                  <Textarea
                    value={draft.maintenance_message}
                    onChange={(e) => setDraft((d) => ({ ...d, maintenance_message: e.target.value }))}
                    rows={3}
                    placeholder="Ex.: Estamos em manutenção, novas recarga em alguns minutos."
                    className="mt-1 resize-none text-sm"
                    disabled={!draft.maintenance_enabled}
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                    Salvar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 bg-emerald-500/5 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Sincronizado
            </Badge>
          </div>
        </>
      )}

      <AlertDialog open={!!pendingMode} onOpenChange={(v) => !v && !switching && setPendingMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {pendingMode === "automatico" ? (
                <><Zap className="h-5 w-5 text-emerald-500" /> Ativar modo Automático?</>
              ) : (
                <><Hand className="h-5 w-5 text-blue-500" /> Ativar modo Manual?</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMode === "automatico"
                ? "Os pedidos serão processados automaticamente pelo bot via fluxo de convite no workspace."
                : "Os pedidos entrarão na fila e precisarão ser entregues manualmente pelo gerente."}
              {" "}A mudança afeta todos os revendedores imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={switching}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmModeChange(); }} disabled={switching}>
              {switching && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
