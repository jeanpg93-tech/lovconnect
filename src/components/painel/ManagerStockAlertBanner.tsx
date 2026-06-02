import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, AlertCircle, ArrowRight, Database, Settings2, X, Bell, BellOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useProviderCommitments } from "@/hooks/useProviderCommitments";
import { notify, ensureNotificationPermission } from "@/lib/notify";
import { cn } from "@/lib/utils";

type Severity = "ok" | "info" | "warn" | "critical" | "overcommit";

const SETTINGS_KEY = "manager_stock_alert_settings_v1";
const LAST_SEV_KEY = "manager_stock_alert_last_severity_v1";
const DISMISS_KEY = "manager_stock_alert_dismissed_severity_v1";

type Settings = {
  warnThreshold: number;
  criticalThreshold: number;
  soundEnabled: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  warnThreshold: 50,
  criticalThreshold: 15,
  soundEnabled: true,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw);
    return {
      warnThreshold: Number.isFinite(+s.warnThreshold) ? +s.warnThreshold : DEFAULT_SETTINGS.warnThreshold,
      criticalThreshold: Number.isFinite(+s.criticalThreshold) ? +s.criticalThreshold : DEFAULT_SETTINGS.criticalThreshold,
      soundEnabled: s.soundEnabled !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function severityRank(s: Severity): number {
  return { ok: 0, info: 1, warn: 2, critical: 3, overcommit: 4 }[s];
}

export default function ManagerStockAlertBanner() {
  const c = useProviderCommitments();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [dismissedSev, setDismissedSev] = useState<Severity | null>(() => {
    const v = (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY)) as Severity | null;
    return v && ["info", "warn", "critical", "overcommit"].includes(v) ? v : null;
  });
  const firedRef = useRef<string>("");

  // Persist settings
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  if (c.loading && !c.committed && !c.flowRemaining && !c.lovaxRemaining) return null;

  const total = c.totalRemaining;
  const available = c.realAvailable;
  const committed = c.committed;
  const overcommitted = Number.isFinite(total) && committed > total;

  let sev: Severity = "ok";
  if (overcommitted) sev = "overcommit";
  else if (Number.isFinite(available) && available <= 0) sev = "critical";
  else if (Number.isFinite(available) && available < settings.criticalThreshold) sev = "critical";
  else if (Number.isFinite(available) && available < settings.warnThreshold) sev = "warn";

  // Auto-notify when severity worsens (or stays critical/overcommit periodically)
  useEffect(() => {
    if (sev === "ok") {
      firedRef.current = "";
      try { localStorage.removeItem(LAST_SEV_KEY); } catch {}
      return;
    }
    const last = (typeof window !== "undefined" && localStorage.getItem(LAST_SEV_KEY)) || "ok";
    if (severityRank(sev) > severityRank(last as Severity)) {
      const title =
        sev === "overcommit" ? "🚨 Estoque sobrecomprometido"
        : sev === "critical" ? "🚨 Estoque crítico de licenças"
        : sev === "warn" ? "⚠️ Estoque de licenças baixo"
        : "Estoque de licenças";
      const body =
        sev === "overcommit"
          ? `Comprometido em packs (${committed}) excede o estoque (${Number.isFinite(total) ? total : "∞"}).`
          : `Disponível real: ${Number.isFinite(available) ? available : "∞"} licenças.`;
      notify(title, body, { tag: `stock-${sev}`, silent: !settings.soundEnabled });
      try { localStorage.setItem(LAST_SEV_KEY, sev); } catch {}
      // Reset dismiss when severity escalates
      if (dismissedSev && severityRank(sev) > severityRank(dismissedSev)) {
        setDismissedSev(null);
        try { localStorage.removeItem(DISMISS_KEY); } catch {}
      }
    } else {
      try { localStorage.setItem(LAST_SEV_KEY, sev); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sev, committed, total, available]);

  // Request permission once mounted
  useEffect(() => {
    if (settings.soundEnabled) { ensureNotificationPermission().catch(() => {}); }
  }, [settings.soundEnabled]);

  if (sev === "ok") return null;
  if (dismissedSev && severityRank(dismissedSev) >= severityRank(sev)) {
    // Allow showing a tiny settings strip even when dismissed
    return (
      <div className="flex items-center justify-end">
        <SettingsPopover settings={settings} setSettings={setSettings} onReshow={() => { setDismissedSev(null); localStorage.removeItem(DISMISS_KEY); }} dismissed />
      </div>
    );
  }

  const palette = sev === "overcommit" || sev === "critical"
    ? {
        border: "border-destructive/50",
        bg: "bg-destructive/10",
        iconBg: "bg-destructive/20 text-destructive",
        title: "text-destructive",
        cta: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      }
    : {
        border: "border-amber-500/50",
        bg: "bg-amber-500/10",
        iconBg: "bg-amber-500/20 text-amber-600 dark:text-amber-400",
        title: "text-amber-700 dark:text-amber-300",
        cta: "bg-amber-500 text-white hover:bg-amber-600",
      };

  const headline =
    sev === "overcommit"
      ? `Chaves comprometidas (${committed}) excedem o estoque disponível (${Number.isFinite(total) ? total : "∞"})`
      : sev === "critical"
        ? `Estoque crítico: ${Number.isFinite(available) ? available : "∞"} licenças disponíveis`
        : `Estoque baixo: ${Number.isFinite(available) ? available : "∞"} licenças disponíveis`;

  const description =
    sev === "overcommit"
      ? "Revendedores Pack podem não conseguir gerar todas as chaves prometidas. Recarregue as APIs do provedor com urgência."
      : sev === "critical"
        ? "Suas APIs de provedor estão quase sem estoque. Recarregue agora para não bloquear gerações."
        : `Você definiu alerta para abaixo de ${settings.warnThreshold} licenças. Considere recarregar em breve.`;

  return (
    <div className={cn("relative overflow-hidden rounded-xl border p-4", palette.border, palette.bg)} role="alert">
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", palette.iconBg)}>
          {sev === "overcommit" || sev === "critical"
            ? <AlertCircle className="h-4.5 w-4.5" />
            : <AlertTriangle className="h-4.5 w-4.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("font-display font-semibold", palette.title)}>{headline}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>

          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Metric label="Flow" value={!Number.isFinite(c.flowRemaining) ? "∞" : String(c.flowRemaining)} />
            <Metric label="Lovax" value={String(c.lovaxRemaining)} />
            <Metric label="Comprometido" value={String(committed)} accent="amber" />
            <Metric label="Disponível real" value={!Number.isFinite(available) ? "∞" : String(available)} accent={sev === "overcommit" || sev === "critical" ? "rose" : "emerald"} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to="/painel/gerente/api-provedor"
              className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", palette.cta)}
            >
              <Database className="h-3.5 w-3.5" />
              Gerenciar APIs do provedor
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <SettingsPopover settings={settings} setSettings={setSettings} />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setDismissedSev(sev);
                try { localStorage.setItem(DISMISS_KEY, sev); } catch {}
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Dispensar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "amber" | "rose" | "emerald" }) {
  const color =
    accent === "amber" ? "text-amber-600 dark:text-amber-400"
    : accent === "rose" ? "text-rose-600 dark:text-rose-400"
    : accent === "emerald" ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-sm font-bold", color)}>{value}</div>
    </div>
  );
}

function SettingsPopover({
  settings, setSettings, onReshow, dismissed,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onReshow?: () => void;
  dismissed?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Settings2 className="h-3.5 w-3.5 mr-1" />
          {dismissed ? "Alertas de estoque" : "Configurar alertas"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold">Alertas de estoque</div>
            <p className="text-xs text-muted-foreground">Definir limites de aviso e crítico (em licenças)</p>
          </div>
          <div>
            <Label className="text-xs">Avisar quando disponível menor que</Label>
            <Input
              type="number"
              min={0}
              value={settings.warnThreshold}
              onChange={(e) => setSettings({ ...settings, warnThreshold: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div>
            <Label className="text-xs">Crítico quando disponível menor que</Label>
            <Input
              type="number"
              min={0}
              value={settings.criticalThreshold}
              onChange={(e) => setSettings({ ...settings, criticalThreshold: Math.max(0, Number(e.target.value) || 0) })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-2">
            <div className="flex items-center gap-2 text-xs">
              {settings.soundEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              Som e notificação nativa
            </div>
            <Button size="sm" variant={settings.soundEnabled ? "default" : "outline"} className="h-7 text-xs"
              onClick={() => setSettings({ ...settings, soundEnabled: !settings.soundEnabled })}>
              {settings.soundEnabled ? "Ligado" : "Desligado"}
            </Button>
          </div>
          {dismissed && onReshow && (
            <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={onReshow}>
              Reexibir alerta atual
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}