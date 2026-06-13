import { useState } from "react";
import { PageHeader } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Zap, Beaker, CalendarClock } from "lucide-react";
import MethodPriceTable from "@/components/painel/MethodPriceTable";
import RevendedorCreditos from "./RevendedorCreditos";
import RevendedorPlanoPreco from "./RevendedorPlanoPreco";
import PricingIssuesBanner from "@/components/painel/PricingIssuesBanner";
import { usePricingIssues } from "@/hooks/usePricingIssues";

export default function RevendedorPrecos() {
  const [tab, setTab] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return p && ["promptflow", "lovax", "recargas", "plano"].includes(p) ? p : "promptflow";
  });
  const { issues } = usePricingIssues({ pollMs: 30_000 });

  return (
    <div>
      <PageHeader
        title="Precificação"
        description="Defina seus preços de venda para extensões e recargas."
      />

      {issues.length > 0 && <PricingIssuesBanner issues={issues} className="mb-5" />}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-5 grid w-full grid-cols-4 md:inline-flex md:w-auto">
          <TabsTrigger value="promptflow" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> PromptFlow
          </TabsTrigger>
          <TabsTrigger value="lovax" className="gap-1.5">
            <Beaker className="h-3.5 w-3.5" /> LovaX
          </TabsTrigger>
          <TabsTrigger value="recargas" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Recargas
          </TabsTrigger>
          <TabsTrigger value="plano" className="gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" /> Plano 3K
          </TabsTrigger>
        </TabsList>

        <TabsContent value="promptflow" className="mt-0">
          <MethodPriceTable method="flow" />
        </TabsContent>

        <TabsContent value="lovax" className="mt-0">
          <MethodPriceTable method="lovax" />
        </TabsContent>

        <TabsContent value="recargas" className="mt-0">
          <RevendedorCreditos />
        </TabsContent>

        <TabsContent value="plano" className="mt-0">
          <RevendedorPlanoPreco />
        </TabsContent>
      </Tabs>
    </div>
  );
}