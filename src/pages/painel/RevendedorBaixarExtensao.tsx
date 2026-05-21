import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Download,
  Package,
  Loader2,
  History,
  GitCommit,
  FileCheck2,
  Share2,
} from "lucide-react";
import { toast } from "sonner";

type ExtRow = {
  id: string;
  name: string;
  slug: string;
  version: string;
  description: string | null;
  changelog: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  updated_at: string;
};

type Version = {
  id: string;
  version: string;
  changelog: string | null;
  file_name: string | null;
  file_size: number | null;
  file_path: string | null;
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

export default function RevendedorBaixarExtensao() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ExtRow[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<ExtRow | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      
      const { data: extRes } = await supabase
        .from("extensions")
        .select("id,name,slug,version,description,changelog,file_path,file_name,file_size,updated_at")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (cancelled) return;
      if (extRes) {
        setItems(extRes as ExtRow[]);
      }
      
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleDownload = async (path: string | null, name: string | null, id?: string) => {
    if (!path) {
      toast.error("Arquivo ainda não disponível.");
      return;
    }
    if (id) setDownloadingId(id);
    try {
      const { data, error } = await supabase.storage
        .from("extension-files")
        .download(path);
      if (error || !data) throw error ?? new Error("Falha ao baixar");
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name || "extensao";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Download iniciado");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao baixar arquivo");
    } finally {
      if (id) setDownloadingId(null);
    }
  };

  const openHistory = async (e: ExtRow) => {
    setHistoryTarget(e);
    setHistoryOpen(true);
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("extension_versions")
      .select("id,version,changelog,file_name,file_size,file_path,created_at")
      .eq("extension_id", e.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setVersions((data ?? []) as Version[]);
    setHistoryLoading(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Download das Extensões"
        description="Acesse as versões oficiais das extensões disponíveis."
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Nenhuma extensão disponível para download.
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">Todas as Extensões</h2>
          <div className="flex flex-col gap-2">
            {items.map((e) => {
              const has = !!e.file_path;
              return (
                <div
                  key={e.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Package className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-semibold leading-tight truncate">
                        {e.name}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        v{e.version} · {fmtSize(e.file_size)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Última atualização: {fmtDate(e.updated_at)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openHistory(e)}
                      className="h-9 px-3"
                    >
                      <History className="mr-1.5 h-4 w-4" />
                      ChangeLog
                    </Button>
                    <Button
                      size="sm"
                      disabled={!has || downloadingId === e.id}
                      onClick={() => handleDownload(e.file_path, e.file_name, e.id)}
                      variant="secondary"
                      className="h-9 px-3"
                    >
                      {downloadingId === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-3"
                      onClick={() => {
                        const url = `${window.location.origin}/extensao/${e.slug}`;
                        navigator.clipboard.writeText(url).then(
                          () => toast.success("Link copiado!"),
                          () => toast.error("Não foi possível copiar"),
                        );
                      }}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-card border-border sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico — {historyTarget?.name}</DialogTitle>
            <DialogDescription>
              Veja todas as versões publicadas e o que mudou em cada uma.
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : versions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Nenhuma versão publicada ainda.
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {versions.map((v, i) => (
                <div
                  key={v.id}
                  className="rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <GitCommit className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          v{v.version}
                        </span>
                        {i === 0 && (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Atual
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {fmtDate(v.created_at)}
                        </span>
                      </div>
                      {v.changelog && (
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                          {v.changelog}
                        </pre>
                      )}
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Última atualização: {fmtDate(v.created_at)}
                      </div>
                      {v.file_name && i === 0 && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <FileCheck2 className="h-3 w-3" />
                          <span className="truncate">{v.file_name}</span>
                          <span>· {fmtSize(v.file_size)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="ml-auto h-6 px-2"
                            onClick={() => handleDownload(v.file_path, v.file_name)}
                          >
                            <Download className="mr-1 h-3 w-3" />
                            Baixar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
