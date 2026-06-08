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
};

type Reseller = {
  id: string;
  display_name: string | null;
  is_active: boolean;
};

type PriceRow = {
  id?: string;
  reseller_id: string;
  plan_id: string;
  cost_cents: number;
  sale_price_cents: number | null;
  is_active: boolean;
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
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceRow>>({}); // by reseller_id
  const [costEdits, setCostEdits] = useState<Record<string, string>>({}); // reseller_id -> input
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCosts, setSavingCosts] = useState(false);

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

      const { data: rRows } = await supabase
        .from("resellers")
        .select("id, display_name, is_active")
        .eq("is_active", true)
        .order("display_name", { ascending: true });
      setResellers((rRows ?? []) as Reseller[]);

      if (p) {
        const { data: priceRows } = await supabase
          .from("reseller_recharge_plan_prices")
          .select("*")
          .eq("plan_id", p.id);
        const map: Record<string, PriceRow> = {};
        (priceRows ?? []).forEach((row: any) => {
          map[row.reseller_id] = row as PriceRow;
        });
        setPrices(map);
      }
      setCostEdits({});
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

  const costsDirty = useMemo(() => Object.keys(costEdits).length > 0, [costEdits]);

  const saveCosts = async () => {
    if (!plan) return;
    setSavingCosts(true);
    try {
      const rows = Object.entries(costEdits).map(([reseller_id, val]) => {
        const existing = prices[reseller_id];
        return {
          reseller_id,
          plan_id: plan.id,
          cost_cents: parseBRL(val),
          // preserve sale_price/is_active if already set
          sale_price_cents: existing?.sale_price_cents ?? null,
          is_active: existing?.is_active ?? true,
        };
      });
      const { error } = await supabase
        .from("reseller_recharge_plan_prices")
        .upsert(rows, { onConflict: "reseller_id,plan_id" });
      if (error) throw error;
      toast.success(`Custo atualizado para ${rows.length} revendedor(es)`);
      await load();
    } catch (e: any) {
      toast.error("Erro ao salvar custos", { description: e.message });
    } finally {
      setSavingCosts(false);
    }
  };

  const filteredResellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resellers;
    return resellers.filter((r) =>
      (r.display_name ?? "").toLowerCase().includes(q),
    );
  }, [search, resellers]);

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
            <Label>Custo padrão (R$)</Label>
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
              Custo sugerido. O custo real cobrado de cada revendedor é
              definido individualmente abaixo.
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

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Custo por revendedor</CardTitle>
              <CardDescription>
                Quanto a plataforma cobra de cada revendedor por uma venda
                deste plano. Eles definem o preço de venda final.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Buscar revendedor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
              />
              <Button
                onClick={saveCosts}
                disabled={!costsDirty || savingCosts}
              >
                {savingCosts ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar custos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 px-2">Revendedor</th>
                  <th className="text-right py-2 px-2 w-44">Custo (R$)</th>
                  <th className="text-right py-2 px-2 w-44">Preço de venda</th>
                  <th className="text-right py-2 px-2 w-32">Margem</th>
                </tr>
              </thead>
              <tbody>
                {filteredResellers.map((r) => {
                  const row = prices[r.id];
                  const curCost = row?.cost_cents ?? 0;
                  const editVal = costEdits[r.id];
                  const effCost =
                    editVal != null ? parseBRL(editVal) : curCost;
                  const sale = row?.sale_price_cents ?? null;
                  const margin =
                    sale != null && sale > 0 ? sale - effCost : null;
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2">
                        {r.display_name ?? "(sem nome)"}
                      </td>
                      <td className="py-2 px-2">
                        <Input
                          inputMode="decimal"
                          value={editVal ?? formatBRL(curCost)}
                          onChange={(e) =>
                            setCostEdits((s) => ({
                              ...s,
                              [r.id]: e.target.value,
                            }))
                          }
                          placeholder="0,00"
                          className="h-9 text-right font-mono"
                        />
                      </td>
                      <td className="py-2 px-2 text-right text-muted-foreground">
                        {sale != null ? fmtBRL(sale) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {margin != null ? (
                          <span
                            className={
                              margin > 0
                                ? "text-emerald-500 font-mono"
                                : margin < 0
                                  ? "text-destructive font-mono"
                                  : "text-muted-foreground font-mono"
                            }
                          >
                            {fmtBRL(margin)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredResellers.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nenhum revendedor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}