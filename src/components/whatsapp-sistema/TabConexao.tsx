import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Power, QrCode, Send } from "lucide-react";
import { toast } from "sonner";

type Settings = {
  status: string;
  connected_number: string | null;
  footer_text: string;
  webhook_secret: string;
};

export default function TabConexao() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [testNumber, setTestNumber] = useState("");
  const [testText, setTestText] = useState("✅ Teste do WhatsApp do sistema");
  const [footerDraft, setFooterDraft] = useState("");

  const load = async () => {
    const { data } = await supabase
      .from("system_whatsapp_settings")
      .select("status, connected_number, footer_text, webhook_secret")
      .eq("singleton", true).maybeSingle();
    if (data) {
      setSettings(data as any);
      setFooterDraft((data as any).footer_text ?? "");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("sys-wa-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_whatsapp_settings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const callApi = async (action: string, extra: Record<string, any> = {}) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke("system-whatsapp-api", {
        body: { action, ...extra },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    setQr(null); setPairingCode(null);
    const r = await callApi("connect");
    if (r) {
      if ((r as any).qr) setQr((r as any).qr);
      if ((r as any).pairingCode) setPairingCode((r as any).pairingCode);
      if (!(r as any).qr && !(r as any).pairingCode) toast.info("Aguardando QR...");
    }
  };
  const refreshStatus = async () => { await callApi("status"); };
  const disconnect = async () => {
    if (!confirm("Desconectar o WhatsApp do sistema?")) return;
    await callApi("disconnect");
    setQr(null); setPairingCode(null);
  };
  const sendTest = async () => {
    if (!testNumber.trim()) { toast.error("Informe o número"); return; }
    const r = await callApi("send_test", { number: testNumber, text: testText });
    if (r) toast.success("Teste enviado!");
  };
  const saveFooter = async () => {
    setBusy("footer");
    const { error } = await supabase.from("system_whatsapp_settings").update({ footer_text: footerDraft }).eq("singleton", true);
    setBusy(null);
    if (error) toast.error(error.message); else toast.success("Rodapé salvo");
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const status = settings?.status ?? "disconnected";
  const isConnected = status === "connected";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>Status da conexão</span>
            <Badge variant={isConnected ? "default" : status === "connecting" ? "secondary" : "outline"}>
              {isConnected ? "Conectado" : status === "connecting" ? "Conectando..." : "Desconectado"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected && settings?.connected_number && (
            <p className="text-sm text-muted-foreground">Número: <strong>{settings.connected_number}</strong></p>
          )}

          <div className="flex flex-wrap gap-2">
            {!isConnected && (
              <Button onClick={connect} disabled={busy === "connect"}>
                {busy === "connect" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
                Conectar
              </Button>
            )}
            <Button variant="outline" onClick={refreshStatus} disabled={busy === "status"}>
              {busy === "status" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Atualizar status
            </Button>
            {isConnected && (
              <Button variant="destructive" onClick={disconnect} disabled={busy === "disconnect"}>
                <Power className="h-4 w-4 mr-2" /> Desconectar
              </Button>
            )}
          </div>

          {qr && (
            <div className="flex flex-col items-center gap-2 p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">Escaneie no WhatsApp:</p>
              <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR" className="w-56 h-56" />
            </div>
          )}
          {pairingCode && (
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Código de pareamento</p>
              <p className="text-2xl font-mono tracking-widest">{pairingCode}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rodapé automático</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Texto adicionado ao final de toda mensagem enviada.</p>
          <Textarea rows={2} value={footerDraft} onChange={(e) => setFooterDraft(e.target.value)} />
          <Button onClick={saveFooter} disabled={busy === "footer"} size="sm">
            {busy === "footer" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar rodapé
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Enviar teste</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Número (com DDD)</Label>
              <Input placeholder="11999998888" value={testNumber} onChange={(e) => setTestNumber(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Mensagem</Label>
            <Textarea rows={3} value={testText} onChange={(e) => setTestText(e.target.value)} />
          </div>
          <Button onClick={sendTest} disabled={!isConnected || busy === "send_test"}>
            {busy === "send_test" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar teste
          </Button>
          {!isConnected && <p className="text-xs text-muted-foreground">Conecte o WhatsApp primeiro.</p>}
        </CardContent>
      </Card>
    </div>
  );
}