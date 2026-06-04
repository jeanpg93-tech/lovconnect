import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useActivation } from "@/hooks/useActivation";

type TourStatus = "pending" | "completed" | "skipped";

type Ctx = {
  shouldShow: boolean;
  running: boolean;
  status: TourStatus | null;
  start: () => void;
  stop: () => void;
  restart: () => void;
  markCompleted: () => Promise<void>;
  markSkipped: () => Promise<void>;
};

const OnboardingTourContext = createContext<Ctx | undefined>(undefined);

export function OnboardingTourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { primaryRole } = useRole();
  const isReseller = primaryRole === "revendedor";
  const { status: activationStatus } = useActivation(user && isReseller ? user.id : undefined);

  const [resellerId, setResellerId] = useState<string | null>(null);
  const [status, setStatus] = useState<TourStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [forceShow, setForceShow] = useState(false);

  // Carrega status do tour
  useEffect(() => {
    if (!user || !isReseller) {
      setResellerId(null);
      setStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("resellers")
        .select("id, onboarding_tour_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setResellerId(data.id);
      setStatus((data.onboarding_tour_status as TourStatus) ?? "pending");
    })();
    return () => { cancelled = true; };
  }, [user, isReseller]);

  const shouldShow = useMemo(() => {
    if (!isReseller) return false;
    if (activationStatus !== "active") return false;
    if (forceShow) return true;
    return status === "pending";
  }, [isReseller, activationStatus, status, forceShow]);

  const start = useCallback(() => setRunning(true), []);
  const stop = useCallback(() => setRunning(false), []);

  const persist = useCallback(async (newStatus: TourStatus) => {
    if (!resellerId) return;
    await supabase
      .from("resellers")
      .update({
        onboarding_tour_status: newStatus,
        onboarding_tour_completed_at: new Date().toISOString(),
      })
      .eq("id", resellerId);
    setStatus(newStatus);
    setForceShow(false);
    setRunning(false);
  }, [resellerId]);

  const markCompleted = useCallback(() => persist("completed"), [persist]);
  const markSkipped = useCallback(() => persist("skipped"), [persist]);

  const restart = useCallback(() => {
    setForceShow(true);
    setRunning(true);
  }, []);

  const value: Ctx = { shouldShow, running, status, start, stop, restart, markCompleted, markSkipped };
  return <OnboardingTourContext.Provider value={value}>{children}</OnboardingTourContext.Provider>;
}

export function useOnboardingTour() {
  const ctx = useContext(OnboardingTourContext);
  if (!ctx) throw new Error("useOnboardingTour must be used within OnboardingTourProvider");
  return ctx;
}