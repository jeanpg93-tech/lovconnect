import { Zap } from "lucide-react";

export const LovMainLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-primary shadow-red-glow-sm">
      <Zap className="h-4 w-4 fill-primary-foreground text-primary-foreground" strokeWidth={2.5} />
    </div>
    <span className="font-display text-lg font-bold tracking-tight">
      Revendovable <span className="text-primary">Store</span>
    </span>
  </div>
);
