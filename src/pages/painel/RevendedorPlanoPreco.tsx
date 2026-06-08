import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, CalendarClock, Info } from "lucide-react";
import { toast } from "sonner";

type RechargePlan = {
  id: string;
  name: string;
  description: string | null;
  duration_days: number;
  credits_per_day: number;
  total_credits_cap: number;
  delivery_hour: number;
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

export default function RevendedorPlanoPreco() {
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [plan, setPlan] = useState<RechargePlan | null>(null);
  const [price, setPrice] = useState<PriceRow | null>(null);
  const [saleInput, setSaleInput] = useState<string>("");
  const [active, setActive] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: ures } = await supabase.auth.getUser();
      const uid = ures.user?.id;
      if (!uid) throw new Error("not_authenticated");

      const { data: r } = await supabase
        .from("resellers")
        .select("id")
        .eq("user_id", uid)
        .maybeSingle();
      if (!r?.id) throw new Error("Revendedor não encontrado");
      setResellerId(r.id);

      const { data: planRows } = await supabase
        .from("recharge_plans")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1);
      const p = (planRows?.[0] ?? null) as RechargePlan | null;
      setPlan(p);

      if (p) {
        const { data: priceRows } = await supabase
          .from("reseller_recharge_plan_prices")
          .select("*")
          .eq("reseller_id", r.id)
          .eq("plan_id", p.id)
          .maybeSingle();
        const row = (priceRows ?? null) as PriceRow | null;
        setPrice(row);
        setSaleInput(
          row?.sale_price_cents != null ? formatBRL(row.sale_price_cents) : "",
        );
        setActive(row?.is_active ?? true);
      } else {
        setPrice(null);
        setSaleInput("");
      }
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cost = price?.cost_cents ?? null;
  const saleCents = parseBRL(saleInput);
  const margin = useMemo(() => {
    if (cost == null || !saleCents) return null;
    return saleCents - cost;
  }, [cost, saleCents]);

  const canSave = !!(price && (saleInput || active !== price.is_active));

  const save = async () => {
    if (!price) return;
    setSaving(true);
    try {
      const newSale = saleInput ? parseBRL(saleInput) : null;
      const { error } = await supabase
        .from("reseller_recharge_plan_prices")
        .update({
          sale_price_cents: newSale,
          is_active: active,
        })
        .eq("id", price.id!);
      if (error) throw error;
      toast.success("Preço salvo");
      await load();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-30" />
      </div>
    );
  }

  if (!plan) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum plano disponível no momento.
        </CardContent>
      </Card>
    );
  }

  if (!price) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            {plan.name}
          </CardTitle>
          <CardDescription>{plan.description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-amber-700 dark:text-amber-400 flex gap-3">
            <Info className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                Plano ainda não liberado para você.
              </p>
              <p className="text-xs mt-1">
                O gerente precisa definir seu custo deste plano. Aguarde ou
                entre em contato.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          {plan.name}
        </CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Duração
            </p>
            <p className="text-lg font-semibold">{plan.duration_days} dias</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Créditos/dia
            </p>
            <p className="text-lg font-semibold">{plan.credits_per_day}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Cap total
            </p>
            <p className="text-lg font-semibold">{plan.total_credits_cap}</p>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Seu custo (cobrado pela plataforma)
          </p>
          <p className="text-2xl font-bold font-mono">
            {cost != null ? fmtBRL(cost) : "—"}
          </p>
        </div>

        <div>
          <Label>Seu preço de venda (R$)</Label>
          <Input
            inputMode="decimal"
            value={saleInput}
            onChange={(e) => setSaleInput(e.target.value)}
            placeholder="0,00"
            className="font-mono"
          />
          {margin != null && (
            <p
              className={
                margin > 0
                  ? "text-xs mt-1 text-emerald-500"
                  : margin < 0
                    ? "text-xs mt-1 text-destructive"
                    : "text-xs mt-1 text-muted-foreground"
              }
            >
              Margem por venda: {fmtBRL(margin)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
          <Switch checked={active} onCheckedChange={setActive} />
          <div>
            <p className="text-sm font-medium">
              {active ? "Plano ativo na sua loja" : "Plano desativado"}
            </p>
            <p className="text-xs text-muted-foreground">
              Quando ativo, o plano aparece como opção em vendas manuais, na
              sua loja pública e na API.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={!canSave || saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}