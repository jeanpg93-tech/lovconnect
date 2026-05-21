import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "gerente" | "revendedor" | "cliente";

const ROLE_PRIORITY: Record<AppRole, number> = {
  gerente: 1,
  revendedor: 2,
  cliente: 3,
};

type RoleSnapshot = {
  roles: AppRole[];
  isBanned: boolean;
  isActive: boolean;
  hasData: boolean;
  loading: boolean;
  userId: string | null;
};

// ---- Singleton store shared by every useRole() consumer ----
const initialFromCache = (): RoleSnapshot => {
  let roles: AppRole[] = [];
  let isBanned = false;
  let isActive = true;
  let hasData = false;
  try {
    const cached = localStorage.getItem("app_roles_cache");
    if (cached) {
      roles = JSON.parse(cached) as AppRole[];
      hasData = true;
    }
    if (localStorage.getItem("user_is_banned") === "true") isBanned = true;
    if (localStorage.getItem("user_is_active") === "false") isActive = false;
  } catch {
    /* noop */
  }
  return { roles, isBanned, isActive, hasData, loading: false, userId: null };
};

let snapshot: RoleSnapshot = initialFromCache();
let inflight: Promise<void> | null = null;
let lastFetchedUserId: string | null = null;
const subscribers = new Set<(s: RoleSnapshot) => void>();

const setSnapshot = (next: Partial<RoleSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  subscribers.forEach((cb) => cb(snapshot));
};

const fetchRoles = async (userId: string) => {
  if (inflight && lastFetchedUserId === userId) return inflight;
  lastFetchedUserId = userId;
  setSnapshot({ loading: !snapshot.hasData });
  inflight = (async () => {
    try {
      const [rolesRes, profileRes, resellerRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("id, is_banned").eq("id", userId).maybeSingle(),
        supabase.from("resellers").select("is_active").eq("user_id", userId).maybeSingle(),
      ]);

      const next: Partial<RoleSnapshot> = { loading: false, userId, hasData: true };

      if (profileRes.data) {
        next.isBanned = !!profileRes.data.is_banned;
        localStorage.setItem("user_is_banned", next.isBanned ? "true" : "false");
      }
      if (resellerRes.data) {
        next.isActive = !!resellerRes.data.is_active;
        localStorage.setItem("user_is_active", next.isActive ? "true" : "false");
      } else if (!resellerRes.error) {
        next.isActive = true;
        localStorage.setItem("user_is_active", "true");
      }

      if (!rolesRes.error) {
        const fetched = (rolesRes.data ?? []).map((r) => r.role as AppRole);
        next.roles = fetched;
        localStorage.setItem("app_roles_cache", JSON.stringify(fetched));
      }
      setSnapshot(next);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
};

const resetRoles = () => {
  lastFetchedUserId = null;
  inflight = null;
  localStorage.removeItem("app_roles_cache");
  localStorage.removeItem("user_is_banned");
  localStorage.removeItem("user_is_active");
  setSnapshot({ roles: [], isBanned: false, isActive: true, hasData: false, loading: false, userId: null });
};

export const useRole = () => {
  const { user, loading: authLoading } = useAuth();
  useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      if (snapshot.hasData || snapshot.userId) resetRoles();
      return;
    }
    // Refetch only when the user changes (or first load)
    if (lastFetchedUserId !== user.id) {
      void fetchRoles(user.id);
    }
  }, [user?.id, authLoading]);

  const currentRoles = snapshot.roles;
  const primaryRole: AppRole | null =
    currentRoles.length === 0
      ? null
      : [...currentRoles].sort((a, b) => ROLE_PRIORITY[a] - ROLE_PRIORITY[b])[0];

  return {
    roles: currentRoles,
    primaryRole,
    isGerente: currentRoles.includes("gerente"),
    isRevendedor: currentRoles.includes("revendedor"),
    isCliente: currentRoles.includes("cliente"),
    isBanned: snapshot.isBanned,
    isActive: snapshot.isActive,
    loading: snapshot.loading,
    authLoading,
    hasData: snapshot.hasData,
  };
};
