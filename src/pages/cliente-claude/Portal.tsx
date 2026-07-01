import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldAlert, KeyRound, Clock, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Customer = {
  id: string;
  name: string;
  email: string;
  must_change_password: boolean;
  reseller_id: string;
};

type Order = {
  id: string;
  plan_code: string;
  status: string;
  provider_key_id: string | null;
  created_at: string;
  sale_price_cents: number;
};

type Usage = {
  kind?: string;
  status?: string;
  accountExpiresAt?: string;
  tokensInWindow?: number | null;
  tokenLimit?: number | null;
  tokenWindowHours?: number | null;
  percentRemaining?: number | null;
  weeklyTokensInWindow?: number | null;
  weeklyTokenLimit?: number | null;
} | null;

const PLAN_LABELS: Record<string, string> = {
  "5x_7d": "Plano 5x — 7 dias",
  "5x_30d": "Plano 5x — 30 dias",
  "20x_30d": "Plano 20x — 30 dias",
  api_5x_7d: "API 5x — 7 dias",
  api_5x_30d: "API 5x — 30 dias",
  api_20x_30d: "API 20x — 30 dias",
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function daysUntil(d?: string | null) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.max(0, Math.round(ms / 86400000));
}
function fmtTokens(n?: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function ClienteClaudePortal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [usage, setUsage] = useState<Usage>(null);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        navigate("/cliente-claude/login", { replace: true });
        return;
      }
      const { data, error } = await supabase
        .from("claude_customers")
        .select("id, name, email, must_change_password, reseller_id")
        .eq("auth_user_id", session.session.user.id)
        .maybeSingle();
      if (error || !data) {
        toast.error("Cliente não encontrado. Contate seu revendedor.");
        await supabase.auth.signOut();
        navigate("/cliente-claude/login", { replace: true });
        return;
      }
      setCustomer(data as Customer);
      // Carrega chaves + consumo
      const { data: usageResp } = await supabase.functions.invoke("claude-my-usage");
      if (usageResp?.ok) {
        setOrders(usageResp.orders ?? []);
        setUsage(usageResp.usage ?? null);
      }
      setLoading(false);
    })();
  }, [navigate]);

  const changePassword = async () => {
    if (newPassword.length < 8) return toast.error("Senha precisa de ao menos 8 caracteres");
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await supabase.from("claude_customers").update({ must_change_password: false }).eq("id", customer!.id);
      setCustomer({ ...(customer as Customer), must_change_password: false });
      setNewPassword("");
      toast.success("Senha atualizada!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar senha");
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/cliente-claude/login", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeKeys = orders.filter((o) => o.status === "issued");
  const expiresIn = daysUntil(usage?.accountExpiresAt);
  const dailyUsed = usage?.tokenLimit && usage?.tokensInWindow != null
    ? Math.min(100, (usage.tokensInWindow / usage.tokenLimit) * 100)
    : null;
  const weeklyUsed = usage?.weeklyTokenLimit && usage?.weeklyTokensInWindow != null
    ? Math.min(100, (usage.weeklyTokensInWindow / usage.weeklyTokenLimit) * 100)
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Olá, {customer?.name}</h1>
            <p className="text-sm text-muted-foreground">{customer?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sair
          </Button>
        </div>

        {customer?.must_change_password && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" /> Defina uma nova senha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Por segurança, troque a senha inicial gerada automaticamente.
              </p>
              <div className="space-y-2">
                <Label htmlFor="new-pass">Nova senha</Label>
                <Input
                  id="new-pass"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <Button onClick={changePassword} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar nova senha
              </Button>
            </CardContent>
          </Card>
        )}

        {usage && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" /> Consumo de tokens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {expiresIn != null && (
                <div className={`flex items-center gap-2 text-sm ${expiresIn <= 3 ? "text-destructive" : "text-muted-foreground"}`}>
                  <Clock className="h-4 w-4" />
                  Sua chave expira em <b>{expiresIn} dia{expiresIn === 1 ? "" : "s"}</b> ({fmtDate(usage.accountExpiresAt)})
                </div>
              )}
              {dailyUsed != null && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Janela de {usage.tokenWindowHours ?? 5}h</span>
                    <span>{fmtTokens(usage.tokensInWindow)} / {fmtTokens(usage.tokenLimit)}</span>
                  </div>
                  <Progress value={dailyUsed} />
                </div>
              )}
              {weeklyUsed != null && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span>Janela semanal</span>
                    <span>{fmtTokens(usage.weeklyTokensInWindow)} / {fmtTokens(usage.weeklyTokenLimit)}</span>
                  </div>
                  <Progress value={weeklyUsed} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Suas chaves Claude
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Você ainda não tem chaves ativas.</p>
            ) : (
              <div className="space-y-3">
                {orders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{PLAN_LABELS[o.plan_code] ?? o.plan_code}</div>
                      <div className="text-xs text-muted-foreground">Emitida em {fmtDate(o.created_at)}</div>
                    </div>
                    <Badge variant={o.status === "issued" ? "default" : o.status === "failed" ? "destructive" : "secondary"}>
                      {o.status === "issued" ? "Ativa" : o.status === "failed" ? "Falhou" : o.status}
                    </Badge>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-2">
                  {activeKeys.length} chave{activeKeys.length === 1 ? "" : "s"} ativa{activeKeys.length === 1 ? "" : "s"}.
                  Renovação self-service disponível em breve (Fase 3).
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}