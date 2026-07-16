import { useSystemMaintenance } from "./useSystemMaintenance";

/**
 * Helper for reseller emission UIs. Returns whether the current
 * action must be blocked because the system is in global maintenance.
 *
 * Usage:
 *   const guard = useMaintenanceGuard();
 *   <Button disabled={guard.disabled} title={guard.tooltip}>Vender</Button>
 *   if (guard.blocked()) return;  // inside submit()
 */
export function useMaintenanceGuard() {
  const { enabled, message, loading } = useSystemMaintenance();

  const disabled = enabled;
  const tooltip = enabled
    ? message ||
      "Sistema em manutenção — emissões pausadas temporariamente."
    : undefined;

  /** Return true when caller should abort. Shows a toast to the user. */
  const blocked = (): boolean => {
    if (!enabled) return false;
    // lazy import to avoid pulling sonner in SSR contexts
    import("sonner").then(({ toast }) => {
      toast.warning("Sistema em manutenção", { description: tooltip });
    });
    return true;
  };

  return { disabled, tooltip, blocked, loading, enabled, message };
}