import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Calendar, Infinity as InfinityIcon, Crown, Save, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Method = "flow" | "lovax";
type PackId = "1d" | "7d" | "30d" | "90d" | "365d" | "lifetime";

type Pack = { id: PackId; label: string; desc: string; icon: any };

const BASE_PACKAGES: Pack[] = [
  { id: "1d", label: "1 dia", desc: "Acesso por 24 horas", icon: Calendar },
  { id: "7d", label: "7 dias", desc: "Acesso semanal", icon: Calendar },
  { id: "30d", label: "30 dias", desc: "Acesso mensal", icon: Calendar },
  { id: "lifetime", label: "Vitalício", desc: "Acesso permanente", icon: InfinityIcon },
];

const PACKAGES_BY_METHOD: Record<Method, Pack[]> = {
  flow: BASE_PACKAGES,
  lovax: [
    { id: "1d", label: "1 dia", desc: "Acesso por 24 horas", icon: Calendar },
    { id: "7d", label: "7 dias", desc: "Acesso semanal", icon: Calendar },
    { id: "30d", label: "30 dias", desc: "Acesso mensal", icon: Calendar },
    { id: "90d", label: "90 dias", desc: "Acesso trimestral", icon: Calendar },
    { id: "365d", label: "365 dias", desc: "Acesso anual", icon: Calendar },
    { id: "lifetime", label: "Vitalício", desc: "Acesso permanente", icon: InfinityIcon },
  ],
};

