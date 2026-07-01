import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Mail, KeyRound, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ClienteClaudeLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [expiredLink, setExpiredLink] = useState<null | { code: string; description: string }>(null);

  useEffect(() => {
    // Detecta erro do magic link expirado retornado pelo Supabase no fragmento da URL
    // Ex.: #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const err = params.get("error");
    const code = params.get("error_code") ?? "";
    if (!err) return;
    setMode("magic");
    setExpiredLink({
      code,
      description: params.get("error_description")?.replace(/\+/g, " ") ?? "Link inválido ou expirado.",
    });
    // limpa o hash pra não mostrar de novo em refresh
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const sendMagicLink = async () => {
    if (!email) return toast.error("Informe seu e-mail");
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("claude-customer-login-link", {
        body: { email, redirect_to: `${window.location.origin}/cliente-claude` },
      });
      if (error) throw error;
      toast.success("Se o e-mail existir, você receberá um link em instantes.");
      setExpiredLink(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar link");
    } finally {
      setLoading(false);
    }
  };

  const signInWithPassword = async () => {
    if (!email || !password) return toast.error("Preencha e-mail e senha");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate("/cliente-claude");
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
                  Informe seu e-mail abaixo e clique em <b>Reenviar link</b>.
                </p>
              </div>
            </div>
          )}
          <div className="flex gap-2 p-1 bg-muted/40 rounded-md">
            <button
              type="button"
              onClick={() => setMode("magic")}
              className={`flex-1 py-2 rounded text-sm font-medium transition ${mode === "magic" ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              <Mail className="h-4 w-4 inline mr-1" /> Link mágico
            </button>
            <button
              type="button"
              onClick={() => setMode("password")}
              className={`flex-1 py-2 rounded text-sm font-medium transition ${mode === "password" ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              <KeyRound className="h-4 w-4 inline mr-1" /> Senha
            </button>
          </div>

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

          {mode === "password" && (
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
          )}

          <Button
            className="w-full"
            disabled={loading}
            onClick={mode === "magic" ? sendMagicLink : signInWithPassword}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "magic"
              ? expiredLink
                ? "Reenviar link para meu e-mail"
                : "Enviar link para meu e-mail"
              : "Entrar"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Novo por aqui? A conta é criada automaticamente na sua primeira compra.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}