import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Wallet, Crown, Award } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RevendedorAdicionarSaldo from "./RevendedorAdicionarSaldo";
import RevendedorNiveis from "./RevendedorNiveis";
import RevendedorRanking from "./RevendedorRanking";

const TAB_KEYS = ["saldo", "niveis", "ranking"] as const;
type TabKey = typeof TAB_KEYS[number];

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "saldo", label: "Adicionar saldo", icon: Wallet },
  { key: "niveis", label: "Sequência & Níveis", icon: Crown },
  { key: "ranking", label: "Ranking", icon: Award },
];

export default function RevendedorCarteira() {
  const location = useLocation();
  const navigate = useNavigate();

  const initialTab: TabKey = (() => {
    const hash = location.hash.replace("#", "") as TabKey;
    return (TAB_KEYS as readonly string[]).includes(hash) ? hash : "saldo";
  })();
  const [tab, setTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    const hash = location.hash.replace("#", "") as TabKey;
    if ((TAB_KEYS as readonly string[]).includes(hash) && hash !== tab) {
      setTab(hash);
    }
  }, [location.hash]);

  const handleChange = (value: string) => {
    setTab(value as TabKey);
    navigate(`${location.pathname}#${value}`, { replace: true });
  };

  return (
    <div className="relative min-h-screen bg-background pb-24 text-foreground">
      {/* Page background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute top-[5%] left-[10%] h-[500px] w-[500px] rounded-full bg-primary/10 blur-[140px]" />
        <div className="absolute top-[40%] right-[5%] h-[400px] w-[400px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,hsl(var(--background))_90%)]" />
      </div>

      {/* Hero / Header */}
      <section className="relative pt-12 pb-6 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                Centro Financeiro
              </span>
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-bold tracking-tighter leading-[1.05]">
              Sua <span className="italic text-primary">Carteira</span>
            </h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-xl leading-relaxed">
              Gerencie seu saldo, acompanhe seu nível e veja sua posição no ranking — tudo em um único lugar.
            </p>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="relative px-2 sm:px-4">
        <div className="container mx-auto max-w-6xl px-0 sm:px-4">
          <Tabs value={tab} onValueChange={handleChange} className="space-y-8">
            <div className="flex justify-center border-b border-border">
              <TabsList className="bg-transparent h-12 gap-1 sm:gap-6 px-0 w-full sm:w-auto justify-center overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="shrink-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground font-semibold text-xs sm:text-sm transition-all px-3 sm:px-4 flex items-center gap-2"
                  >
                    <t.icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t.label}</span>
                    <span className="sm:hidden">
                      {t.key === "saldo" ? "Saldo" : t.key === "niveis" ? "Níveis" : "Ranking"}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="saldo" className="animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none">
              <RevendedorAdicionarSaldo />
            </TabsContent>
            <TabsContent value="niveis" className="animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none">
              <RevendedorNiveis />
            </TabsContent>
            <TabsContent value="ranking" className="animate-in fade-in slide-in-from-bottom-4 duration-500 outline-none">
              <RevendedorRanking />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}