import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { sanitizeRichText } from "@/lib/sanitize-html";
import {
  Package,
  Loader2,
  GitCommit,
  FileText,
  Download,
  ShieldCheck,
  Sparkles,
  Clock,
  HardDrive,
  Chrome,
  Check,
  Lightbulb,
  MousePointerClick,
  Puzzle,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

type Ext = {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string | null;
  changelog: string | null;
  file_size: number | null;
  updated_at: string;
};

type Version = {
  id: string;
  version: string;
  changelog: string | null;
  created_at: string;
};

const fmtSize = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const RECOMMENDATIONS = [
  {
    icon: Chrome,
    title: "Use no Google Chrome",
    desc: "A extensão é otimizada para Chrome (e navegadores baseados em Chromium como Edge e Brave).",
  },
  {
    icon: Puzzle,
    title: "Modo desenvolvedor ativado",
    desc: "Acesse chrome://extensions, ative o Modo desenvolvedor e arraste o arquivo .zip ou .crx.",
  },
  {
    icon: KeyRound,
    title: "Tenha sua licença em mãos",
    desc: "Após instalar, abra a extensão e cole sua chave de licença para liberar todos os recursos.",
  },
  {
    icon: MousePointerClick,
    title: "Fixe na barra de ferramentas",
    desc: "Clique no ícone de quebra-cabeça do Chrome e fixe a extensão para acesso rápido.",
  },
];

export default function PublicExtension({ slug: slugProp }: { slug?: string } = {}) {
  const params = useParams();
  const slug = slugProp ?? params.slug;
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [ext, setExt] = useState<Ext | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      setLoading(true);
      const { data: e } = await supabase
        .from("extensions")
        .select("id,name,slug,version,description,changelog,file_size,updated_at")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (e) {
        setExt(e as Ext);
        const { data: v } = await supabase
          .from("extension_versions")
          .select("id,version,changelog,created_at")
          .eq("extension_id", e.id)
          .order("created_at", { ascending: false });
        setVersions((v ?? []) as Version[]);
      }
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    if (ext) document.title = `${ext.name} — Extensão`;
  }, [ext]);

  const handleDownload = async () => {
    if (!slug) return;
    setDownloading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Faça login para baixar a extensão.");
        setDownloading(false);
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-extension-download?slug=${encodeURIComponent(slug)}`;
      const res = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || "Falha ao gerar link");

      const a = document.createElement("a");
      a.href = json.url;
      a.rel = "noopener";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Download iniciado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao baixar");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!ext) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold">Extensão não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Esta extensão não existe ou está desativada.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Grid background — same as LP */}
      <div className="pointer-events-none fixed inset-0 bg-grid bg-grid-fade" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />

      {/* Red ambient glow */}
      <div className="pointer-events-none fixed left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-32 pt-12 sm:px-6 sm:pb-20 sm:pt-20">
        {/* HERO */}
        <section className="text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-red rounded-full bg-primary" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <Sparkles className="h-3 w-3" />
            Extensão oficial · v{ext.version}
          </div>

          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tighter md:text-6xl lg:text-7xl">
            <span className="text-gradient-red">{ext.name}</span>
          </h1>

          {ext.description && (
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
              {ext.description}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-mono">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              v{ext.version}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <HardDrive className="h-3.5 w-3.5" />
              {fmtSize(ext.file_size)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Atualizada em {fmtDate(ext.updated_at)}
            </span>
          </div>

          {/* CTA */}
          <div className="mt-10 hidden flex-col items-center justify-center gap-4 sm:flex sm:flex-row">
            <Button
              size="lg"
              onClick={handleDownload}
              disabled={downloading}
              className="h-14 bg-primary px-8 text-base font-semibold text-primary-foreground shadow-red hover:bg-primary/90"
            >
              {downloading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Download className="mr-2 h-5 w-5" />
              )}
              Baixar v{ext.version}
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-primary" /> Download verificado
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-primary" /> Sem instalador
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-primary" /> Atualizações automáticas
            </div>
          </div>

          {/* Terminal mockup */}
          <div className="mx-auto mt-16 max-w-3xl text-left">
            <div className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-red-sm backdrop-blur-md">
              <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                <div className="h-3 w-3 rounded-full bg-primary" />
                <span className="ml-3 font-mono text-xs text-muted-foreground">
                  {ext.slug} ~ ready
                </span>
              </div>
              <div className="space-y-2 p-6 font-mono text-sm">
                <div className="text-muted-foreground">
                  <span className="text-primary">$</span> install {ext.slug}
                </div>
                <div className="text-foreground">
                  ✓ Pacote: <span className="text-primary">{fmtSize(ext.file_size)}</span>
                </div>
                <div className="text-foreground">
                  ✓ Versão: <span className="text-primary">v{ext.version}</span>
                </div>
                <div className="text-foreground">
                  ✓ Status: <span className="text-primary">pronto para instalar</span>
                </div>
                <div className="text-muted-foreground">
                  <span className="text-primary">$</span>{" "}
                  <span className="animate-pulse">▊</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RECOMENDAÇÃO DE USO */}
        <section className="mt-20">
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <Lightbulb className="h-3 w-3 text-primary" />
              Recomendação de uso
            </div>
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Como tirar o <span className="text-primary">máximo</span> proveito
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
              Siga estes passos para garantir uma instalação rápida e o melhor desempenho.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2">
            {RECOMMENDATIONS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group relative bg-card p-6 transition-colors hover:bg-secondary"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-red-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1.5 font-display text-base font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CHANGELOG */}
        <section className="mt-20 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-md sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold sm:text-2xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </span>
              Changelog
            </h2>
            <span className="rounded-full border border-border bg-background/50 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {versions.length} {versions.length === 1 ? "versão" : "versões"}
            </span>
          </div>

          {versions.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">
              Nenhuma versão publicada ainda.
            </p>
          ) : (
            <ol className="relative mt-6 space-y-6 border-l border-border/60 pl-5 sm:pl-6">
              {versions.map((v, i) => (
                <li key={v.id} className="relative">
                  <span className="absolute -left-[26px] flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow-red-sm sm:-left-[30px]">
                    <GitCommit className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">v{v.version}</span>
                    {i === 0 && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Atual
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {fmtDate(v.created_at)}
                    </span>
                  </div>
                  {v.changelog && (
                    <div
                      className="prose-sm mt-2 max-w-none whitespace-pre-wrap rounded-lg border border-border/40 bg-background/40 p-3 text-xs leading-relaxed text-muted-foreground [&_ol]:ml-4 [&_ol]:list-decimal [&_ul]:ml-4 [&_ul]:list-disc"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(v.changelog) }}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* CTA final */}
        <section className="mt-12">
          <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-card p-8 text-center shadow-red md:p-12">
            <div className="absolute inset-0 bg-grid opacity-30" />
            <div className="absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/40 blur-3xl" />
            <div className="relative">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-mono uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" />
                Pronto para instalar
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
                Baixe a <span className="text-gradient-red">{ext.name}</span> agora
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                Versão mais recente, pacote leve e instalação em segundos.
              </p>
              <Button
                size="lg"
                onClick={handleDownload}
                disabled={downloading}
                className="mt-8 h-14 bg-primary px-10 text-base font-semibold text-primary-foreground shadow-red hover:bg-primary/90"
              >
                {downloading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Download className="mr-2 h-5 w-5" />
                )}
                Baixar v{ext.version} · {fmtSize(ext.file_size)}
              </Button>
              <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Download seguro e verificado
              </div>
            </div>
          </div>
        </section>

        <p className="mt-10 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-3 w-3 text-primary" />
          Arquivo distribuído oficialmente. Link válido por tempo limitado a cada clique.
        </p>
      </div>

      {/* Mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:hidden">
        <Button
          size="lg"
          onClick={handleDownload}
          disabled={downloading}
          className="h-12 w-full bg-primary text-base font-semibold text-primary-foreground shadow-red hover:bg-primary/90"
        >
          {downloading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Download className="mr-2 h-5 w-5" />
          )}
          Baixar v{ext.version} · {fmtSize(ext.file_size)}
        </Button>
      </div>
    </div>
  );
}
