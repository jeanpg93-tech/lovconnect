import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, History as HistoryIcon, Tag, KeyRound, Undo2, CalendarClock, Package, Sparkles, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import GerenteRecargasDashboard from "./GerenteRecargasDashboard";
import GerenteAcompanharRecargas from "./GerenteAcompanharRecargas";
import GerenteValoresCreditos from "./GerenteValoresCreditos";
import GerenteApiRecargas from "./GerenteApiRecargas";
import GerenteEstornosProvedor from "./GerenteEstornosProvedor";
import GerenteRecargasAgenda from "./GerenteRecargasAgenda";
import GerentePlanoCatalogo from "./GerentePlanoCatalogo";
import GerentePlanosAtivos from "./GerentePlanosAtivos";
import GerentePlanoTutoriais from "./GerentePlanoTutoriais";

const TABS = [
  { value: "dashboard", label: "Dashboard", icon: BarChart3, Comp: GerenteRecargasDashboard },
  { value: "acompanhar", label: "Acompanhar", icon: HistoryIcon, Comp: GerenteAcompanharRecargas },
  { value: "estornos", label: "Estornos", icon: Undo2, Comp: GerenteEstornosProvedor },
  { value: "valores", label: "Valores", icon: Tag, Comp: GerenteValoresCreditos },
  { value: "planos", label: "Planos", icon: Package, Comp: GerentePlanoCatalogo },
  { value: "planos-ativos", label: "Planos Ativos", icon: Sparkles, Comp: GerentePlanosAtivos },
  { value: "tutoriais", label: "Tutoriais", icon: ImageIcon, Comp: GerentePlanoTutoriais },
  { value: "agenda", label: "Agenda", icon: CalendarClock, Comp: GerenteRecargasAgenda },
  { value: "api", label: "API", icon: KeyRound, Comp: GerenteApiRecargas },
] as const;

export default function GerenteRecargas() {
  const [sp, setSp] = useSearchParams();
  const initial = TABS.find((t) => t.value === sp.get("tab"))?.value ?? "dashboard";
  const [tab, setTab] = useState<string>(initial);
  const [pendingToday, setPendingToday] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const today = new Date(Date.now() - 3 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const { count } = await supabase
        .from("recharge_plan_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lte("scheduled_date", today);
      if (!cancelled) setPendingToday(count ?? 0);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const handleChange = (v: string) => {
    setTab(v);
    const next = new URLSearchParams(sp);
    next.set("tab", v);
    setSp(next, { replace: true });
  };

  return (
    <PageContainer className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gerenciar Recargas</h1>
        <p className="text-muted-foreground">Tudo sobre recargas em um único lugar: métricas, pedidos, preços e API.</p>
      </div>

      <Tabs value={tab} onValueChange={handleChange} className="space-y-6">
        <TabsList className="w-full justify-start overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2">
              <t.icon className="h-4 w-4" />
              {t.label}
              {t.value === "planos-ativos" && pendingToday > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px] font-bold">
                  {pendingToday}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0">
            <t.Comp />
          </TabsContent>
        ))}
      </Tabs>
    </PageContainer>
  );
}
