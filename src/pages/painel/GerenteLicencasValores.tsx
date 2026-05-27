import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCcw, Crown, Save, Calendar, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tier = {
  id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_active: boolean;
};

type Pack = { id: string; label: string; desc: string };

const PACKS: Pack[] = [
  { id: "1d", label: "1 dia", desc: "24 horas de acesso" },
  { id: "7d", label: "7 dias", desc: "Acesso semanal" },
  { id: "30d", label: "30 dias", desc: "Acesso mensal" },
  { id: "90d", label: "90 dias", desc: "Acesso trimestral" },
  { id: "365d", label: "365 dias", desc: "Acesso anual" },
  { id: "lifetime", label: "Vitalício", desc: "Acesso permanente" },
];

const fmt = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseInput = (v: string): number => {
  const clean = v.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(clean);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
};

const formatInput = (cents: number): string =>
  cents > 0 ? (cents / 100).toFixed(2).replace(".", ",") : "";

export default function GerenteLicencasValores() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({}); // tierId:packId -> cents
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [baseCosts, setBaseCosts] = useState<Record<string, number>>({}); // packId -> cents
  const [baseEdits, setBaseEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [{ data: tData }, { data: pData }, { data: bData }] = await Promise.all([
        supabase
          .from("reseller_tiers")
          .select("id,name,slug,color,sort_order,is_active")
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("tier_license_prices").select("tier_id,duration_code,price_cents"),
        supabase.from("license_base_costs").select("duration_code,cost_cents"),
      ]);
      setTiers((tData ?? []) as Tier[]);
      const map: Record<string, number> = {};
      (pData ?? []).forEach((r: any) => {
        map[`${r.tier_id}:${r.duration_code}`] = Number(r.price_cents) || 0;
      });
      setPrices(map);
      const bmap: Record<string, number> = {};
      (bData ?? []).forEach((r: any) => {
        bmap[r.duration_code] = Number(r.cost_cents) || 0;
      });
      setBaseCosts(bmap);
      setEdits({});
      setBaseEdits({});
    } catch (e: any) {
      toast.error("Erro ao carregar preços", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const getValue = (tier: Tier, pack: Pack) => {
    const k = `${tier.id}:${pack.id}`;
    return edits[k] ?? formatInput(prices[k] ?? 0);
  };

  const hasChanges = useMemo(
    () => Object.keys(edits).length > 0 || Object.keys(baseEdits).length > 0,
    [edits, baseEdits],
  );

  const saveAll = async () => {
    setSaving(true);
    try {
      const upserts: any[] = [];
      for (const [key, val] of Object.entries(edits)) {
        const [tier_id, duration_code] = key.split(":");
        upserts.push({
          tier_id,
          duration_code,
          price_cents: parseInput(val),
          is_active: true,
        });
      }
      if (upserts.length > 0) {
        const { error } = await supabase
          .from("tier_license_prices")
          .upsert(upserts, { onConflict: "tier_id,duration_code" });
        if (error) throw error;
      }
      const baseUpserts = Object.entries(baseEdits).map(([duration_code, val]) => ({
        duration_code,
        cost_cents: parseInput(val),
        updated_at: new Date().toISOString(),
      }));
      if (baseUpserts.length > 0) {
        const { error } = await supabase
          .from("license_base_costs")
          .upsert(baseUpserts, { onConflict: "duration_code" });
        if (error) throw error;
      }
      toast.success("Preços de licença salvos");
      await loadAll();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Custos de licença por nível. <strong>Vale para Flow e Lovax</strong> (custo igual nos dois métodos).
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Esses valores são debitados do saldo do revendedor a cada venda. O preço de venda continua sendo definido por ele.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading || saving}>
            <RefreshCcw className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")} />
            Recarregar
          </Button>
          <Button size="sm" onClick={saveAll} disabled={!hasChanges || saving || loading}>
            {saving ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary opacity-30" />
        </div>
      ) : (
        <div className="relative rounded-2xl border border-border/60 bg-card/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-muted/30 border-b border-border/60 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/70">
                  <th className="px-6 py-4 font-bold">Pacote</th>
                  {tiers.map((t) => (
                    <th
                      key={t.id}
                      className="px-4 py-4 text-center font-bold min-w-[150px] border-l border-border/60"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Crown className="h-3.5 w-3.5" style={{ color: t.color }} />
                        <span className="text-foreground tracking-tighter">{t.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {PACKS.map((p) => {
                  const Icon = p.id === "lifetime" ? InfinityIcon : Calendar;
                  return (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-base text-foreground/90">{p.label}</span>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                              {p.desc}
                            </span>
                          </div>
                        </div>
                      </td>
                      {tiers.map((t) => {
                        const k = `${t.id}:${p.id}`;
                        return (
                          <td key={t.id} className="px-3 py-4 border-l border-border/60">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50">
                                R$
                              </span>
                              <Input
                                inputMode="decimal"
                                value={getValue(t, p)}
                                onChange={(e) =>
                                  setEdits((s) => ({ ...s, [k]: e.target.value }))
                                }
                                placeholder="0,00"
                                className="pl-9 h-10 text-right font-mono text-sm bg-background/40 border-border/60"
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}