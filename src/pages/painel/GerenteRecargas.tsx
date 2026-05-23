import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, History as HistoryIcon, Tag, KeyRound, Undo2 } from "lucide-react";
import GerenteRecargasDashboard from "./GerenteRecargasDashboard";
import GerenteAcompanharRecargas from "./GerenteAcompanharRecargas";
import GerenteValoresCreditos from "./GerenteValoresCreditos";
import GerenteApiRecargas from "./GerenteApiRecargas";
import GerenteEstornosProvedor from "./GerenteEstornosProvedor";

const TABS = [
  { value: "dashboard", label: "Dashboard", icon: BarChart3, Comp: GerenteRecargasDashboard },
  { value: "acompanhar", label: "Acompanhar", icon: HistoryIcon, Comp: GerenteAcompanharRecargas },
  { value: "estornos", label: "Estornos", icon: Undo2, Comp: GerenteEstornosProvedor },
  { value: "valores", label: "Valores", icon: Tag, Comp: GerenteValoresCreditos },
  { value: "api", label: "API", icon: KeyRound, Comp: GerenteApiRecargas },
] as const;

export default function GerenteRecargas() {
  const [sp, setSp] = useSearchParams();
  const initial = TABS.find((t) => t.value === sp.get("tab"))?.value ?? "dashboard";
  const [tab, setTab] = useState<string>(initial);

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
