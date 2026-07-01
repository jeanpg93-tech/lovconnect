import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Customer = {
  id: string;
  name: string;
  email: string;
  must_change_password: boolean;
  reseller_id: string;
};

export default function ClienteClaudePortal() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
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

        <Card>
          <CardHeader>
            <CardTitle>Suas chaves Claude</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Em breve: listagem de chaves, consumo de tokens e renovação self-service (Fase 2).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}