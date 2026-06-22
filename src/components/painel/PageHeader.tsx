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
  <div className="mb-6 flex flex-col gap-4 text-center sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:text-left">
    <div className="min-w-0 flex flex-col gap-3 items-center sm:items-start">
      <div className="flex items-center gap-3.5">
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-gradient-primary-soft text-primary shadow-elegant ring-1 ring-inset ring-primary/10">
            <Icon className="h-5 w-5" />
          </div>
        )}
        {typeof title === "string" ? (
          <h1 className="font-display text-[1.75rem] sm:text-4xl lg:text-5xl font-black tracking-[-0.035em] leading-[1.05]">
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
        <p className="max-w-2xl text-[13px] sm:text-sm text-muted-foreground font-medium leading-relaxed tracking-tight text-center sm:text-left">
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 shrink-0">
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
      "card-premium group p-4 sm:p-5 flex flex-col justify-between gap-3 min-h-[120px]",
      className
    )}>
      {/* subtle accent wash */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30",
          a.text
        )}
      />
      <div className="relative z-10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
          {Icon && (
            <span className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md border",
              a.badgeBg, a.badgeBorder, a.text
            )}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="line-clamp-1">{label}</span>
        </div>
        {badge ? (
          <div className="relative z-10">{badge}</div>
        ) : trend ? (
          <div className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
            trend.isPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
          )}>
            {trend.isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value}%
          </div>
        ) : null}
      </div>

      <div className={cn(
        "relative z-10 font-display text-2xl sm:text-3xl font-black tracking-[-0.03em] leading-none break-all tabular-nums",
        a.text
      )}>
        {value}
      </div>

      {hint && (
        <p className="relative z-10 text-[11px] text-muted-foreground/90 leading-snug line-clamp-2 font-medium">
          {hint}
        </p>
      )}

      {Icon && (
        <div className="absolute -right-3 -bottom-3 opacity-[0.06] group-hover:opacity-[0.14] transition-opacity duration-500 pointer-events-none">
          <Icon className={cn("h-16 w-16 rotate-12", a.text)} />
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
