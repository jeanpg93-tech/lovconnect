import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart3, History as HistoryIcon, Tag, KeyRound, Gift } from "lucide-react";
import GerenteLicencasDashboard from "./GerenteLicencasDashboard";
import GerenteLicencasAcompanhar from "./GerenteLicencasAcompanhar";
import GerenteLicencasValores from "./GerenteLicencasValores";
import GerenteLicencasApis from "./GerenteLicencasApis";
import GerenteChavesTeste from "./GerenteChavesTeste";

const TABS = [
  { value: "dashboard", label: "Dashboard", icon: BarChart3, Comp: GerenteLicencasDashboard },
  { value: "acompanhar", label: "Acompanhar", icon: HistoryIcon, Comp: GerenteLicencasAcompanhar },
  { value: "trials", label: "Chaves Teste", icon: Gift, Comp: GerenteChavesTeste },
  { value: "valores", label: "Valores", icon: Tag, Comp: GerenteLicencasValores },
  { value: "api", label: "API's", icon: KeyRound, Comp: GerenteLicencasApis },
] as const;

export default function GerenteTodasLicencas() {
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
        <h1 className="text-2xl font-bold tracking-tight">Gerenciar Licenças</h1>
        <p className="text-muted-foreground">Tudo sobre licenças em um único lugar: métricas, chaves, preços e API.</p>
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