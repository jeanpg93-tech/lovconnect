import logoHorizontal from "@/assets/lc-logo-horizontal.png";
import logoIcon from "@/assets/lc-icon.png";

type LovMainLogoProps = {
  className?: string;
  variant?: "horizontal" | "icon";
  /** Tailwind height class for the rendered image (default h-9). */
  size?: string;
};

export const LovMainLogo = ({
  className = "",
  variant = "horizontal",
  size = "h-9",
}: LovMainLogoProps) => {
  const src = variant === "icon" ? logoIcon : logoHorizontal;
  return (
    <img
      src={src}
      alt="LovConnect"
      className={`${size} w-auto select-none object-contain ${className}`}
      draggable={false}
    />
  );
};
