import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, History } from "lucide-react";

export default function GerenteAcoesEspeciais() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    extension_discount_pct: 0,
    credit_discount_pct: 0,
    recharge_bonus_pct: 0,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("global_settings")
        .select("key, value");

      if (error) throw error;

      const newSettings = { ...settings };
      data?.forEach((item) => {
        if (item.key in newSettings) {
          // @ts-ignore
          newSettings[item.key] = Number(item.value);
        }
      });
      setSettings(newSettings);
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(key: string, value: number) {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("global_settings")
        .upsert({ key, value: value.toString(), updated_at: new Date().toISOString() });

      if (error) throw error;

      // Log action
      await supabase.from("admin_audit_logs").insert({
        action: "update_setting",
        details: { key, value },
      });

      toast.success("Configuração atualizada com sucesso");
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ações Especiais</h1>
        <p className="text-muted-foreground">
          Gerencie promoções, descontos globais e bônus de recarga para todo o sistema.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Desconto em Extensões */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Desconto em Extensões</CardTitle>
            <CardDescription>Porcentagem de desconto aplicada a todas as extensões.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ext_discount">Porcentagem (%)</Label>
              <div className="flex gap-2">
                <Input
                  id="ext_discount"
                  type="number"
                  min="0"
                  max="100"
                  value={settings.extension_discount_pct}
                  onChange={(e) => setSettings({ ...settings, extension_discount_pct: Number(e.target.value) })}
                />
                <Button 
                  disabled={saving} 
                  onClick={() => handleSave("extension_discount_pct", settings.extension_discount_pct)}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Desconto em Créditos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Desconto em Créditos</CardTitle>
            <CardDescription>Porcentagem de desconto aplicada na compra de pacotes de créditos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="credit_discount">Porcentagem (%)</Label>
              <div className="flex gap-2">
                <Input
                  id="credit_discount"
                  type="number"
                  min="0"
                  max="100"
                  value={settings.credit_discount_pct}
                  onChange={(e) => setSettings({ ...settings, credit_discount_pct: Number(e.target.value) })}
                />
                <Button 
                  disabled={saving} 
                  onClick={() => handleSave("credit_discount_pct", settings.credit_discount_pct)}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bônus de Recarga */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bônus de Recarga</CardTitle>
            <CardDescription>Porcentagem extra de bônus ao realizar uma recarga de saldo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recharge_bonus">Porcentagem (%)</Label>
              <div className="flex gap-2">
                <Input
                  id="recharge_bonus"
                  type="number"
                  min="0"
                  max="500"
                  value={settings.recharge_bonus_pct}
                  onChange={(e) => setSettings({ ...settings, recharge_bonus_pct: Number(e.target.value) })}
                />
                <Button 
                  disabled={saving} 
                  onClick={() => handleSave("recharge_bonus_pct", settings.recharge_bonus_pct)}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Histórico de Alterações</h2>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground italic text-center py-4">
              Os registros de auditoria aparecerão aqui após as alterações.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
