import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Sparkles, Save, Calendar, Infinity as InfinityIcon, Loader2, ChevronDown, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Tier = { id: string; slug: string; name: string; color: string; sort_order: number; is_hidden: boolean };

type Method = "flow" | "lovax";
type PackId = "1d" | "7d" | "30d" | "90d" | "365d" | "lifetime";

type Pack = { id: PackId; label: string; desc: string; icon: typeof Calendar };

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

const METHODS: { id: Method; label: string; desc: string; icon: typeof Zap; accent: string }[] = [
  { id: "flow", label: "MétodoFlow", desc: "Tabela de preços do fluxo padrão", icon: Zap, accent: "text-primary" },
  { id: "lovax", label: "MétodoLovax", desc: "Tabela de preços do fluxo Lovax", icon: Sparkles, accent: "text-fuchsia-500" },
];

const STORAGE_KEY = "licencas.valores";
// prices[method][packId][tierId] = price in BRL
type PriceMap = Record<Method, Partial<Record<PackId, Record<string, number>>>>;
const EMPTY: PriceMap = { flow: {}, lovax: {} };

function loadLocalPrices(): PriceMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      flow: parsed.flow ?? {},
      lovax: parsed.lovax ?? {},
    };
  } catch {
    return EMPTY;
  }
}

export default function GerenteLicencasValores() {
  const [prices, setPrices] = useState<PriceMap>(EMPTY);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [openPacks, setOpenPacks] = useState<Record<string, boolean>>({});

  const togglePack = (m: Method, p: PackId) => {
    const k = `${m}:${p}`;
    setOpenPacks((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  useEffect(() => {
    (async () => {
      const [{ data: settingRow }, { data: tierData }] = await Promise.all([
        supabase.from("app_settings").select("value").eq("key", STORAGE_KEY).maybeSingle(),
        supabase
          .from("reseller_tiers")
          .select("id,slug,name,color,sort_order,is_hidden")
          .eq("is_active", true)
          .order("sort_order"),
      ]);

      const dbValue = (settingRow?.value ?? null) as PriceMap | null;
      if (dbValue && (dbValue.flow || dbValue.lovax)) {
        setPrices({ flow: dbValue.flow ?? {}, lovax: dbValue.lovax ?? {} });
      } else {
        // Migra automaticamente o que estiver no localStorage (legado)
        const local = loadLocalPrices();
        setPrices(local);
        const hasAny =
          Object.keys(local.flow ?? {}).length > 0 ||
          Object.keys(local.lovax ?? {}).length > 0;
        if (hasAny) {
          // Persiste imediatamente no banco para que os revendedores vejam
          const { error: upErr } = await supabase
            .from("app_settings")
            .upsert({ key: STORAGE_KEY, value: local as any }, { onConflict: "key" });
          if (!upErr) {
            toast.success("Preços locais migrados para o banco");
          }
        }
      }

      setTiers(
        ((tierData ?? []) as Tier[]).filter(
          (t) =>
            !t.is_hidden &&
            t.slug?.toLowerCase() !== "partner" &&
            !/partner/i.test(t.name)
        )
      );
      setLoadingTiers(false);
    })();
  }, []);

  const update = (m: Method, p: PackId, tierId: string, value: string) => {
    const num = Number(value);
    setPrices((prev) => {
      const pkg = { ...(prev[m]?.[p] ?? {}), [tierId]: Number.isFinite(num) ? num : 0 };
      return { ...prev, [m]: { ...prev[m], [p]: pkg } };
    });
  };

  const save = async (m: Method) => {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: STORAGE_KEY, value: prices as any }, { onConflict: "key" });
    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prices));
    toast.success(`Preços do ${m === "flow" ? "MétodoFlow" : "MétodoLovax"} salvos`);
  };

  // Interpola 90d e 365d entre 30d e vitalício por nível.
  const autoFillIntermediate = (m: Method) => {
    setPrices((prev) => {
      const methodPrices = { ...(prev[m] ?? {}) };
      const base30 = methodPrices["30d"] ?? {};
      const baseLife = methodPrices["lifetime"] ?? {};
      const next90: Record<string, number> = { ...(methodPrices["90d"] ?? {}) };
      const next365: Record<string, number> = { ...(methodPrices["365d"] ?? {}) };
      let updated = 0;
      tiers.forEach((t) => {
        const p30 = Number(base30[t.id] ?? 0);
        const pLife = Number(baseLife[t.id] ?? 0);
        if (p30 > 0 && pLife > p30) {
          next90[t.id] = Math.round((p30 + (pLife - p30) * 0.33) * 100) / 100;
          next365[t.id] = Math.round((p30 + (pLife - p30) * 0.75) * 100) / 100;
          updated++;
        }
      });
      if (updated === 0) {
        toast.error("Defina 30 dias e Vitalício antes (Vitalício > 30d).");
        return prev;
      }
      methodPrices["90d"] = next90;
      methodPrices["365d"] = next365;
      toast.success(`Preços de 90d e 365d calculados para ${updated} nível(is).`);
      return { ...prev, [m]: methodPrices };
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Defina o preço de cada pacote por nível de revendedor. Esses valores são exibidos
        para os revendedores conforme o nível em que estão.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
      {METHODS.map((meta) => {
        const Icon = meta.icon;
        const packages = PACKAGES_BY_METHOD[meta.id];
        return (
          <Card key={meta.id} className="overflow-hidden border-border/60">
            <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl border bg-muted/40",
                  meta.accent
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">{meta.label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold">
                Pacotes
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingTiers && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {!loadingTiers && tiers.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Nenhum nível ativo. Crie níveis em Gerenciar Níveis para definir preços.
                </div>
              )}
              {!loadingTiers && tiers.length > 0 && packages.map((pkg) => {
                const PIcon = pkg.icon;
                const key = `${meta.id}:${pkg.id}`;
                const open = !!openPacks[key];
                return (
                  <div
                    key={pkg.id}
                    className="rounded-xl border border-border bg-muted/30"
                  >
                    <button
                      type="button"
                      onClick={() => togglePack(meta.id, pkg.id)}
                      className="flex w-full items-center gap-3 p-3 text-left"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
                        <PIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{pkg.label}</div>
                        <p className="text-xs text-muted-foreground">{pkg.desc}</p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180"
                        )}
                      />
                    </button>
                    {open && (
                    <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
                      {tiers.map((tier) => (
                        <div key={tier.id} className="rounded-lg border border-border/60 bg-background/60 p-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: tier.color }}
                            />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                              {tier.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">R$</span>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={prices[meta.id]?.[pkg.id]?.[tier.id] ?? 0}
                              onChange={(e) => update(meta.id, pkg.id, tier.id, e.target.value)}
                              className="h-8"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                );
              })}
              <Button onClick={() => save(meta.id)} className="w-full" disabled={loadingTiers || tiers.length === 0}>
                <Save className="mr-2 h-4 w-4" />
                Salvar preços do {meta.label}
              </Button>
            </CardContent>
          </Card>
        );
      })}
      </div>
    </div>
  );
}