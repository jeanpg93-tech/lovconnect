import { useMemo, useState } from "react";
import { PageHeader } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Zap, Beaker, CalendarClock } from "lucide-react";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import MethodPriceTable from "@/components/painel/MethodPriceTable";
import ClaudePriceTable from "@/components/painel/ClaudePriceTable";
import RevendedorCreditos from "./RevendedorCreditos";
import RevendedorPlanoPreco from "./RevendedorPlanoPreco";
import PricingIssuesBanner from "@/components/painel/PricingIssuesBanner";
import { usePricingIssues } from "@/hooks/usePricingIssues";
import { useResellerEnabledMethods } from "@/hooks/useResellerEnabledMethods";

export default function RevendedorPrecos() {
  const { issues } = usePricingIssues({ pollMs: 30_000 });
  const methods = useResellerEnabledMethods();

  const visibleTabs = useMemo(() => {
    if (methods.loading) return [] as { value: string; label: string; icon: any; render: () => JSX.Element }[];
    const t: { value: string; label: string; icon: any; render: () => JSX.Element }[] = [];
    if (methods.flow) t.push({ value: "promptflow", label: "MétodoFlow", icon: Sparkles, render: () => <MethodPriceTable method="flow" /> });
    t.push({ value: "lovax", label: "LovaX", icon: Beaker, render: () => <MethodPriceTable method="lovax" /> });
    t.push({ value: "claude", label: "Claude", icon: ClaudeIcon as any, render: () => <ClaudePriceTable /> });
    if (methods.recharges) t.push({ value: "recargas", label: "Recargas", icon: Zap, render: () => <RevendedorCreditos /> });
    if (methods.plano3k) t.push({ value: "plano", label: "Plano 3K", icon: CalendarClock, render: () => <RevendedorPlanoPreco /> });
    return t;
  }, [methods.loading, methods.flow, methods.recharges, methods.plano3k]);

  const [tab, setTab] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return p ?? "";
  });
  const activeTab = visibleTabs.find((t) => t.value === tab)?.value ?? visibleTabs[0]?.value ?? "";

  return (
    <div>
      <PageHeader
        title="Precificação"
        description="Defina seus preços de venda para extensões e recargas."
      />

      {issues.length > 0 && <PricingIssuesBanner issues={issues} className="mb-5" />}

      {methods.loading ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : visibleTabs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Nenhum método de venda habilitado no momento.
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-5 flex w-full justify-start overflow-x-auto md:inline-flex md:w-auto">
            {visibleTabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {visibleTabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0">
              {t.render()}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}