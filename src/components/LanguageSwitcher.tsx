import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages, Check } from "lucide-react";

const LANGS = [
  { code: "pt", flag: "🇧🇷", label: "PT" },
  { code: "en", flag: "🇺🇸", label: "EN" },
] as const;

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? "pt").slice(0, 2);
  const active = LANGS.find((l) => l.code === current) ?? LANGS[0];

  const change = (code: string) => {
    void i18n.changeLanguage(code);
    try { localStorage.setItem("i18n_lang", code); } catch {}
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-border/60 bg-card/60 px-2"
          aria-label={t("language.switch")}
        >
          <span aria-hidden className="text-sm leading-none">{active.flag}</span>
          {!compact && <span className="text-xs font-semibold">{active.label}</span>}
          <Languages className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => change(l.code)}
            className="gap-2"
          >
            <span aria-hidden>{l.flag}</span>
            <span className="flex-1">{t(`language.${l.code}`)}</span>
            {l.code === current && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
