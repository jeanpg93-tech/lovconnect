import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, CalendarClock, Sparkles, Store } from "lucide-react";
import { toast } from "sonner";
import GerarVendaPlanoDialog from "@/components/painel/planos/GerarVendaPlanoDialog";

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

type PriceRow = {
  id?: string;
  reseller_id: string;
  plan_id: string;
  sale_price_cents: number | null;
  is_active: boolean;
  show_on_storefront: boolean;
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
  const [showStore, setShowStore] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendaOpen, setVendaOpen] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState<boolean>(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data: ures } = await supabase.auth.getUser();
      const uid = ures.user?.id;
      if (!uid) throw new Error("not_authenticated");

      const { data: r } = await supabase
        .from("resellers")
        .select("id, recharge_plans_enabled")
        .eq("user_id", uid)
        .maybeSingle();
      if (!r?.id) throw new Error("Revendedor não encontrado");
      setResellerId(r.id);

      const { data: gFlag } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "recharge_plans_enabled_globally")
        .maybeSingle();
      const enabled =
        (gFlag?.value as any) === true || !!(r as any).recharge_plans_enabled;
      setFeatureEnabled(enabled);
      if (!enabled) {
        setPlan(null);
        setLoading(false);
        return;
      }

      const { data: planRows } = await supabase
        .from("recharge_plans")
        .select("id,name,description,duration_days,credits_per_day,total_credits_cap,delivery_hour,base_cost_cents,is_active,bot_owner_email")
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
        setShowStore(row?.show_on_storefront ?? false);
      } else {
        setPrice(null);
        setSaleInput("");
        setShowStore(false);
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

  const cost = plan?.base_cost_cents ?? null;
  const saleCents = parseBRL(saleInput);
  const margin = useMemo(() => {
    if (cost == null || !saleCents) return null;
    return saleCents - cost;
  }, [cost, saleCents]);

  const canSave = !!plan;
  const canSell =
    !!price && !!price.sale_price_cents && !!plan?.bot_owner_email;

  const save = async () => {
    if (!plan || !resellerId) return;
    setSaving(true);
    try {
      const newSale = saleInput ? parseBRL(saleInput) : null;
      const payload = {
        reseller_id: resellerId,
        plan_id: plan.id,
        cost_cents: plan.base_cost_cents,
        sale_price_cents: newSale,
        is_active: !!newSale,
        show_on_storefront: showStore && !!newSale,
      };
      const { error } = await supabase
        .from("reseller_recharge_plan_prices")
        .upsert([payload], { onConflict: "reseller_id,plan_id" });
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
          {featureEnabled
            ? "Nenhum plano disponível no momento."
            : "Os planos de recarga ainda não foram liberados para a sua loja. Fale com o suporte para participar do teste."}
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
          <Switch
            checked={showStore}
            onCheckedChange={setShowStore}
            disabled={!saleCents}
          />
          <div className="flex-1">
            <p className="text-sm font-medium flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              {showStore && saleCents ? "Visível na loja pública" : "Não aparece na loja pública"}
            </p>
            <p className="text-xs text-muted-foreground">
              Quando ativado, o plano aparece como opção de compra na sua loja
              pública (PIX). Mesmo sem exibir aqui, você pode vender manualmente
              ou via API — basta ter o preço definido acima.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="outline"
            className="mr-2"
            onClick={() => setVendaOpen(true)}
            disabled={!canSell}
            title={!canSell ? "Defina e ative o preço de venda primeiro" : ""}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Gerar venda
          </Button>
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
      {plan && resellerId && price && price.sale_price_cents && (
        <GerarVendaPlanoDialog
          open={vendaOpen}
          onOpenChange={setVendaOpen}
          resellerId={resellerId}
          plan={{
            id: plan.id,
            name: plan.name,
            duration_days: plan.duration_days,
            credits_per_day: plan.credits_per_day,
            total_credits_cap: plan.total_credits_cap,
            bot_owner_email: plan.bot_owner_email,
          }}
          cost_cents={plan.base_cost_cents}
          sale_price_cents={price.sale_price_cents}
        />
      )}
    </Card>
  );
}