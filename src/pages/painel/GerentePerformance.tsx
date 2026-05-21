import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/painel/PageHeader";
import {
  Gauge,
  ExternalLink,
  RefreshCw,
  Zap,
  Image as ImageIcon,
  Code2,
  Database,
  Network,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";

type NavMetrics = {
  ttfb: number;
  domContentLoaded: number;
  loadComplete: number;
  domInteractive: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
};

type ResourceStat = {
  type: string;
  count: number;
  totalKb: number;
  slowest: number;
};

function getNavigationMetrics(): NavMetrics | null {
  const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (!nav) return null;
  return {
    ttfb: Math.round(nav.responseStart - nav.requestStart),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
    domInteractive: Math.round(nav.domInteractive - nav.startTime),
    loadComplete: Math.round(nav.loadEventEnd - nav.startTime),
    transferSize: nav.transferSize,
    encodedBodySize: nav.encodedBodySize,
    decodedBodySize: nav.decodedBodySize,
  };
}

function getResourceStats(): ResourceStat[] {
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  const groups: Record<string, { count: number; bytes: number; slowest: number }> = {};
  for (const r of resources) {
    const key = r.initiatorType || "outro";
    if (!groups[key]) groups[key] = { count: 0, bytes: 0, slowest: 0 };
    groups[key].count++;
    groups[key].bytes += r.transferSize || 0;
    groups[key].slowest = Math.max(groups[key].slowest, Math.round(r.duration));
  }
  return Object.entries(groups)
    .map(([type, v]) => ({ type, count: v.count, totalKb: Math.round(v.bytes / 1024), slowest: v.slowest }))
    .sort((a, b) => b.totalKb - a.totalKb);
}

function ratingFromMs(ms: number, good: number, poor: number) {
  if (ms <= good) return { label: "Bom", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" };
  if (ms <= poor) return { label: "Aceitável", color: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  return { label: "Lento", color: "bg-rose-500/15 text-rose-600 border-rose-500/30" };
}

function MetricCard({
  icon: Icon,
  label,
  valueMs,
  good,
  poor,
  hint,
}: {
  icon: any;
  label: string;
  valueMs: number;
  good: number;
  poor: number;
  hint: string;
}) {
  const r = ratingFromMs(valueMs, good, poor);
  const pct = Math.min(100, (valueMs / (poor * 1.5)) * 100);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" /> {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end justify-between">
          <div className="font-display text-2xl font-bold tabular-nums">{valueMs} ms</div>
          <Badge variant="outline" className={r.color}>{r.label}</Badge>
        </div>
        <Progress value={pct} className="h-1.5" />
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

const CHECKLIST: { title: string; desc: string; status: "ok" | "warn"; icon: any }[] = [
  { title: "Code-splitting por rota", desc: "Páginas usam React.lazy + Suspense em PanelRoutes.", status: "ok", icon: Code2 },
  { title: "Imagens otimizadas", desc: "Use WebP/AVIF, atributos width/height e loading=\"lazy\" em imagens fora do viewport inicial.", status: "warn", icon: ImageIcon },
  { title: "Consultas Supabase", desc: "Selecione apenas colunas necessárias (.select('a,b')) e adicione índices nas colunas filtradas.", status: "warn", icon: Database },
  { title: "Realtime", desc: "Cancele canais (removeChannel) ao desmontar componentes para evitar reconexões.", status: "ok", icon: Network },
  { title: "Cache de respostas", desc: "Use useCachedFetch / staleTime para evitar refetch desnecessário.", status: "warn", icon: Zap },
];

export default function GerentePerformance() {
  const [nav, setNav] = useState<NavMetrics | null>(null);
  const [resources, setResources] = useState<ResourceStat[]>([]);
  const [psiUrl, setPsiUrl] = useState("https://baselovmain.lovable.app");

  const refresh = () => {
    setNav(getNavigationMetrics());
    setResources(getResourceStats());
  };

  useEffect(() => {
    const t = setTimeout(refresh, 300);
    return () => clearTimeout(t);
  }, []);

  const totalKb = resources.reduce((acc, r) => acc + r.totalKb, 0);
  const totalReq = resources.reduce((acc, r) => acc + r.count, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Performance & Velocidade"
        description="Diagnóstico do painel, ferramentas de medição e checklist de otimização."
        icon={Gauge}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={refresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" /> Recoletar métricas
        </Button>
        <Badge variant="outline" className="font-mono">
          {totalReq} requisições · {totalKb} KB transferidos
        </Badge>
      </div>

      {nav && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={Network} label="TTFB (servidor)" valueMs={nav.ttfb} good={200} poor={600} hint="Tempo até o primeiro byte do servidor." />
          <MetricCard icon={Code2} label="DOM Interativo" valueMs={nav.domInteractive} good={1500} poor={3500} hint="HTML pronto para interagir." />
          <MetricCard icon={Zap} label="DOMContentLoaded" valueMs={nav.domContentLoaded} good={1800} poor={4000} hint="Scripts iniciais executados." />
          <MetricCard icon={Clock} label="Load completo" valueMs={nav.loadComplete} good={2500} poor={5000} hint="Página totalmente carregada." />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4 text-primary" /> Recursos carregados
            </CardTitle>
            <CardDescription>Agrupado por tipo de inicialização desta sessão.</CardDescription>
          </CardHeader>
          <CardContent>
            {resources.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados ainda. Clique em recoletar.</p>
            ) : (
              <div className="space-y-2">
                {resources.map((r) => (
                  <div key={r.type} className="flex items-center justify-between rounded-md border bg-card/50 p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono uppercase">{r.type}</Badge>
                      <span className="text-muted-foreground">{r.count} arq.</span>
                    </div>
                    <div className="flex items-center gap-3 tabular-nums text-xs">
                      <span>{r.totalKb} KB</span>
                      <span className="text-muted-foreground">pico {r.slowest}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-primary" /> Ferramentas externas
            </CardTitle>
            <CardDescription>Analise o site público com auditorias completas (Core Web Vitals).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">URL para auditoria</label>
              <Input value={psiUrl} onChange={(e) => setPsiUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" size="sm">
                <a target="_blank" rel="noreferrer" href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(psiUrl)}`}>
                  PageSpeed Insights <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a target="_blank" rel="noreferrer" href={`https://gtmetrix.com/?url=${encodeURIComponent(psiUrl)}`}>
                  GTmetrix <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a target="_blank" rel="noreferrer" href={`https://www.webpagetest.org/?url=${encodeURIComponent(psiUrl)}`}>
                  WebPageTest <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a target="_blank" rel="noreferrer" href={`https://tools.pingdom.com/?url=${encodeURIComponent(psiUrl)}`}>
                  Pingdom <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Checklist de otimização
          </CardTitle>
          <CardDescription>Pontos para revisar continuamente na base de código.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {CHECKLIST.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="flex items-start gap-3 rounded-md border bg-card/50 p-3">
                <Icon className="mt-0.5 h-4 w-4 text-primary" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.title}</span>
                    {c.status === "ok" ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">OK</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Revisar
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.desc}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" /> Dica: instância do backend
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Se o gargalo for o backend (consultas lentas, timeouts, muitos usuários simultâneos), considere
            aumentar o tamanho da instância do Lovable Cloud em <strong>Backend → Advanced settings → Upgrade instance</strong>.
          </p>
          <p>
            Antes disso, verifique índices em colunas filtradas, evite <code>select('*')</code> e cancele canais Realtime ao desmontar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
