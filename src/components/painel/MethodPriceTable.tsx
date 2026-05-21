import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Calendar, Infinity as InfinityIcon, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase
        .from("resellers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const [{ data: setting }, { data: tierData }] = await Promise.all([
        supabase.from("app_settings").select("value").eq("key", "licencas.valores").maybeSingle(),
        r ? supabase.rpc("get_reseller_tier", { _reseller_id: r.id }) : Promise.resolve({ data: null }),
      ]);
      const value = (setting?.value ?? { flow: {}, lovax: {} }) as PriceMap;
      setPrices({ flow: value.flow ?? {}, lovax: value.lovax ?? {} });
      const t = Array.isArray(tierData) ? tierData[0] : tierData;
      setTier(t);
      setLoading(false);
    })();
  }, [user]);

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
  const tierMap = (id: PackId) => prices?.[method]?.[id] ?? {};

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
          <div className="col-span-6">Pacote</div>
          <div className="col-span-3">Seu preço base</div>
          <div className="col-span-3">Sugerido +100%</div>
        </div>
        <div className="divide-y divide-border">
          {packages.map((pkg) => {
            const Icon = pkg.icon;
            const base = Number(tierMap(pkg.id)[tier.id] ?? 0);
            const empty = !base;
            return (
              <div
                key={pkg.id}
                className={cn(
                  "grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-card/70 md:grid-cols-12 md:items-center",
                  empty && "opacity-70",
                )}
              >
                <div className="md:col-span-6">
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
                <div className="md:col-span-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">
                    Seu preço base
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
                <div className="md:col-span-3">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">
                    Sugerido
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {base > 0 ? formatBRL(base * 2) : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}