import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, RefreshCcw, CalendarClock } from "lucide-react";
import { toast } from "sonner";

type RechargePlan = {
  id: string;
  name: string;
  description: string | null;
  duration_days: number;
  credits_per_day: number;
  total_credits_cap: number;
  delivery_hour: number;
  base_cost_cents: number;
  is_active: boolean;
  bot_owner_email: string;
};

const fmtBRL = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseBRL = (v: string): number => {
  const clean = v.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(clean);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
};

const formatBRL = (cents: number): string =>
  cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";

export default function GerentePlanoCatalogo() {
  const [plan, setPlan] = useState<RechargePlan | null>(null);
  const [planEdits, setPlanEdits] = useState<Partial<RechargePlan>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: planRows } = await supabase
        .from("recharge_plans")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1);
      const p = (planRows?.[0] ?? null) as RechargePlan | null;
      setPlan(p);
      setPlanEdits({});
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const merged = (): RechargePlan | null => {
    if (!plan) return null;
    return { ...plan, ...planEdits } as RechargePlan;
  };

  const planDirty = useMemo(() => Object.keys(planEdits).length > 0, [planEdits]);

  const savePlan = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const m = merged()!;
      const payload = {
        name: m.name,
        description: m.description,
        duration_days: Number(m.duration_days),
        credits_per_day: Number(m.credits_per_day),
        total_credits_cap: Number(m.total_credits_cap),
        delivery_hour: Number(m.delivery_hour),
        base_cost_cents: Number(m.base_cost_cents),
        is_active: !!m.is_active,
        bot_owner_email: (m.bot_owner_email ?? "").trim(),
      };
      const { error } = await supabase
        .from("recharge_plans")
        .update(payload)
        .eq("id", plan.id);
      if (error) throw error;
      toast.success("Plano atualizado");
      await load();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary opacity-20" />
      </div>
    );
  }

  if (!plan) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhum plano cadastrado. Recarregue a página.
        </CardContent>
      </Card>
    );
  }

  const m = merged()!;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-primary" />
                Catálogo do Plano
              </CardTitle>
              <CardDescription>
                Recarga periódica: cliente recebe X créditos por dia durante N
                dias, com reset diário (não acumula).
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Recarregar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Nome do plano</Label>
              <Input
                value={m.name}
                onChange={(e) =>
                  setPlanEdits((s) => ({ ...s, name: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={m.is_active}
                onCheckedChange={(v) =>
                  setPlanEdits((s) => ({ ...s, is_active: v }))
                }
              />
              <div>
                <p className="text-sm font-medium">
                  {m.is_active ? "Ativo" : "Inativo"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Quando inativo, ninguém pode vender este plano.
                </p>
              </div>
            </div>
          </div>

          <div>
            <Label>Descrição (vista pelos clientes)</Label>
            <Textarea
              rows={3}
              value={m.description ?? ""}
              onChange={(e) =>
                setPlanEdits((s) => ({ ...s, description: e.target.value }))
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>Duração (dias)</Label>
              <Input
                type="number"
                min={1}
                value={m.duration_days}
                onChange={(e) =>
                  setPlanEdits((s) => ({
                    ...s,
                    duration_days: parseInt(e.target.value || "0", 10),
                  }))
                }
              />
            </div>
            <div>
              <Label>Créditos por dia</Label>
              <Input
                type="number"
                min={1}
                value={m.credits_per_day}
                onChange={(e) =>
                  setPlanEdits((s) => ({
                    ...s,
                    credits_per_day: parseInt(e.target.value || "0", 10),
                  }))
                }
              />
            </div>
            <div>
              <Label>Cap total</Label>
              <Input
                type="number"
                min={1}
                value={m.total_credits_cap}
                onChange={(e) =>
                  setPlanEdits((s) => ({
                    ...s,
                    total_credits_cap: parseInt(e.target.value || "0", 10),
                  }))
                }
              />
            </div>
            <div>
              <Label>Horário de entrega (BRT, 0–23)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={m.delivery_hour}
                onChange={(e) =>
                  setPlanEdits((s) => ({
                    ...s,
                    delivery_hour: parseInt(e.target.value || "0", 10),
                  }))
                }
              />
            </div>
          </div>

          <div>
            <Label>Custo do plano (R$) — cobrado de todos os revendedores</Label>
            <Input
              inputMode="decimal"
              value={
                planEdits.base_cost_cents != null
                  ? formatBRL(Number(planEdits.base_cost_cents))
                  : formatBRL(plan.base_cost_cents)
              }
              onChange={(e) =>
                setPlanEdits((s) => ({
                  ...s,
                  base_cost_cents: parseBRL(e.target.value),
                }))
              }
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Este é o valor que será debitado do saldo do revendedor a cada
              venda deste plano. Vale para todos os revendedores.
            </p>
          </div>

          <div>
            <Label>Email do bot (Owner do workspace do cliente)</Label>
            <Input
              type="email"
              value={m.bot_owner_email ?? ""}
              onChange={(e) =>
                setPlanEdits((s) => ({ ...s, bot_owner_email: e.target.value }))
              }
              placeholder="bot@exemplo.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Email que o cliente deverá adicionar como <strong>Owner</strong> no
              workspace do Lovable para receber as recargas. Sem isso, nenhum
              revendedor consegue gerar venda.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={savePlan} disabled={!planDirty || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar plano
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}