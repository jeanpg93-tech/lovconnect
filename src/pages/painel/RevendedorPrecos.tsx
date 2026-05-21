import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/painel/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sparkles, Zap, Beaker, Loader2 } from "lucide-react";
import RevendedorExtensoes from "./RevendedorExtensoes";
import RevendedorCreditos from "./RevendedorCreditos";

export default function RevendedorPrecos() {
  const [tab, setTab] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return p && ["promptflow", "lovax", "recargas"].includes(p) ? p : "promptflow";
  });

  const [promptflowId, setPromptflowId] = useState<string | null>(null);
  const [lovaxId, setLovaxId] = useState<string | null>(null);
  const [loadingExt, setLoadingExt] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("extensions")
        .select("id,name,slug")
        .eq("is_active", true);
      const list = data ?? [];
      const pf = list.find(
        (e) =>
          /promptflow/i.test(e.name) ||
          /promptflow/i.test(e.slug) ||
          e.slug === "lovmain-unlimited",
      );
      const lx = list.find(
        (e) => /lovax/i.test(e.name) || /lovax/i.test(e.slug),
      );
      setPromptflowId(pf?.id ?? null);
      setLovaxId(lx?.id ?? null);
      setLoadingExt(false);
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Precificação"
        description="Defina seus preços de venda para extensões e recargas."
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="mb-5 grid w-full grid-cols-3 md:inline-flex md:w-auto">
          <TabsTrigger value="promptflow" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> PromptFlow
          </TabsTrigger>
          <TabsTrigger value="lovax" className="gap-1.5">
            <Beaker className="h-3.5 w-3.5" /> LovaX
          </TabsTrigger>
          <TabsTrigger value="recargas" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Recargas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="promptflow" className="mt-0">
          {loadingExt ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : promptflowId ? (
            <RevendedorExtensoes extensionId={promptflowId} />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-sm text-muted-foreground">
              Extensão PromptFlow indisponível no momento.
            </div>
          )}
        </TabsContent>

        <TabsContent value="lovax" className="mt-0">
          {loadingExt ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : lovaxId ? (
            <RevendedorExtensoes extensionId={lovaxId} />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Beaker className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">LovaX em breve</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                A precificação da extensão LovaX será liberada em breve.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="recargas" className="mt-0">
          <RevendedorCreditos />
        </TabsContent>
      </Tabs>
    </div>
  );
}