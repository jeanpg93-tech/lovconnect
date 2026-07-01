import { LovMainLogo } from "@/components/LovMainLogo";

/**
 * Discreet "Feito por LovConnect" credit shown in the Claude customer portal
 * (both login and dashboard). Uses opacity so it never competes with the
 * reseller's own branding.
 */
export function PortalFooterBrand({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://lovconnect.store"
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] opacity-50 hover:opacity-90 transition-opacity ${className}`}
    >
      <span>Feito por</span>
      <LovMainLogo variant="icon" size="h-4" className="opacity-90" />
      <span className="font-semibold">LovConnect</span>
    </a>
  );
}