import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LovMainLogo } from "@/components/LovMainLogo";
import { resetPasswordSchema } from "@/lib/auth-schemas";
import { toast } from "sonner";
import { Lock, Loader2 } from "lucide-react";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash and emits PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: parsed.data.password });
    setLoading(false);

    if (err) {
      if (err.message.toLowerCase().includes("pwned") || err.message.toLowerCase().includes("compromised")) {
        toast.error("Esta senha apareceu em vazamentos. Escolha outra.");
      } else {
        toast.error(err.message);
      }
      return;
    }
    toast.success("Senha redefinida com sucesso!");
    navigate("/", { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-grid bg-grid-fade" />
      <div className="pointer-events-none fixed left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />

      <header className="relative z-10 border-b border-border/40">
        <div className="container mx-auto flex h-16 items-center"><LovMainLogo /></div>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card/80 p-8 shadow-red-glow-sm backdrop-blur-md">
          <h1 className="font-display text-2xl font-bold tracking-tight">Nova senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready ? "Defina uma nova senha forte para sua conta." : "Validando link de recuperação…"}
          </p>

          {ready && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="new-password" type="password" autoComplete="new-password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 bg-secondary/50 border-border" placeholder="Mín. 8 caracteres" />
                </div>
                {error ? (
                  <p className="text-xs text-destructive">{error}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">8+ caracteres, com maiúscula, minúscula e número.</p>
                )}
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-red-glow-sm">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redefinir senha"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
