import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, FileArchive, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const BUCKET = "extension-builds";
const TEMPLATE_PATH = "templates/master-lovable-base.zip";

type Info = {
  size: number;
  updated_at: string;
} | null;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function BaseExtensionUploader() {
  const [info, setInfo] = useState<Info>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadInfo() {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list("templates", { search: "master-lovable-base.zip", limit: 1 });
      if (error) throw error;
      const f = data?.[0];
      if (f) {
        setInfo({
          size: (f.metadata as any)?.size ?? 0,
          updated_at: f.updated_at ?? f.created_at ?? new Date().toISOString(),
        });
      } else {
        setInfo(null);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInfo();
  }, []);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Envie um arquivo .zip");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("ZIP muito grande (máx 15MB)");
      return;
    }
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(TEMPLATE_PATH, file, { upsert: true, contentType: "application/zip" });
      if (error) throw error;
      toast.success("Extensão base atualizada! Personalizações continuam aplicáveis.");
      await loadInfo();
    } catch (e: any) {
      toast.error(e.message || "Falha no upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card className="p-5 border-primary/30 bg-primary/5">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/15 grid place-items-center text-primary shrink-0">
          <FileArchive className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-base">Extensão Base (Template)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Este é o ZIP de origem que será personalizado para cada revendedor. Substitua quando tiver uma versão atualizada do código da extensão.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {info ? "Substituir ZIP base" : "Enviar ZIP base"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs">
            {loading ? (
              <span className="text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Verificando...
              </span>
            ) : info ? (
              <>
                <span className="flex items-center gap-1 text-emerald-500 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ativo
                </span>
                <span className="text-muted-foreground">
                  {formatBytes(info.size)} • atualizado em{" "}
                  {new Date(info.updated_at).toLocaleString("pt-BR")}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1 text-amber-500 font-medium">
                <AlertCircle className="h-3.5 w-3.5" /> Nenhum ZIP base enviado ainda
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
