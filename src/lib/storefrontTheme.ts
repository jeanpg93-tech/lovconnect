import type { CSSProperties } from "react";

type StorefrontThemeStyle = CSSProperties & Record<`--${string}`, string>;

const HEX_3 = /^#([\da-f])([\da-f])([\da-f])$/i;
const HEX_6 = /^#[\da-f]{6}$/i;

export const normalizeHexColor = (value?: string | null, fallback = "#7c3aed") => {
  const raw = (value ?? "").trim();
  const fallbackColor = HEX_6.test(fallback) ? fallback.toLowerCase() : "#7c3aed";

  if (HEX_6.test(raw)) return raw.toLowerCase();

  const short = raw.match(HEX_3);
  if (short) {
    const [, r, g, b] = short;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return fallbackColor;
};

export const alphaHex = (value: string | null | undefined, alpha: number, fallback = "#7c3aed") => {
  const hex = normalizeHexColor(value, fallback);
  const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${channel}`;
};

export const hexToHslTriplet = (value: string | null | undefined, fallback = "#7c3aed") => {
  const hex = normalizeHexColor(value, fallback).slice(1);
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const readableTextOnHex = (value: string | null | undefined, fallback = "#7c3aed") => {
  const hex = normalizeHexColor(value, fallback).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.58 ? "#07111f" : "#ffffff";
};

export const storefrontThemeVars = (accent: string | null | undefined): StorefrontThemeStyle => {
  const hsl = hexToHslTriplet(accent);

  return {
    "--primary": hsl,
    "--primary-glow": hsl,
    "--ring": hsl,
    "--sidebar-primary": hsl,
    "--red-glow": hsl,
  };
};