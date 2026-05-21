import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, MessageSquare, CheckCircle2, XCircle, RefreshCw, Power, QrCode, User, Save, KeyRound, ShieldCheck } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Status = "disconnected" | "connecting" | "connected";

export default function RevendedorIntegracaoEvolution() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>("disconnected");
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [messagesSent, setMessagesSent] = useState<number>(0);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profilePic, setProfilePic] = useState<string | null>(null);
  const [profileNumber, setProfileNumber] = useState<string | null>(null);
  const [tplLicense, setTplLicense] = useState<string>("");
  const [tplConfirmation, setTplConfirmation] = useState<string>("");
  const [savingTpl, setSavingTpl] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!user) return;
      setLoading(true);
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r) { setLoading(false); return; }
      setResellerId(r.id);
      const { data: row } = await supabase
        .from("reseller_integrations")
        .select("connection_status, last_connected_at, profile_name, profile_picture_url, profile_number, evolution_message_template, evolution_confirmation_template")
        .eq("reseller_id", r.id).maybeSingle();
      if (row) {
        setStatus((row.connection_status as Status) ?? "disconnected");
        setLastConnectedAt(row.last_connected_at ?? null);
        setProfileName(row.profile_name ?? null);
        setProfilePic(row.profile_picture_url ?? null);
        setProfileNumber(row.profile_number ?? null);
        setTplLicense(row.evolution_message_template ?? "");
        setTplConfirmation(row.evolution_confirmation_template ?? "");
      }
      setLoading(false);
      // sincroniza status real ao abrir
      refreshStatus();
    })();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const stopPolling = () => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = window.setInterval(refreshStatus, 3000);
  };

  const refreshStatus = async () => {
    const { data, error } = await supabase.functions.invoke("evolution-instance-status", { body: {} });
    if (error) return;
    const s = ((data as any)?.status as Status) ?? "disconnected";
    const prof = (data as any)?.profile;
    if (prof) {
      setProfileName(prof.profile_name ?? null);
      setProfilePic(prof.profile_picture_url ?? null);
      setProfileNumber(prof.profile_number ?? null);
      if (prof.last_connected_at) setLastConnectedAt(prof.last_connected_at);
    }
    setStatus(s);
    if (s === "connected") {
      setQr(null);
      stopPolling();
      if (status !== "connected") toast.success("WhatsApp conectado!");
    } else if (s === "disconnected") {
      setProfileName(null);
      setProfilePic(null);
      setProfileNumber(null);
      // se acabou de "expirar" o QR, paramos
      if (!qr) stopPolling();
    }
  };

  const connect = async () => {
    setWorking(true);
    setQr(null);
    const { data, error } = await supabase.functions.invoke("evolution-connect-instance", { body: {} });
    setWorking(false);
    if (error) return toast.error(error.message);
    const res = data as any;
    if (res?.error) return toast.error(res.error);
    setStatus("connecting");
    if (res?.qr) {
      const img = res.qr.startsWith("data:") ? res.qr : `data:image/png;base64,${res.qr}`;
      setQr(img);
    }
    startPolling();
  };

  const refreshQr = async () => {
    setWorking(true);
    const { data } = await supabase.functions.invoke("evolution-connect-instance", { body: {} });
    setWorking(false);
    const res = data as any;
    if (res?.qr) {
      const img = res.qr.startsWith("data:") ? res.qr : `data:image/png;base64,${res.qr}`;
      setQr(img);
    }
  };

  const disconnect = async () => {
    if (!confirm("Desconectar o WhatsApp?")) return;
    setWorking(true);
    const { error } = await supabase.functions.invoke("evolution-disconnect-instance", { body: {} });
    setWorking(false);
    if (error) return toast.error(error.message);
    setStatus("disconnected");
    setQr(null);
    stopPolling();
    toast.success("Desconectado");
  };

  const saveTemplates = async () => {
    if (!resellerId) return;
    setSavingTpl(true);
    const { error } = await supabase
      .from("reseller_integrations")
      .update({
        evolution_message_template: tplLicense,
        evolution_confirmation_template: tplConfirmation,
      })
      .eq("reseller_id", resellerId);
    setSavingTpl(false);
    if (error) return toast.error(error.message);
    toast.success("Mensagens salvas");
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="WhatsApp" description="Conecte uma conta de WhatsApp para enviar a chave da licença automaticamente." />

      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <div className="font-medium text-destructive">Zona de risco</div>
          <p className="text-muted-foreground">Quando conectado, toda licença gerada será enviada para o WhatsApp informado no pedido.</p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card/60 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Conexão</h3>
              <p className="text-xs text-muted-foreground">
                {status === "connected" && "Tudo certo — mensagens serão enviadas."}
                {status === "connecting" && "Aguardando você escanear o QR..."}
                {status === "disconnected" && "Nenhum WhatsApp conectado."}
              </p>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mt-6 flex flex-col items-center gap-4">
          {status === "connected" ? (
            <>
              <div className="flex flex-col items-center gap-3">
                {profilePic ? (
                  <img
                    src={profilePic}
                    alt={profileName ?? "Perfil WhatsApp"}
                    className="h-28 w-28 rounded-full border-2 border-emerald-500/40 object-cover shadow-lg"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-500">
                    <User className="h-12 w-12" />
                  </div>
                )}
                <div className="text-center">
                  <div className="font-display text-base font-semibold">
                    {profileName ?? "WhatsApp conectado"}
                  </div>
                  {profileNumber && (
                    <div className="text-xs text-muted-foreground">+{profileNumber}</div>
                  )}
                </div>
              </div>
              {lastConnectedAt && (
                <p className="text-xs text-muted-foreground">
                  Conectado em {new Date(lastConnectedAt).toLocaleString("pt-BR")}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={refreshStatus}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
                </Button>
                <Button variant="destructive" size="sm" onClick={disconnect} disabled={working}>
                  <Power className="mr-1.5 h-3.5 w-3.5" /> Desconectar
                </Button>
              </div>
            </>
          ) : qr ? (
            <>
              <div className="rounded-xl border border-border bg-white p-3">
                <img src={qr} alt="QR Code WhatsApp" className="h-64 w-64" />
              </div>
              <div className="max-w-sm space-y-1 text-center text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Como conectar:</p>
                <ol className="space-y-0.5 text-left list-decimal pl-5">
                  <li>Abra o WhatsApp no celular</li>
                  <li>Toque em <span className="font-medium">Configurações → Aparelhos conectados</span></li>
                  <li>Toque em <span className="font-medium">Conectar um aparelho</span> e escaneie</li>
                </ol>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={refreshQr} disabled={working}>
                  {working ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  Gerar novo QR
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setQr(null); stopPolling(); }}>Cancelar</Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <QrCode className="h-16 w-16" />
              </div>
              <Button onClick={connect} disabled={working} size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
                {working ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <QrCode className="mr-1.5 h-4 w-4" />}
                Conectar WhatsApp
              </Button>
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/60 p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Mensagens enviadas</h3>
              <p className="text-xs text-muted-foreground">
                Personalize o texto enviado em cada situação.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={saveTemplates} disabled={savingTpl}>
            {savingTpl ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
                <KeyRound className="h-3.5 w-3.5" />
              </div>
              <Label htmlFor="tpl-license" className="font-medium">Nova chave</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Variáveis: <code className="rounded bg-muted px-1">{"{nome}"}</code>{" "}
              <code className="rounded bg-muted px-1">{"{chave}"}</code>{" "}
              <code className="rounded bg-muted px-1">{"{tipo}"}</code>
            </p>
            <Textarea
              id="tpl-license"
              value={tplLicense}
              onChange={(e) => setTplLicense(e.target.value)}
              rows={7}
              className="font-mono text-sm"
              placeholder="Olá {nome}! Sua licença {tipo} foi gerada. Chave: {chave}"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
                <ShieldCheck className="h-3.5 w-3.5" />
              </div>
              <Label htmlFor="tpl-confirm" className="font-medium">Código de confirmação</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Variáveis: <code className="rounded bg-muted px-1">{"{codigo}"}</code>{" "}
              <code className="rounded bg-muted px-1">{"{nome}"}</code>
            </p>
            <Textarea
              id="tpl-confirm"
              value={tplConfirmation}
              onChange={(e) => setTplConfirmation(e.target.value)}
              rows={7}
              className="font-mono text-sm"
              placeholder="Seu código de confirmação é: {codigo}"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-500">
        <CheckCircle2 className="h-3 w-3" /> Conectado
      </span>
    );
  }
  if (status === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Aguardando
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <XCircle className="h-3 w-3" /> Desconectado
    </span>
  );
}
