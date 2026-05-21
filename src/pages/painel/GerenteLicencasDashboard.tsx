import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Zap, Sparkles, Wrench, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Method = "flow" | "lovax";

const METHOD_KEY = "licencas.delivery.method";
const MAINT_KEY = "licencas.delivery.maintenance";

export default function GerenteLicencasDashboard() {
  const [method, setMethod] = useState<Method>("flow");
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    const m = localStorage.getItem(METHOD_KEY) as Method | null;
    if (m === "flow" || m === "lovax") setMethod(m);
    setMaintenance(localStorage.getItem(MAINT_KEY) === "1");
  }, []);

  const switchMethod = (m: Method) => {
    setMethod(m);
    localStorage.setItem(METHOD_KEY, m);
    toast.success(`Método de entrega: ${m === "flow" ? "MétodoFlow" : "MétodoLovax"}`);
  };

  const toggleMaintenance = () => {
    const next = !maintenance;
    setMaintenance(next);
    localStorage.setItem(MAINT_KEY, next ? "1" : "0");
    toast[next ? "warning" : "success"](
      next ? "Entrega em manutenção" : "Entrega reativada"
    );
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold">Entrega de Licenças</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controle do método de entrega e modo manutenção.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "uppercase tracking-wider text-[10px] font-bold",
              maintenance
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
            )}
          >
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            {maintenance ? "Manutenção" : "Operacional"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Método de entrega ativo
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { id: "flow" as Method, label: "MétodoFlow", desc: "Fluxo padrão otimizado", icon: Zap },
                { id: "lovax" as Method, label: "MétodoLovax", desc: "Fluxo alternativo Lovax", icon: Sparkles },
              ]).map((opt) => {
                const active = method === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => switchMethod(opt.id)}
                    className={cn(
                      "group relative flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
                      active
                        ? "border-primary bg-primary/10 shadow-[0_0_24px_-8px_hsl(var(--primary)/0.5)]"
                        : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50"
                    )}
                  >
                    <div className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{opt.label}</span>
                        {active && (
                          <Badge className="h-5 bg-primary text-primary-foreground text-[9px] uppercase tracking-wider">
                            Ativo
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                maintenance ? "bg-amber-500/15 text-amber-500" : "bg-background text-muted-foreground"
              )}>
                {maintenance ? <AlertTriangle className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
              </div>
              <div>
                <div className="font-semibold text-sm">Modo manutenção</div>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, novas entregas de licenças ficam pausadas.
                </p>
              </div>
            </div>
            <Button
              variant={maintenance ? "destructive" : "outline"}
              onClick={toggleMaintenance}
              className="sm:min-w-[180px]"
            >
              <Wrench className="mr-2 h-4 w-4" />
              {maintenance ? "Desativar manutenção" : "Ativar manutenção"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}