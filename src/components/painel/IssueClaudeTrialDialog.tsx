import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Copy, Check, Info, Sparkles, Mail, User, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { alphaHex, normalizeHexColor, storefrontThemeVars } from "@/lib/storefrontTheme";

type Mode = "manager" | "reseller" | "storefront";

type TrialResult = {
  email?: string;
  api_key?: string | null;
  user_id?: string | null;
  provider_base_url?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: Mode;
  /** required for storefront mode */
  storefrontSlug?: string;
  accentColor?: string;
  onIssued?: (r: TrialResult) => void;
}

export default function IssueClaudeTrialDialog({ open, onOpenChange, mode, storefrontSlug, accentColor, onIssued }: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrialResult | null>(null);
  const [copied, setCopied] = useState<"key" | "user" | null>(null);

  const reset = () => {
    setEmail(""); setName(""); setWhatsapp("");
    setResult(null); setCopied(null);
  };

  const submit = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Informe um e-mail válido");
      return;
    }
    setLoading(true);
    try {
      let data: any = null;
      let error: any = null;
      if (mode === "storefront") {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const resp = await fetch(`https://${projectId}.supabase.co/functions/v1/claude-storefront-issue-trial`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reseller_slug: storefrontSlug,
            email: email.trim(),
            name: name.trim() || undefined,
            whatsapp: whatsapp.trim() || undefined,
          }),
        });
        data = await resp.json().catch(() => ({}));
        if (!resp.ok) error = { message: data?.message || data?.error || `HTTP ${resp.status}` };
      } else {
        const r = await supabase.functions.invoke("claude-issue-trial", {
          body: {
            email: email.trim(),
            customer_name: name.trim() || undefined,
            customer_whatsapp: whatsapp.trim() || undefined,
          },
        });
        data = r.data; error = r.error;
        if (data?.error) error = { message: data.message || data.error };
      }
      if (error) throw error;
      if (!data?.api_key) throw new Error("Provedor não retornou a API key");
      setResult({
        email: data.email ?? email.trim(),
        api_key: data.api_key,
        user_id: data.user_id ?? null,
        provider_base_url: data.provider_base_url ?? "https://claude-ss.ia.br/",
      });
      onIssued?.(data);
      toast.success("Conta de teste criada!");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao emitir teste");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string, which: "key" | "user") => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    toast.success("Copiado!");
    setTimeout(() => setCopied(null), 1500);
  };

  const accent = normalizeHexColor(accentColor);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md" style={storefrontThemeVars(accent)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: accent }} />
            Teste grátis do Claude
          </DialogTitle>
          <DialogDescription>
            Conta de teste válida por <strong>15 minutos</strong> ou <strong>50 mensagens</strong> — o que vier primeiro. Não debita saldo.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <div className="rounded-md border p-2.5 text-[11px] text-muted-foreground flex gap-2" style={{ borderColor: alphaHex(accent, 0.22), background: alphaHex(accent, 0.06) }}>
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: accent }} />
              <span>A conta é criada na hora e a <strong>API key</strong> aparece só uma vez — copie e entregue ao cliente.</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail do cliente <span className="text-rose-500">*</span></Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="cliente@email.com" className="pl-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome (opcional)</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="pl-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">WhatsApp (opcional)</Label>
                <div className="relative">
                  <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Somente números" className="pl-9" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
              Conta criada para <strong>{result.email}</strong>. Copie a API key abaixo — ela não aparece novamente.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">API Key (kp_user_…)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-muted p-2 text-[11px] break-all font-mono">{result.api_key}</code>
                <Button size="sm" variant="outline" onClick={() => copy(result.api_key!, "key")}>
                  {copied === "key" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            {result.user_id && (
              <div className="space-y-1.5">
                <Label className="text-xs">User ID</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted p-2 text-[11px] break-all font-mono">{result.user_id}</code>
                  <Button size="sm" variant="outline" onClick={() => copy(result.user_id!, "user")}>
                    {copied === "user" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}
            {result.provider_base_url && (
              <div className="text-[11px] text-muted-foreground">
                Base URL: <code className="font-mono">{result.provider_base_url}</code>
              </div>
            )}
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              ⏱ Este teste expira em <strong>15 min</strong> ou após <strong>50 mensagens</strong> — o que vier primeiro.
            </p>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
                <Button onClick={submit} disabled={loading} style={{ background: accent, color: "#fff" }}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Emitindo...</> : "Emitir teste grátis"}
              </Button>
            </>
          ) : (
            <Button onClick={() => { onOpenChange(false); reset(); }}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}