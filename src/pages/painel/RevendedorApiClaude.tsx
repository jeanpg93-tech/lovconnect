import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, KeyRound, Copy, Check, AlertTriangle, Plus, Trash2,
  BookOpen, Webhook as WebhookIcon, Code2,
} from "lucide-react";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import { toast } from "sonner";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
const FUNCTIONS_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : "";

type ApiKey = {
  id: string;
  key_prefix: string;
  label: string | null;
  webhook_url: string | null;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

function makeRandomKey() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "sk_claude_" + Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function RevendedorApiClaude() {
  const [loading, setLoading] = useState(true);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("resellers").select("id").eq("user_id", u.user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    setResellerId(r.id);
    const { data: k } = await supabase
      .from("reseller_claude_api_keys")
      .select("id, key_prefix, label, webhook_url, webhook_secret, is_active, last_used_at, created_at, revoked_at")
      .eq("reseller_id", r.id)
      .order("created_at", { ascending: false });
    setKeys((k ?? []) as any);
    const first = (k ?? [])[0] as any;
    if (first) {
      setWebhookUrl(first.webhook_url ?? "");
      setWebhookSecret(first.webhook_secret ?? "");
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createKey = async () => {
    if (!resellerId) return;
    setCreating(true);
    try {
      const raw = makeRandomKey();
      const hash = await sha256(raw);
      const prefix = raw.slice(0, 16);
      const { error } = await supabase.from("reseller_claude_api_keys").insert({
        reseller_id: resellerId,
        key_hash: hash,
        key_prefix: prefix,
        label: newLabel || null,
      });
      if (error) throw error;
      setRevealed(raw);
      setNewLabel("");
      setCreateOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar chave");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revogar essa chave? Ela parará de funcionar imediatamente.")) return;
    const { error } = await supabase
      .from("reseller_claude_api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Chave revogada");
    load();
  };

  const saveWebhook = async () => {
    if (!resellerId || keys.length === 0) return toast.error("Crie uma chave primeiro.");
    setSavingWebhook(true);
    const { error } = await supabase
      .from("reseller_claude_api_keys")
      .update({ webhook_url: webhookUrl || null, webhook_secret: webhookSecret || null })
      .eq("reseller_id", resellerId);
    setSavingWebhook(false);
    if (error) return toast.error(error.message);
    toast.success("Webhook salvo");
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="API Claude"
        description="Integre a venda de chaves Claude no seu site, loja ou aplicativo."
        icon={ClaudeIcon}
      />

      <Tabs defaultValue="keys" className="w-full">
        <TabsList>
          <TabsTrigger value="keys" className="gap-2"><KeyRound className="h-4 w-4" /> Chaves</TabsTrigger>
          <TabsTrigger value="webhook" className="gap-2"><WebhookIcon className="h-4 w-4" /> Webhook</TabsTrigger>
          <TabsTrigger value="docs" className="gap-2"><BookOpen className="h-4 w-4" /> Documentação</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="mt-5 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nova chave
            </Button>
          </div>

          {keys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
              Nenhuma chave criada ainda.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card/60 divide-y divide-border">
              {keys.map((k) => (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{k.key_prefix}…</span>
                      {k.is_active ? (
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-500">Ativa</Badge>
                      ) : (
                        <Badge variant="destructive">Revogada</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {k.label ?? "Sem rótulo"} · criada {new Date(k.created_at).toLocaleString("pt-BR")}
                      {k.last_used_at && <> · último uso {new Date(k.last_used_at).toLocaleString("pt-BR")}</>}
                    </div>
                  </div>
                  {k.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => revokeKey(k.id)} className="text-destructive">
                      <Trash2 className="mr-1 h-4 w-4" /> Revogar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="webhook" className="mt-5 space-y-4">
          <div className="rounded-xl border border-border bg-card/60 p-5 space-y-3 max-w-2xl">
            <div className="text-sm text-muted-foreground">
              Receba notificações HTTP quando uma chave for emitida com sucesso ou falhar.
              Enviamos um POST JSON assinado com seu segredo no header <code className="text-xs">X-Signature</code>.
            </div>
            <div className="space-y-1.5">
              <Label>URL do webhook</Label>
              <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://seusite.com/webhooks/claude" />
            </div>
            <div className="space-y-1.5">
              <Label>Segredo (HMAC)</Label>
              <Input value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="qualquer string secreta" />
            </div>
            <div className="pt-2">
              <Button onClick={saveWebhook} disabled={savingWebhook}>
                {savingWebhook && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar webhook
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="docs" className="mt-5 space-y-4">
          <div className="rounded-xl border border-border bg-card/60 p-5 space-y-4 max-w-3xl">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">URL base</div>
              <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 font-mono text-xs break-all">
                <Code2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="flex-1">{FUNCTIONS_BASE}/reseller-claude-api</span>
                <button onClick={() => copyToClipboard(`${FUNCTIONS_BASE}/reseller-claude-api`)} className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Autenticação</div>
              <div className="text-sm">Envie sua chave no header <code className="rounded bg-background/60 px-1 py-0.5 text-xs">X-API-Key: sk_claude_...</code></div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Emitir chave Claude</div>
              <pre className="overflow-auto rounded-lg bg-background/60 p-3 text-xs">
{`curl -X POST ${FUNCTIONS_BASE}/reseller-claude-api/chaves \\
  -H "X-API-Key: $YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "plano": "5x_30d",
    "id_cliente": "cliente@email.com"
  }'`}
              </pre>
              <div className="mt-2 text-xs text-muted-foreground">
                Planos disponíveis: <code>5x_7d</code>, <code>5x_30d</code>, <code>20x_30d</code>.
                O preço é debitado da sua carteira.
              </div>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Consultar saldo</div>
              <pre className="overflow-auto rounded-lg bg-background/60 p-3 text-xs">
{`curl ${FUNCTIONS_BASE}/reseller-claude-api/saldo \\
  -H "X-API-Key: $YOUR_KEY"`}
              </pre>
            </div>

            <div>
              <div className="text-sm font-semibold mb-2">Idempotência</div>
              <div className="text-sm text-muted-foreground">
                Sempre envie um <code>request_id</code> único por venda. Se a requisição for repetida com o mesmo
                <code>request_id</code>, retornamos a mesma chave sem cobrar de novo.
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal criar chave */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Nova chave de API</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Rótulo (opcional)</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="ex: site principal" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createKey} disabled={creating}>
              {creating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal revelar chave */}
      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" /> Sua nova chave
            </DialogTitle>
            <DialogDescription>Copie agora — ela não será exibida novamente.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>Guarde em local seguro. Tratamos essa chave como senha.</span>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3 font-mono text-xs break-all select-all">
            {revealed}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevealed(null)}>Fechar</Button>
            <Button onClick={() => revealed && copyToClipboard(revealed)}>
              {copied ? <><Check className="mr-2 h-4 w-4" /> Copiado</> : <><Copy className="mr-2 h-4 w-4" /> Copiar chave</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}