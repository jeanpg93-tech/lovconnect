import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Sparkles, Save, Calendar, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Method = "flow" | "lovax";
type PackId = "1d" | "7d" | "30d" | "lifetime";

const PACKAGES: { id: PackId; label: string; desc: string; icon: typeof Calendar }[] = [
  { id: "1d", label: "1 dia", desc: "Acesso por 24 horas", icon: Calendar },
  { id: "7d", label: "7 dias", desc: "Acesso semanal", icon: Calendar },
  { id: "30d", label: "30 dias", desc: "Acesso mensal", icon: Calendar },
  { id: "lifetime", label: "Vitalício", desc: "Acesso permanente", icon: InfinityIcon },
];

const METHODS: { id: Method; label: string; desc: string; icon: typeof Zap; accent: string }[] = [
  { id: "flow", label: "MétodoFlow", desc: "Tabela de preços do fluxo padrão", icon: Zap, accent: "text-primary" },
  { id: "lovax", label: "MétodoLovax", desc: "Tabela de preços do fluxo Lovax", icon: Sparkles, accent: "text-fuchsia-500" },
];

const STORAGE_KEY = "licencas.valores";
const DEFAULTS: Record<Method, Record<PackId, number>> = {
  flow: { "1d": 5, "7d": 25, "30d": 80, lifetime: 250 },
  lovax: { "1d": 6, "7d": 30, "30d": 95, lifetime: 290 },
};

function loadPrices(): Record<Method, Record<PackId, number>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      flow: { ...DEFAULTS.flow, ...(parsed.flow ?? {}) },
      lovax: { ...DEFAULTS.lovax, ...(parsed.lovax ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export default function GerenteLicencasValores() {
  const [prices, setPrices] = useState<Record<Method, Record<PackId, number>>>(DEFAULTS);

  useEffect(() => {
    setPrices(loadPrices());
  }, []);

  const update = (m: Method, p: PackId, value: string) => {
    const num = Number(value);
    setPrices((prev) => ({
      ...prev,
      [m]: { ...prev[m], [p]: Number.isFinite(num) ? num : 0 },
    }));
  };

  const save = (m: Method) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prices));
    toast.success(`Preços do ${m === "flow" ? "MétodoFlow" : "MétodoLovax"} salvos`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {METHODS.map((meta) => {
        const Icon = meta.icon;
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
              {PACKAGES.map((pkg) => {
                const PIcon = pkg.icon;
                return (
                  <div
                    key={pkg.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
                      <PIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{pkg.label}</div>
                      <p className="text-xs text-muted-foreground">{pkg.desc}</p>
                    </div>
                    <div className="w-32 shrink-0">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Preço (R$)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={prices[meta.id][pkg.id]}
                        onChange={(e) => update(meta.id, pkg.id, e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                );
              })}
              <Button onClick={() => save(meta.id)} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                Salvar preços do {meta.label}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}