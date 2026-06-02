import { useMemo } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { format, startOfDay, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PeriodKey = "today" | "7d" | "30d" | "month" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  month: "Este mês",
  custom: "Período personalizado",
};

export function computeRange(
  key: PeriodKey,
  customFrom?: Date,
  customTo?: Date,
): { from: Date; to: Date; label: string } | null {
  const now = new Date();
  if (key === "today") return { from: startOfDay(now), to: now, label: "Hoje" };
  if (key === "7d") return { from: subDays(now, 7), to: now, label: "Últimos 7 dias" };
  if (key === "30d") return { from: subDays(now, 30), to: now, label: "Últimos 30 dias" };
  if (key === "month") return { from: startOfMonth(now), to: now, label: "Este mês" };
  if (key === "custom" && customFrom && customTo) {
    const to = new Date(customTo);
    to.setHours(23, 59, 59, 999);
    return {
      from: startOfDay(customFrom),
      to,
      label: `${format(customFrom, "dd/MM", { locale: ptBR })} – ${format(customTo, "dd/MM", { locale: ptBR })}`,
    };
  }
  return null;
}

export default function PeriodFilter({
  value,
  onChange,
  customFrom,
  customTo,
  onCustomChange,
  size = "sm",
}: {
  value: PeriodKey;
  onChange: (v: PeriodKey) => void;
  customFrom?: Date;
  customTo?: Date;
  onCustomChange: (from?: Date, to?: Date) => void;
  size?: "sm" | "xs";
}) {
  const triggerH = size === "xs" ? "h-7 text-[11px]" : "h-8 text-xs";
  const triggerW = size === "xs" ? "w-[150px]" : "w-[170px]";
  const range = useMemo(() => computeRange(value, customFrom, customTo), [value, customFrom, customTo]);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={value} onValueChange={(v) => onChange(v as PeriodKey)}>
        <SelectTrigger className={`${triggerH} ${triggerW}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
            <SelectItem key={k} value={k} className="text-xs">{PERIOD_LABELS[k]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={`${triggerH} gap-1.5`}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {customFrom && customTo
                ? `${format(customFrom, "dd/MM", { locale: ptBR })} – ${format(customTo, "dd/MM", { locale: ptBR })}`
                : "Escolher datas"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from: customFrom, to: customTo }}
              onSelect={(r: any) => onCustomChange(r?.from, r?.to)}
              numberOfMonths={2}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      )}
      {range && (
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold hidden md:inline">
          {range.label}
        </span>
      )}
    </div>
  );
}