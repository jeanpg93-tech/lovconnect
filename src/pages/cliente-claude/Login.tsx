import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

export default function ClienteClaudeLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storeSlug = searchParams.get("loja")?.trim() ?? "";
  const emailFromUrl = searchParams.get("email")?.trim() ?? "";
  const portalPath = `/cliente-claude${storeSlug ? `?loja=${encodeURIComponent(storeSlug)}` : ""}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [expiredLink, setExpiredLink] = useState<null | { code: string; description: string }>(null);
  const [sendingRecovery, setSendingRecovery] = useState(false);

  useEffect(() => {
    if (emailFromUrl) setEmail(emailFromUrl);
  }, [emailFromUrl]);

  useEffect(() => {
    // Detecta erro do magic link expirado retornado pelo Supabase no fragmento da URL
    // Ex.: #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const err = params.get("error");
    const code = params.get("error_code") ?? "";
    if (!err) return;
    setExpiredLink({
      code,
      description: params.get("error_description")?.replace(/\+/g, " ") ?? "Link inválido ou expirado.",
    });
    // limpa o hash pra não mostrar de novo em refresh
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const sendRecovery = async () => {
    if (!email) return toast.error("Informe seu e-mail para receber o link de redefinição");
    setSendingRecovery(true);
    try {
      const { error } = await supabase.functions.invoke("claude-customer-login-link", {
        body: { email, reseller_slug: storeSlug || null, redirect_to: `${window.location.origin}${portalPath}` },
      });
      if (error) throw error;
      toast.success("Se o e-mail existir, você receberá um link para definir uma nova senha.");
      setExpiredLink(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar link");
    } finally {
      setSendingRecovery(false);
    }
  };

  const signInWithPassword = async () => {
    if (!email || !password) return toast.error("Preencha e-mail e senha");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate(portalPath);
    } catch (e: any) {
      toast.error(e?.message ?? "Credenciais inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md border-primary/20">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Portal do Cliente Claude</CardTitle>
          <p className="text-sm text-muted-foreground">Acompanhe suas chaves, consumo e renove.</p>
          {storeSlug && (
            <Button asChild variant="ghost" size="sm" className="mt-2">
              <Link to={`/loja/${storeSlug}`}>Voltar para a loja</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {expiredLink && (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  {expiredLink.code === "otp_expired"
                    ? "Seu link mágico expirou."
                    : "Não foi possível validar o link."}
                </p>
                <p className="text-xs opacity-90">
                  Informe seu e-mail abaixo e clique em <b>Esqueci minha senha</b> para receber um novo link.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <Button className="w-full" disabled={loading} onClick={signInWithPassword}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Entrar
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            disabled={sendingRecovery}
            onClick={sendRecovery}
          >
            {sendingRecovery && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Esqueci minha senha / primeiro acesso
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Novo por aqui? A conta é criada automaticamente na sua primeira compra — use "Esqueci minha senha" para definir a sua.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}