type PriceMap = Record<Method, Partial<Record<PackId, Record<string, number>>>>;

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function MethodPriceTable({ method }: { method: Method }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<PriceMap | null>(null);
  const [tier, setTier] = useState<any>(null);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<PackId, number>>>({});
  const [costOverrides, setCostOverrides] = useState<Partial<Record<PackId, number>>>({});
  const [allTiers, setAllTiers] = useState<Array<{ id: string; name: string; slug: string; is_hidden: boolean; min_spent_cents: number }>>([]);
  const [editing, setEditing] = useState<PackId | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase
        .from("resellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setResellerId(r?.id ?? null);
      const [{ data: setting }, { data: tierData }, ovRes, ovCostRes, tiersAllRes] = await Promise.all([
        supabase.from("app_settings").select("value").eq("key", "licencas.valores").maybeSingle(),
        r ? supabase.rpc("get_reseller_tier", { _reseller_id: r.id }) : Promise.resolve({ data: null }),
        r
          ? supabase
              .from("reseller_license_prices")
              .select("pack_id, price_cents")
              .eq("reseller_id", r.id)
              .eq("method", method)
          : Promise.resolve({ data: [] } as any),
        r
          ? supabase
              .from("reseller_license_cost_overrides")
              .select("pack_id, price_cents, is_active")
              .eq("reseller_id", r.id)
              .eq("is_active", true)
          : Promise.resolve({ data: [] } as any),
        supabase
          .from("reseller_tiers")
          .select("id,name,slug,is_hidden,min_spent_cents,sort_order")
          .eq("is_active", true)
          .order("sort_order"),
      ]);
      const value = (setting?.value ?? { flow: {}, lovax: {} }) as PriceMap;
      setPrices({ flow: value.flow ?? {}, lovax: value.lovax ?? {} });
      const t = Array.isArray(tierData) ? tierData[0] : tierData;
      setTier(t);
      const rows = ((ovRes as any)?.data ?? []) as { pack_id: string; price_cents: number }[];
      const ovMap: Partial<Record<PackId, number>> = {};
      rows.forEach((row) => {
        ovMap[row.pack_id as PackId] = row.price_cents / 100;
      });
      setOverrides(ovMap);
      const costRows = ((ovCostRes as any)?.data ?? []) as { pack_id: string; price_cents: number }[];
      const costMap: Partial<Record<PackId, number>> = {};
      costRows.forEach((row) => {
        costMap[row.pack_id as PackId] = row.price_cents / 100;
      });
      setCostOverrides(costMap);
      setAllTiers((tiersAllRes.data ?? []) as any[]);
      setLoading(false);
    })();
  }, [user, method]);

  const saveOverride = async (pkgId: PackId, newValue: number | null) => {
    if (!resellerId) return;
    setSaving(true);
    const next = { ...overrides };
    let error: any = null;
    if (newValue === null || !Number.isFinite(newValue) || newValue <= 0) {
      delete next[pkgId];
      ({ error } = await supabase
        .from("reseller_license_prices")
        .delete()
        .eq("reseller_id", resellerId)
        .eq("method", method)
        .eq("pack_id", pkgId));
    } else {
      next[pkgId] = newValue;
      ({ error } = await supabase
        .from("reseller_license_prices")
        .upsert(
          {
            reseller_id: resellerId,
            method,
            pack_id: pkgId,
            price_cents: Math.round(newValue * 100),
          },
          { onConflict: "reseller_id,method,pack_id" },
        ));
    }
    setSaving(false);
    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }
    setOverrides(next);
    setEditing(null);
    toast.success("Preço atualizado");
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!tier) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
        Nenhum nível encontrado para sua conta.
      </div>
    );
  }

  const packages = PACKAGES_BY_METHOD[method];
  // Cascata para "Preço base" (custo do revendedor):
  // 1) override individual em reseller_license_cost_overrides (definido pelo gerente)
  // 2) licencas.valores[method][pack][tier.id]
  // 3) se tier é Partner/oculto e nada acima: licencas.valores[method][pack][ouro.id]
  // 4) tenta o mesmo no método irmão (flow<->lovax) — custos são iguais
  const ouroTier =
    allTiers.find((t) => (t.slug || "").toLowerCase() === "ouro") ??
    allTiers.find((t) => (t.name || "").toLowerCase().includes("ouro"));
  const computeBase = (id: PackId): number => {
    const ov = costOverrides[id];
    if (ov && ov > 0) return ov;
    const mine = Number(prices?.[method]?.[id]?.[tier?.id] ?? 0);
    if (mine > 0) return mine;
    const otherMethod: Method = method === "flow" ? "lovax" : "flow";
    const mineOther = Number(prices?.[otherMethod]?.[id]?.[tier?.id] ?? 0);
    if (mineOther > 0) return mineOther;
    const isPartnerLike =
      tier?.is_hidden ||
      (tier?.slug || "").toLowerCase() === "partner" ||
      (tier?.name || "").toLowerCase().includes("partner");
    if (isPartnerLike && ouroTier?.id) {
      const ouro = Number(prices?.[method]?.[id]?.[ouroTier.id] ?? 0);
      if (ouro > 0) return ouro;
      const ouroOther = Number(prices?.[otherMethod]?.[id]?.[ouroTier.id] ?? 0);
      if (ouroOther > 0) return ouroOther;
    }
    return 0;
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3">
        <Crown className="h-4 w-4 text-primary" />
        <div className="text-sm">
          Você está no nível{" "}
          <span className="font-display font-semibold" style={{ color: tier.color }}>
            {tier.name}
          </span>
          . Os preços abaixo são os definidos pelo gerente para o seu nível.
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card/40 backdrop-blur-sm">
        <div className="hidden grid-cols-12 gap-3 border-b border-border bg-card/60 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-4">Pacote</div>
          <div className="col-span-2">Preço base</div>
          <div className="col-span-2">Sugerido</div>
          <div className="col-span-4">Meu preço</div>
        </div>
        <div className="divide-y divide-border">
          {packages.map((pkg) => {
            const Icon = pkg.icon;
            const base = computeBase(pkg.id);
            const empty = !base;
            const myPrice = overrides[pkg.id];
            const isEditing = editing === pkg.id;
            return (
              <div
                key={pkg.id}
                className={cn(
                  "grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-card/70 md:grid-cols-12 md:items-center",
                  empty && "opacity-70",
                )}
              >
                <div className="md:col-span-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-display font-semibold">{pkg.label}</div>
                      <div className="text-[11px] text-muted-foreground">{pkg.desc}</div>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">
                    Preço base
                  </div>
                  {base > 0 ? (
                    <div className="font-display text-base font-bold tabular-nums">
                      {formatBRL(base)}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      Não definido
                    </span>
                  )}
                </div>
                <div className="md:col-span-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">
                    Sugerido
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {base > 0 ? formatBRL(base * 2) : "—"}
                  </div>
                </div>
                <div className="md:col-span-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">
                    Meu preço
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <Input
                        autoFocus
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="h-8 w-28"
                        placeholder={base > 0 ? String(base * 2) : "0,00"}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={saving}
                        onClick={() => saveOverride(pkg.id, draft === "" ? null : Number(draft))}
                      >
                        <Check className="h-4 w-4 text-primary" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditing(null)}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : myPrice && myPrice > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-bold tabular-nums text-primary">
                        {formatBRL(myPrice)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => {
                          setDraft(String(myPrice));
                          setEditing(pkg.id);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      disabled={empty}
                      onClick={() => {
                        setDraft(base > 0 ? String(base * 2) : "");
                        setEditing(pkg.id);
                      }}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Cadastrar preço
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}