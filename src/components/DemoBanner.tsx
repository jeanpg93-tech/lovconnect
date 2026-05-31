import { useState } from "react";
import { Sparkles, RotateCcw, Loader2 } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DemoBanner() {
  const { isDemo } = useRole();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  if (!isDemo) return null;

  const handleReset = async () => {
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("reset-demo-account", { body: {} });
    setResetting(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? t("demoBanner.resetFail"));
      return;
    }
    toast.success(t("demoBanner.resetSuccess"));
    setOpen(false);
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <>
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent px-3 py-2 text-amber-700 dark:text-amber-300 shadow-sm">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 text-[12px] leading-snug sm:text-sm">
          <span className="font-bold uppercase tracking-wider">{t("demoBanner.label")}</span>
          <span className="hidden sm:inline"> {t("demoBanner.descFull")}</span>
          <span className="sm:hidden"> {t("demoBanner.descShort")}</span>
        </div>
        <LanguageSwitcher />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 h-7 gap-1 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200"
          onClick={() => setOpen(true)}
        >
          <RotateCcw className="h-3 w-3" />
          <span className="hidden sm:inline">{t("demoBanner.reset")}</span>
        </Button>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("demoBanner.dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("demoBanner.dialogDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={resetting} className="gap-2">
              {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("demoBanner.confirmReset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}