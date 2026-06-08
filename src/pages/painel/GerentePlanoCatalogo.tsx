import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, RefreshCcw, CalendarClock, Power, Users } from "lucide-react";
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
  platform_cost_cents: number;
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
  const [baseCostInput, setBaseCostInput] = useState<string | null>(null);
  const [platformCostInput, setPlatformCostInput] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [resellers, setResellers] = useState<
    { id: string; display_name: string; slug: string; recharge_plans_enabled: boolean }[]
  >([]);
  const [resellerSearch, setResellerSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

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
      setBaseCostInput(null);
      setPlatformCostInput(null);

      const { data: gFlag } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "recharge_plans_enabled_globally")
        .maybeSingle();
      setGlobalEnabled((gFlag?.value as any) === true);

      const { data: rs } = await supabase
        .from("resellers")
        .select("id, display_name, slug, recharge_plans_enabled")
        .eq("is_active", true)
        .order("display_name", { ascending: true });
      setResellers((rs ?? []) as any);
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleGlobal = async (next: boolean) => {
    setSavingGlobal(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert(
          { key: "recharge_plans_enabled_globally", value: next as any },
          { onConflict: "key" },
        );
      if (error) throw error;
      setGlobalEnabled(next);
      toast.success(next ? "Liberado para todos" : "Liberação global desativada");
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSavingGlobal(false);
    }
  };

  const toggleReseller = async (id: string, next: boolean) => {
    setTogglingId(id);
    try {
      const { error } = await supabase
        .from("resellers")
        .update({ recharge_plans_enabled: next })
        .eq("id", id);
      if (error) throw error;
      setResellers((s) =>
        s.map((r) => (r.id === id ? { ...r, recharge_plans_enabled: next } : r)),
      );
    } catch (e: any) {
      toast.error("Erro ao atualizar", { description: e.message });
    } finally {
      setTogglingId(null);
    }
  };

  const filteredResellers = useMemo(() => {
    const q = resellerSearch.trim().toLowerCase();
    if (!q) return resellers;
    return resellers.filter(
      (r) =>
        r.display_name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q),
    );
  }, [resellers, resellerSearch]);

  useEffect(() => {
    load();
  }, []);

  const merged = (): RechargePlan | null => {
    if (!plan) return null;
    return { ...plan, ...planEdits } as RechargePlan;
  };

  const planDirty = useMemo(
    () =>
      Object.keys(planEdits).length > 0 ||
      baseCostInput !== null ||
      platformCostInput !== null,
    [planEdits, baseCostInput, platformCostInput],
  );

  const savePlan = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const m = merged()!;
      const baseCostCents =
        baseCostInput !== null ? parseBRL(baseCostInput) : m.base_cost_cents;
      const platformCostCents =
        platformCostInput !== null
          ? parseBRL(platformCostInput)
          : (m.platform_cost_cents ?? 0);
      const payload = {
        name: m.name,
        description: m.description,
        duration_days: Number(m.duration_days),
        credits_per_day: Number(m.credits_per_day),
        total_credits_cap: Number(m.total_credits_cap),
        delivery_hour: Number(m.delivery_hour),
        base_cost_cents: baseCostCents,
        platform_cost_cents: platformCostCents,
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
              value={baseCostInput ?? formatBRL(plan.base_cost_cents)}
              onChange={(e) => setBaseCostInput(e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Este é o valor que será debitado do saldo do revendedor a cada
              venda deste plano. Vale para todos os revendedores.
            </p>
          </div>

          <div>
            <Label>Meu custo do plano (R$) — pago ao fornecedor</Label>
            <Input
              inputMode="decimal"
              value={platformCostInput ?? formatBRL(plan.platform_cost_cents ?? 0)}
              onChange={(e) => setPlatformCostInput(e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Quanto você gasta com o fornecedor para entregar cada venda deste
              plano. Usado no /painel/gerente/financeiro para calcular seu lucro
              real (lucro = custo do revendedor − meu custo).
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