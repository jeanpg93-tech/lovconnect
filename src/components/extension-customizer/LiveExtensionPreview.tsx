import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";

type Props = {
  filePath: string | null;
  brandName?: string;
  primaryColor?: string;
  logoUrl?: string | null;
  height?: number;
};

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

function mimeOf(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] || "application/octet-stream";
}

export function LiveExtensionPreview({
  filePath,
  brandName,
  primaryColor,
  logoUrl,
  height = 620,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    // limpa blobs anteriores
    blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];

    if (!filePath) {
      setLoading(false);
      setError("Sem arquivo de extensão disponível para preview.");
      setDoc(null);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: dlErr } = await supabase.storage
          .from("extension-files")
          .download(filePath);
        if (dlErr || !data) throw dlErr ?? new Error("Falha ao baixar");

        const zip = await JSZip.loadAsync(await data.arrayBuffer());

        // Procura sidepanel.html, popup.html ou index.html
        const htmlCandidates = ["sidepanel.html", "popup.html", "index.html"];
        let htmlEntry: JSZip.JSZipObject | null = null;
        let htmlName = "";
        for (const cand of htmlCandidates) {
          const found = Object.values(zip.files).find(
            (f) => !f.dir && f.name.toLowerCase().endsWith(cand),
          );
          if (found) {
            htmlEntry = found;
            htmlName = found.name;
            break;
          }
        }
        if (!htmlEntry) throw new Error("HTML da extensão não encontrado no zip");

        const baseDir = htmlName.includes("/")
          ? htmlName.substring(0, htmlName.lastIndexOf("/") + 1)
          : "";

        // Gera blob URLs para todos os arquivos (relativos ao baseDir do html)
        const urlMap = new Map<string, string>();
        await Promise.all(
          Object.values(zip.files)
            .filter((f) => !f.dir)
            .map(async (f) => {
              const blob = await f.async("blob");
              const typed = new Blob([blob], { type: mimeOf(f.name) });
              const url = URL.createObjectURL(typed);
              blobUrlsRef.current.push(url);
              // chave: caminho relativo ao html (e também o caminho absoluto do zip)
              urlMap.set(f.name, url);
              if (baseDir && f.name.startsWith(baseDir)) {
                urlMap.set(f.name.substring(baseDir.length), url);
              }
            }),
        );

        let html = await htmlEntry.async("string");

        // Reescreve src/href relativos para blob URLs
        html = html.replace(
          /\b(src|href)\s*=\s*"([^"]+)"/g,
          (_m, attr, value: string) => {
            if (
              /^(https?:|data:|blob:|#|\/\/)/i.test(value) ||
              value.startsWith("javascript:")
            ) {
              return `${attr}="${value}"`;
            }
            const clean = value.replace(/^\.\//, "").replace(/^\//, "");
            const url = urlMap.get(clean) || urlMap.get(baseDir + clean);
            return url ? `${attr}="${url}"` : `${attr}="${value}"`;
          },
        );

        // Injeta CSS de override + tag <base> para resolver assets restantes
        const overrides = `
<style>
  :root {
    ${primaryColor ? `--ql-accent: ${primaryColor} !important;` : ""}
    ${primaryColor ? `--ql-primary: ${primaryColor} !important;` : ""}
    ${primaryColor ? `--brand-color: ${primaryColor} !important;` : ""}
  }
  /* Esconde scrollbars do iframe pra um look mais próximo */
  body { overflow: auto; }
</style>`;
        html = html.replace(/<\/head>/i, `${overrides}</head>`);

        // Substitui brand name visível (heurística simples)
        if (brandName) {
          html = html.replace(
            /(class="sp-brand-text"[^>]*>)[^<]*/,
            `$1⚡ ${brandName}`,
          );
        }
        // Substitui logo (heurística simples para tags img com classe sp-brand-logo)
        if (logoUrl) {
          html = html.replace(
            /<img([^>]*class="[^"]*sp-brand-logo[^"]*"[^>]*?)src="[^"]*"/,
            `<img$1src="${logoUrl}"`,
          );
        }

        if (cancelled) return;
        setDoc(html);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Erro ao carregar preview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];
    };
  }, [filePath, brandName, primaryColor, logoUrl]);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-card/40"
      style={{ height }}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}
      {error && !loading && (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
          <AlertCircle className="h-5 w-5 text-destructive" />
          {error}
        </div>
      )}
      {doc && (
        <iframe
          title="Preview da Extensão"
          srcDoc={doc}
          sandbox="allow-same-origin allow-scripts"
          className="h-full w-full border-0 bg-white"
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}