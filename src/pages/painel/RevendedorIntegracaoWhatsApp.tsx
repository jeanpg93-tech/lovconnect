import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, MessageSquare, QrCode, CheckCircle2, XCircle, Plug, Send, RotateCcw, Smartphone,
} from "lucide-react";
import { toast } from "sonner";

type Integ = {
  evolution_enabled: boolean;
  evolution_instance: string | null;
  evolution_message_template: string;
  evolution_template_recharge: string | null;
  evolution_template_storefront: string | null;
  connection_status: string;
  last_connected_at: string | null;
  profile_name: string | null;
  profile_number: string | null;
  profile_picture_url: string | null;
  messages_sent_count: number;
};

type Defaults = {
  license: string;
  recharge: string;
  storefront: string;
};

export default function RevendedorIntegracaoWhatsApp() {
  const { user } = useAuth();
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [tplLicense, setTplLicense] = useState("");
  const [tplRecharge, setTplRecharge] = useState("");
  const [tplStorefront, setTplStorefront] = useState("");
  const [integ, setInteg] = useState<Integ | null>(null);
  const [defaults, setDefaults] = useState<Defaults>({ license: "", recharge: "", storefront: "" });

  const [qrOpen, setQrOpen] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const pollRef = useRef<number | null>(null);
  const refreshRef = useRef<number | null>(null);

  const [testNumber, setTestNumber] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase
      .from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);

    const [{ data: row }, { data: appS }] = await Promise.all([
      supabase
        .from("reseller_integrations")
        .select("evolution_enabled, evolution_instance, evolution_message_template, evolution_template_recharge, evolution_template_storefront, connection_status, last_connected_at, profile_name, profile_number, profile_picture_url, messages_sent_count")
        .eq("reseller_id", r.id).maybeSingle(),
      supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["evolution_template_license", "evolution_template_recharge", "evolution_template_storefront"]),
    ]);

    const defs: Defaults = { license: "", recharge: "", storefront: "" };
    (appS ?? []).forEach((s: any) => {
      if (s.key === "evolution_template_license") defs.license = s.value as string;
      if (s.key === "evolution_template_recharge") defs.recharge = s.value as string;
      if (s.key === "evolution_template_storefront") defs.storefront = s.value as string;
    });
    setDefaults(defs);

    if (row) {
      setInteg(row as any);
      setEnabled(!!row.evolution_enabled);
      setTplLicense(row.evolution_message_template ?? defs.license);
      setTplRecharge((row as any).evolution_template_recharge ?? defs.recharge);
      setTplStorefront((row as any).evolution_template_storefront ?? defs.storefront);
    } else {
      setTplLicense(defs.license);
      setTplRecharge(defs.recharge);
      setTplStorefront(defs.storefront);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (refreshRef.current) clearInterval(refreshRef.current);
  }, []);

  const save = async () => {
    if (!resellerId) return;
    setSaving(true);
    const { error } = await supabase.from("reseller_integrations").upsert({
      reseller_id: resellerId,
      evolution_enabled: enabled,
      evolution_message_template: tplLicense,
      evolution_template_recharge: tplRecharge,
      evolution_template_storefront: tplStorefront,
    } as any, { onConflict: "reseller_id" });
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Configurações salvas"); load(); }
  };

  const callApi = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("evolution-api", {
      body: { action, ...extra },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const openConnect = async () => {
    setQrOpen(true);
    setQrLoading(true);
    setQrBase64(null);
    try {
      const d = await callApi("connect");
      setQrBase64(d.qr ?? null);
      // Polling de status a cada 3s
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        try {
          const st = await callApi("status");
          if (st.state === "connected") {
            if (pollRef.current) clearInterval(pollRef.current);
            if (refreshRef.current) clearInterval(refreshRef.current);
            toast.success("WhatsApp conectado!");
            setQrOpen(false);
            load();
          }
        } catch (e) { /* ignore */ }
      }, 3000);
      // Refresh do QR a cada 35s (antes do expire ~40s)
      if (refreshRef.current) clearInterval(refreshRef.current);
      refreshRef.current = window.setInterval(async () => {
        try {
          const d2 = await callApi("connect");
          setQrBase64(d2.qr ?? null);
        } catch (e) { /* ignore */ }
      }, 35000);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao gerar QR");
    } finally {
      setQrLoading(false);
    }
  };

  const closeQr = () => {
    setQrOpen(false);
    if (pollRef.current) clearInterval(pollRef.current);
    if (refreshRef.current) clearInterval(refreshRef.current);
  };

  const disconnect = async () => {
    if (!confirm("Deseja desconectar o WhatsApp?")) return;
    try {
      await callApi("disconnect");
      toast.success("Desconectado");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const sendTest = async () => {
    if (!testNumber || testNumber.replace(/\D/g, "").length < 10) {
      toast.error("Informe um WhatsApp válido (DDD + número)");
      return;
    }
    setSendingTest(true);
    try {
      await callApi("send_test", { number: testNumber });
      toast.success("Mensagem de teste enviada!");
    } catch (e: any) { toast.error(e.message ?? "Falha ao enviar"); }
    finally { setSendingTest(false); }
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const connected = integ?.connection_status === "connected";

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="WhatsApp (Evolution)"
        description="Conecte seu WhatsApp pessoal e envie mensagens automáticas aos compradores em cada venda."
      />

      {/* Status card */}
      <section className="rounded-xl border border-border bg-card/60 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                Status da conexão
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                    <CheckCircle2 className="h-3 w-3" /> Conectado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <XCircle className="h-3 w-3" /> Desconectado
                  </span>
                )}
              </h3>
              {connected && integ?.profile_name ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {integ.profile_name} {integ.profile_number ? `• +${integ.profile_number}` : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">Conecte um WhatsApp para começar a enviar.</p>
              )}
            </div>
          </div>
          {connected ? (
            <Button variant="outline" size="sm" onClick={disconnect}>
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Desconectar
            </Button>
          ) : (
            <Button size="sm" onClick={openConnect}>
              <QrCode className="mr-1.5 h-3.5 w-3.5" /> Conectar WhatsApp
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border bg-background/40 p-3">
            <div className="text-muted-foreground">Mensagens enviadas</div>
            <div className="mt-0.5 text-lg font-semibold">{integ?.messages_sent_count ?? 0}</div>
          </div>
          <div className="rounded-md border bg-background/40 p-3">
            <div className="text-muted-foreground">Última conexão</div>
            <div className="mt-0.5 text-sm font-medium">
              {integ?.last_connected_at ? new Date(integ.last_connected_at).toLocaleString("pt-BR") : "—"}
            </div>
          </div>
        </div>
      </section>

      {/* Envio automático toggle */}
      <section className="rounded-xl border border-border bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">Envio automático</h3>
              <p className="text-xs text-muted-foreground">Envia mensagem ao comprador em cada venda concluída (inclui teste).</p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!connected} />
        </div>
        {!connected && (
          <p className="mt-3 text-[11px] text-amber-500">Conecte o WhatsApp antes de ativar o envio automático.</p>
        )}
      </section>

      {/* Templates */}
      <section className="rounded-xl border border-border bg-card/60 p-5 space-y-5">
        <div>
          <h3 className="font-display text-base font-semibold">Mensagens enviadas ao comprador</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Variáveis disponíveis: <code>{"{nome}"}</code>, <code>{"{chave}"}</code>, <code>{"{tipo}"}</code>, <code>{"{valor}"}</code>, <code>{"{link}"}</code>, <code>{"{loja}"}</code>. Use <code>*texto*</code> para negrito.
          </p>
        </div>

        <TemplateField
          label="Venda de licença (manual ou pela loja)"
          value={tplLicense}
          onChange={setTplLicense}
          defaultValue={defaults.license}
        />
        <TemplateField
          label="Venda da loja pública (geral)"
          value={tplStorefront}
          onChange={setTplStorefront}
          defaultValue={defaults.storefront}
        />
        <TemplateField
          label="Recarga Lovable Credits"
          value={tplRecharge}
          onChange={setTplRecharge}
          defaultValue={defaults.recharge}
        />
      </section>

      {/* Teste */}
      <section className="rounded-xl border border-border bg-card/60 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Enviar mensagem de teste</h3>
            <p className="text-xs text-muted-foreground">Confirme que está tudo certo enviando para o seu próprio número.</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Ex: 5511999999999"
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
            disabled={!connected}
          />
          <Button onClick={sendTest} disabled={sendingTest || !connected}>
            {sendingTest ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            Enviar teste
          </Button>
        </div>
      </section>

      {/* Save bar */}
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-background/80 px-4 py-3 backdrop-blur">
        <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
          Salvar
        </Button>
      </div>

      {/* QR Modal */}
      <Dialog open={qrOpen} onOpenChange={(v) => { if (!v) closeQr(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular, vá em <b>Aparelhos conectados</b> e escaneie o QR abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-2">
            {qrLoading || !qrBase64 ? (
              <div className="flex h-64 w-64 items-center justify-center rounded-md border border-dashed">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <img
                src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
                alt="QR code"
                className="h-64 w-64 rounded-md border bg-white p-2"
              />
            )}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            O QR atualiza automaticamente. Aguardando leitura...
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateField({
  label, value, onChange, defaultValue,
}: { label: string; value: string; onChange: (v: string) => void; defaultValue: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Button
          variant="ghost" size="sm" type="button"
          className="h-7 text-[11px] text-muted-foreground"
          onClick={() => onChange(defaultValue)}
        >
          <RotateCcw className="mr-1 h-3 w-3" /> Restaurar padrão
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="font-mono text-xs"
      />
    </div>
  );
}
