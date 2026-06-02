import {
  Rocket, Zap, Star, Crown, Gem, Sparkles, Trophy, Shield, Flame, Package,
  type LucideIcon,
} from "lucide-react";

export const PACK_ICONS: Record<string, LucideIcon> = {
  Rocket, Zap, Star, Crown, Gem, Sparkles, Trophy, Shield, Flame, Package,
};

export const PACK_ICON_NAMES = Object.keys(PACK_ICONS);

export function PackIcon({ name, className }: { name?: string | null; className?: string }) {
  const Cmp = (name && PACK_ICONS[name]) || Package;
  return <Cmp className={className} />;
}