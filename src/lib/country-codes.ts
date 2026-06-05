export type CountryDialCode = {
  code: string;
  flag: string;
  country: string;
};

export const countryDialCodes: CountryDialCode[] = [
  { code: "55", flag: "🇧🇷", country: "Brasil" },
  { code: "1", flag: "🇺🇸", country: "Estados Unidos / Canadá" },
  { code: "351", flag: "🇵🇹", country: "Portugal" },
  { code: "54", flag: "🇦🇷", country: "Argentina" },
  { code: "56", flag: "🇨🇱", country: "Chile" },
  { code: "57", flag: "🇨🇴", country: "Colômbia" },
  { code: "52", flag: "🇲🇽", country: "México" },
  { code: "595", flag: "🇵🇾", country: "Paraguai" },
  { code: "598", flag: "🇺🇾", country: "Uruguai" },
  { code: "591", flag: "🇧🇴", country: "Bolívia" },
  { code: "51", flag: "🇵🇪", country: "Peru" },
  { code: "58", flag: "🇻🇪", country: "Venezuela" },
  { code: "34", flag: "🇪🇸", country: "Espanha" },
  { code: "44", flag: "🇬🇧", country: "Reino Unido" },
  { code: "33", flag: "🇫🇷", country: "França" },
  { code: "49", flag: "🇩🇪", country: "Alemanha" },
  { code: "39", flag: "🇮🇹", country: "Itália" },
  { code: "353", flag: "🇮🇪", country: "Irlanda" },
  { code: "31", flag: "🇳🇱", country: "Holanda" },
  { code: "32", flag: "🇧🇪", country: "Bélgica" },
];

export const DEFAULT_DIAL_CODE = "55";

/**
 * Split a stored phone (digits only, with country code) into ddi + local part.
 * Best-effort: tries to match the longest known DDI prefix; defaults to BR (55).
 */
export const splitDialCode = (
  full: string | null | undefined,
): { ddi: string; local: string } => {
  const digits = (full ?? "").replace(/\D/g, "");
  if (!digits) return { ddi: DEFAULT_DIAL_CODE, local: "" };
  const sorted = [...countryDialCodes].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (digits.startsWith(c.code) && digits.length > c.code.length) {
      return { ddi: c.code, local: digits.slice(c.code.length) };
    }
  }
  // No DDI prefix detected — assume Brazil and strip duplicate 55 if present.
  return { ddi: DEFAULT_DIAL_CODE, local: digits };
};