import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Download, Apple, Smartphone, Volume2, Check } from "lucide-react";
import { ensureNotificationPermission, notify } from "@/lib/notify";
import { toast } from "sonner";

export default function Install() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;

  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) {
      toast.info("Use o menu do navegador → 'Instalar app' ou 'Adicionar à tela inicial'.");
      return;
    }
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
  };

  const handleEnableNotif = async () => {
    const p = await ensureNotificationPermission();
    setPermission(p);
    if (p === "granted") {
      notify("🔔 Notificações ativadas!", "Você receberá avisos importantes com som.");
    } else {
      toast.error("Permissão negada. Habilite nas configurações do navegador.");
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="text-center">
          <img src="/icon-192.png" alt="App" className="mx-auto h-20 w-20 rounded-2xl shadow-lg" width={80} height={80} />
          <h1 className="mt-4 font-display text-2xl font-bold">Instalar Revendovable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tenha o app na tela inicial com notificações sonoras em tempo real.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <Download className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <h2 className="font-semibold">1. Instale o app</h2>
                {isStandalone || installed ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-sm text-emerald-500">
                    <Check className="h-4 w-4" /> App instalado
                  </p>
                ) : isIOS ? (
                  <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                    <p className="inline-flex items-center gap-1"><Apple className="h-4 w-4" /> No iPhone/iPad (Safari):</p>
                    <ol className="ml-5 list-decimal space-y-1">
                      <li>Toque no botão <strong>Compartilhar</strong> ⬆️</li>
                      <li>Escolha <strong>"Adicionar à Tela de Início"</strong></li>
                      <li>Toque em <strong>Adicionar</strong></li>
                    </ol>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <Smartphone className="h-4 w-4" /> Android / Chrome / Edge
                    </p>
                    <Button onClick={handleInstall} className="mt-3 w-full">
                      <Download className="mr-2 h-4 w-4" /> Instalar agora
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <h2 className="font-semibold">2. Ative as notificações</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Receba avisos com som assim que algo importante acontecer.
                </p>
                {permission === "granted" ? (
                  <p className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-500">
                    <Check className="h-4 w-4" /> Notificações ativadas
                  </p>
                ) : (
                  <Button onClick={handleEnableNotif} className="mt-3 w-full" variant="secondary">
                    <Volume2 className="mr-2 h-4 w-4" /> Permitir notificações
                  </Button>
                )}
                {isIOS && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No iOS, notificações funcionam apenas após instalar o app na tela inicial (iOS 16.4+).
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
