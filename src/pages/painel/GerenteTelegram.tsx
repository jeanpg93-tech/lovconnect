import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, Copy, Unplug, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const BOT_USERNAME = "LovConnect_bot";

type Settings = {
  chat_id: number | null;
  pairing_code: string | null;
  pairing_expires_at: string | null;
  paired_at: string | null;
  notify_sales: boolean;
  notify_recharges: boolean;
  notify_signups: boolean;
  notify_refunds: boolean;
  notify_reseller_activity: boolean;
};

export default function GerenteTelegram() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("telegram_settings").select("*").eq("id", 1).maybeSingle();
    setSettings(data as any);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("telegram-settings-watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_settings" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const generateCode = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc("telegram_generate_pairing_code");
    setGenerating(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Código gerado: ${data}`);
    load();
  };

  const unpair = async () => {
    if (!confirm("Desconectar o bot? Você não receberá mais notificações até parear de novo.")) return;
    const { error } = await supabase.rpc("telegram_unpair");
    if (error) { toast.error(error.message); return; }
    toast.success("Bot desconectado");
    load();
  };

  const toggle = async (field: keyof Settings, value: boolean) => {
    const { error } = await supabase.from("telegram_settings").update({ [field]: value }).eq("id", 1);
    if (error) toast.error(error.message);
    else load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };

  if (loading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const paired = !!settings?.chat_id;
  const codeValid =
    !!settings?.pairing_code &&
    !!settings?.pairing_expires_at &&
    new Date(settings.pairing_expires_at) > new Date();

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Bot do Telegram</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receba notificações em tempo real e consulte o sistema por comandos.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={
              paired
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                : "border-amber-500/40 bg-amber-500/10 text-amber-500"
            }
          >
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            {paired ? "Pareado" : "Aguardando pareamento"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          {!paired ? (
            <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-5">
              <div>
                <h3 className="font-semibold text-sm mb-2">Como conectar o bot</h3>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Gere um código abaixo (válido por 15 min)</li>
                  <li>
                    Abra o bot:{" "}
                    <a
                      href={`https://t.me/${BOT_USERNAME}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      @{BOT_USERNAME} <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>
                    Envie:{" "}
                    <code className="rounded bg-background px-1.5 py-0.5 text-xs">/start CODIGO</code>
                  </li>
                </ol>
              </div>

              {codeValid ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    Seu código (15 min)
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-3xl font-bold tracking-widest text-primary">
                      {settings!.pairing_code}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copy(`/start ${settings!.pairing_code}`)}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copiar /start
                    </Button>
                  </div>
                </div>
              ) : null}

              <Button onClick={generateCode} disabled={generating}>
                {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {codeValid ? "Gerar novo código" : "Gerar código de pareamento"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Bot conectado</div>
                  <div className="text-xs text-muted-foreground">
                    Chat ID: <code className="font-mono">{settings!.chat_id}</code>
                  </div>
                  {settings!.paired_at && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Pareado em {new Date(settings!.paired_at).toLocaleString("pt-BR")}
                    </div>
                  )}
                </div>
                <Button variant="destructive" size="sm" onClick={unpair}>
                  <Unplug className="mr-2 h-4 w-4" />
                  Desconectar
                </Button>
              </div>
              <a
                href={`https://t.me/${BOT_USERNAME}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Abrir conversa com @{BOT_USERNAME} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              O que receber
            </div>
            {[
              { key: "notify_sales", label: "🛒 Vendas na loja", desc: "Quando um cliente paga um PIX e a venda é confirmada" },
              { key: "notify_recharges", label: "💰 Recargas de saldo", desc: "Quando um revendedor recarrega o saldo" },
              { key: "notify_signups", label: "🆕 Novos cadastros", desc: "Cadastros aguardando aprovação" },
              { key: "notify_refunds", label: "↩️ Reembolsos", desc: "Estornos e reembolsos processados" },
              { key: "notify_reseller_activity", label: "⚙️ Outras movimentações", desc: "Débitos manuais, créditos manuais, ajustes" },
            ].map((opt) => (
              <div key={opt.key} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </div>
                <Switch
                  checked={(settings as any)?.[opt.key] ?? false}
                  onCheckedChange={(v) => toggle(opt.key as keyof Settings, v)}
                />
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Comandos disponíveis no bot
            </div>
            <div className="grid gap-1.5 text-sm font-mono text-muted-foreground sm:grid-cols-2">
              <div><span className="text-primary">/saldo</span> — saldo total dos revendedores</div>
              <div><span className="text-primary">/vendas</span> — vendas pagas hoje</div>
              <div><span className="text-primary">/recargas</span> — recargas hoje</div>
              <div><span className="text-primary">/pendentes</span> — cadastros aguardando</div>
              <div><span className="text-primary">/help</span> — lista de comandos</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}