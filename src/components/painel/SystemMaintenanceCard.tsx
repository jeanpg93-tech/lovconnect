import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertOctagon, ShieldOff, Loader2, Save, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import {
  useSystemMaintenance,
  DEFAULT_SYSTEM_MAINTENANCE_MESSAGE,
} from "@/hooks/useSystemMaintenance";
import { useAuth } from "@/hooks/useAuth";

/**
 * Card do gerente para ligar/desligar o modo manutenção GLOBAL do sistema.
 * Bloqueia toda emissão de vendas/licenças/recargas dos revendedores,
 * mas mantém consultas (saldo, licenças, clientes) liberadas.
 */
export function SystemMaintenanceCard() {
  const { user } = useAuth();
  const { enabled, message, started_at, loading, save } = useSystemMaintenance();
  const [draft, setDraft] = useState(message);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { setDraft(message); }, [message]);

  const dirty = draft !== message;

  const doToggle = async () => {
    setSaving(true);
    const next = {
      enabled: !enabled,
      message: draft?.trim() || DEFAULT_SYSTEM_MAINTENANCE_MESSAGE,
      started_at: !enabled ? new Date().toISOString() : null,
      started_by: !enabled ? user?.id ?? null : null,
    };
    const { error } = await save(next);
    setSaving(false);
    setConfirmOpen(false);
    if (error) return toast.error(`Falha ao salvar: ${error.message}`);
    toast[!enabled ? "warning" : "success"](
      !enabled
        ? "Modo manutenção ATIVADO — revendedores notificados"
        : "Modo manutenção DESATIVADO — emissões liberadas",
    );
  };

  const saveMessageOnly = async () => {
    setSaving(true);
    const { error } = await save({
      enabled,
      message: draft?.trim() || DEFAULT_SYSTEM_MAINTENANCE_MESSAGE,
      started_at,
    });
    setSaving(false);
    if (error) return toast.error(`Falha ao salvar: ${error.message}`);
    toast.success("Mensagem atualizada");
  };

  return (
    <>
      <Card
        className={
          enabled
            ? "border-red-500/50 bg-gradient-to-br from-red-500/10 via-red-500/5 to-transparent shadow-[0_0_24px_-8px_hsl(0_84%_60%/0.4)]"
            : "border-primary/20"
        }
      >
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border " +
                  (enabled
                    ? "border-red-500/40 bg-red-500/15 text-red-500"
                    : "border-primary/30 bg-primary/10 text-primary")
                }
              >
                {enabled ? <AlertOctagon className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Modo Manutenção Global
                  {enabled ? (
                    <Badge className="bg-red-500 text-white uppercase tracking-wider text-[10px]">
                      Ativo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 uppercase tracking-wider text-[10px]">
                      Operacional
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  Pausa toda emissão de vendas, licenças, chaves e recargas dos
                  revendedores. Consultas ao painel (saldo, licenças, clientes,
                  histórico) continuam liberadas.
                </CardDescription>
              </div>
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={loading || saving}
              variant={enabled ? "outline" : "destructive"}
              className={enabled ? "border-red-500/40 text-red-500 hover:bg-red-500/10 sm:min-w-[200px]" : "sm:min-w-[200px]"}
            >
              {enabled ? (
                <><PowerOff className="mr-2 h-4 w-4" /> Desativar manutenção</>
              ) : (
                <><Power className="mr-2 h-4 w-4" /> Ativar manutenção</>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mensagem exibida aos revendedores
            </label>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              className="mt-1.5 resize-none text-sm"
              placeholder={DEFAULT_SYSTEM_MAINTENANCE_MESSAGE}
              disabled={loading}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {enabled && started_at
                  ? `Ativo desde ${new Date(started_at).toLocaleString("pt-BR")}`
                  : "A mensagem aparece no banner do painel de todo revendedor."}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={saveMessageOnly}
                disabled={!dirty || saving || loading}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Salvar mensagem
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !saving && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {enabled ? (
                <><PowerOff className="h-5 w-5 text-emerald-500" /> Desativar modo manutenção?</>
              ) : (
                <><AlertOctagon className="h-5 w-5 text-red-500" /> Ativar modo manutenção global?</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {enabled
                ? "Os revendedores voltarão a poder emitir vendas, licenças e recargas imediatamente."
                : "Todos os revendedores serão bloqueados de emitir vendas, licenças, chaves e recargas — inclusive via loja pública e API. Consultas ao painel continuarão liberadas. Um banner será mostrado a eles em tempo real."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); doToggle(); }}
              disabled={saving}
              className={!enabled ? "bg-red-500 hover:bg-red-500/90 text-white" : undefined}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default SystemMaintenanceCard;