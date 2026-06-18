/**
 * Extrai uma paleta de cores dominantes de uma imagem usando Canvas API.
 * Quantização simples por buckets de 32 (4096 cores possíveis), ordena por frequência
 * e descarta cores muito próximas do branco/preto puros.
 */

export type Swatch = { hex: string; r: number; g: number; b: number; count: number };

function toHex(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function extractPaletteFromImage(
  source: File | string,
  topN = 5,
): Promise<Swatch[]> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    // Redimensiona para no máx 128x128 — rápido e amostragem suficiente
    const max = 128;
    const scale = Math.min(max / img.width, max / img.height, 1);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, w, h);

    let pixels: Uint8ClampedArray;
    try {
      pixels = ctx.getImageData(0, 0, w, h).data;
    } catch {
      // Imagem cross-origin sem CORS — não conseguimos ler
      return [];
    }

    const buckets = new Map<string, Swatch>();
    const STEP = 32; // 8 buckets por canal

    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3];
      if (a < 200) continue; // ignora transparente
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Descarta tons quase brancos ou pretos puros (geralmente background da logo)
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum > 240) continue;
      if (lum < 20) continue;

      // Descarta cinzas muito desaturados
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      if (sat < 0.15) continue;

      const br = Math.min(255, Math.floor(r / STEP) * STEP + STEP / 2);
      const bg = Math.min(255, Math.floor(g / STEP) * STEP + STEP / 2);
      const bb = Math.min(255, Math.floor(b / STEP) * STEP + STEP / 2);
      const key = `${br}-${bg}-${bb}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.count++;
      } else {
        buckets.set(key, { r: br, g: bg, b: bb, count: 1, hex: rgbToHex(br, bg, bb) });
      }
    }

    const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);

    // Remove cores muito próximas umas das outras (distância < 60)
    const dedup: Swatch[] = [];
    for (const s of sorted) {
      const close = dedup.some(
        (d) =>
          Math.abs(d.r - s.r) + Math.abs(d.g - s.g) + Math.abs(d.b - s.b) < 60,
      );
      if (!close) dedup.push(s);
      if (dedup.length >= topN) break;
    }

    return dedup;
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}