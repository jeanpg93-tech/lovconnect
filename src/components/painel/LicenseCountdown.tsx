import { useEffect, useState, memo } from "react";

function formatCountdown(target: Date, now: number): string {
  let diff = Math.max(0, target.getTime() - now);
  const d = Math.floor(diff / 86400000); diff -= d * 86400000;
  const h = Math.floor(diff / 3600000); diff -= h * 3600000;
  const m = Math.floor(diff / 60000); diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Renderiza apenas o contador regressivo, isolando o tick de 1s
 * para que a tabela inteira não re-renderize a cada segundo.
 */
const LicenseCountdown = memo(function LicenseCountdown({ target }: { target: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{formatCountdown(target, now)}</>;
});

export default LicenseCountdown;