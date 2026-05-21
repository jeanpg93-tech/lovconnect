import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export const PageHeader = ({
  title,
  description,
  actions,
  icon: Icon,
}: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  icon?: any;
}) => (
  <div className="mb-6 flex flex-col gap-4 text-center sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:text-left">
    <div className="min-w-0 flex-col gap-2 items-center flex sm:items-center justify-center">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-glow-sm">
            <Icon className="h-5 w-5" />
          </div>
        )}
        {typeof title === "string" ? (
          <h1 className="font-display text-3xl font-black tracking-tighter sm:text-4xl">
            {title.includes(" ") ? (
              <>
                {title.substring(0, title.lastIndexOf(" "))}{" "}
                <span className="text-primary italic">{title.substring(title.lastIndexOf(" ") + 1)}</span>
              </>
            ) : (
              title
            )}
          </h1>
        ) : (
          title
        )}
      </div>
      {description && (
        <p className="max-w-2xl text-sm text-muted-foreground font-medium leading-relaxed text-center">
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
        {actions}
      </div>
    )}
  </div>
);

type StatAccent = "primary" | "emerald" | "amber" | "destructive" | "sky" | "violet";

const accentMap: Record<StatAccent, { text: string; badgeBg: string; badgeBorder: string }> = {
  primary: { text: "text-primary", badgeBg: "bg-primary/10", badgeBorder: "border-primary/30" },
  emerald: { text: "text-emerald-500", badgeBg: "bg-emerald-500/10", badgeBorder: "border-emerald-500/30" },
  amber: { text: "text-amber-500", badgeBg: "bg-amber-500/10", badgeBorder: "border-amber-500/30" },
  destructive: { text: "text-destructive", badgeBg: "bg-destructive/10", badgeBorder: "border-destructive/30" },
  sky: { text: "text-sky-500", badgeBg: "bg-sky-500/10", badgeBorder: "border-sky-500/30" },
  violet: { text: "text-violet-500", badgeBg: "bg-violet-500/10", badgeBorder: "border-violet-500/30" },
};

export const StatCard = ({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  accent = "primary",
  badge,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: any;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  accent?: StatAccent;
  badge?: ReactNode;
  className?: string;
}) => {
  const a = accentMap[accent];
  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl border border-border bg-card/40 p-4 flex flex-col justify-between transition-all duration-300 hover:bg-card/60 sm:p-5",
      className
    )}>
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {Icon && <Icon className={cn("h-3.5 w-3.5", a.text)} />}
          <span className="line-clamp-1">{label}</span>
        </div>
        {badge ? (
          <div className="relative z-10">{badge}</div>
        ) : trend ? (
          <div className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
            trend.isPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
          )}>
            {trend.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value}%
          </div>
        ) : null}
      </div>

      <div className={cn(
        "relative z-10 mt-2 font-display md:text-3xl font-bold break-all text-xl",
        a.text
      )}>
        {value}
      </div>

      {hint && (
        <p className="relative z-10 mt-1 text-[10px] text-muted-foreground leading-tight line-clamp-2">
          {hint}
        </p>
      )}

      {Icon && (
        <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
          <Icon className={cn("h-12 w-12 rotate-12", a.text)} />
        </div>
      )}
    </div>
  );
};

/** Container padronizado para páginas do painel */
export const PageContainer = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("space-y-6 sm:space-y-8 animate-in fade-in duration-700 max-w-7xl mx-auto", className)}>
    {children}
  </div>
);
