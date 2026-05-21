import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  Download,
  FileCheck2,
  Loader2,
  Package,
  X,
  GitCommit,
} from "lucide-react";
import { toast } from "sonner";

type Ext = {
  id: string;
  name: string;
  slug: string;
  version: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  changelog: string | null;
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

const DEFAULT_NAME = "PromptFlow 5.0.2";
const DEFAULT_SLUG = "lovmain-unlimited";
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_LOG_LEN = 5000;

const fmtSize = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const bumpPatch = (v: string) => {
  const parts = v.split(".").map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return "1.0.0";
  parts[2] += 1;
  return parts.join(".");
};

export default function GerenteUploadExtensao() {
  const [ext, setExt] = useState<Ext | null>(null);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<Version[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [logs, setLogs] = useState("");
  const [versionInput, setVersionInput] = useState("1.0.0");
  const [uploading, setUploading] = useState(false);

  const ensureExtension = async (): Promise<Ext | null> => {
    const { data: existing, error } = await supabase
      .from("extensions")
      .select("id,name,slug,version,file_path,file_name,file_size,changelog")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast.error(error.message);
      return null;
    }
    if (existing) return existing as Ext;

    const { data: created, error: cErr } = await supabase
      .from("extensions")
      .insert({ name: DEFAULT_NAME, slug: DEFAULT_SLUG })
      .select("id,name,slug,version,file_path,file_name,file_size,changelog")
      .single();
    if (cErr) {
      toast.error(cErr.message);
      return null;
    }
    return created as Ext;
  };

  const loadVersions = async (extensionId: string) => {
    const { data } = await supabase
      .from("extension_versions")
      .select("id,version,changelog,file_name,file_size,file_path,created_at")
      .eq("extension_id", extensionId)
      .order("created_at", { ascending: false });
    setVersions((data ?? []) as Version[]);
  };

  const load = async () => {
    setLoading(true);
    const e = await ensureExtension();
    if (e) {
      setExt(e);
      setVersionInput(bumpPatch(e.version));
      await loadVersions(e.id);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!ext) return;
    const newVersion = versionInput.trim();
    if (!newVersion) return toast.error("Informe a versão");
    if (!file) return toast.error("Selecione o arquivo da extensão");
    if (file.size > MAX_BYTES) return toast.error("Arquivo excede 100MB");
    if (!logs.trim()) return toast.error("Descreva o que mudou nesta versão");

    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const safeName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/_+/g, "_");
      const path = `${ext.id}/${newVersion}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("extension-files")
        .upload(path, file, {
          upsert: true,
          contentType: file.type || "application/octet-stream",
        });
      if (upErr) throw upErr;

      const { error: vErr } = await supabase.from("extension_versions").insert({
        extension_id: ext.id,
        version: newVersion,
        changelog: logs.trim(),
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        created_by: u.user?.id ?? null,
      });
      if (vErr) throw vErr;

      const { error: updErr } = await supabase
        .from("extensions")
        .update({
          version: newVersion,
          changelog: logs.trim(),
          file_path: path,
          file_name: file.name,
          file_size: file.size,
        })
        .eq("id", ext.id);
      if (updErr) throw updErr;

      toast.success(`Versão ${newVersion} publicada`);
      setFile(null);
      setLogs("");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar");
    } finally {
      setUploading(false);
    }
  };

  const download = async (path: string | null, name: string | null) => {
    if (!path) return;
    const { data, error } = await supabase.storage
      .from("extension-files")
      .download(path);
    if (error || !data) return toast.error(error?.message || "Falha ao baixar");
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = name || "extensao";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Upload de Extensão"
        description="Publique uma nova versão da extensão e registre o changelog. Revendedores e clientes verão o histórico."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        {/* Upload form */}
        <div className="space-y-5 rounded-xl border border-border bg-card/60 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display text-lg font-semibold">{ext?.name}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                Atual: v{ext?.version}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Extensão/Método</Label>
            <Select defaultValue="promptflow">
              <SelectTrigger>
                <SelectValue placeholder="Selecione o método" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="promptflow">Método - PromptFlow</SelectItem>
                <SelectItem value="lovax">Método - LovaX</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-[140px,1fr]">
            <div className="space-y-1.5">
              <Label>Versão</Label>
              <Input
                value={versionInput}
                onChange={(e) => setVersionInput(e.target.value.slice(0, 30))}
                placeholder="1.0.0"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Arquivo da extensão</Label>
              {file ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 p-2.5 text-sm">
                  <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="truncate flex-1" title={file.name}>
                    {file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmtSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground transition-colors hover:border-primary/50">
                  <Upload className="h-4 w-4" />
                  <span>Escolher arquivo (máx 100MB)</span>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      if (!f) return;
                      if (f.size > MAX_BYTES) {
                        toast.error("Arquivo excede 100MB");
                        ev.target.value = "";
                        return;
                      }
                      setFile(f);
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Changelog</Label>
              <span className="text-[10px] text-muted-foreground">
                {logs.length}/{MAX_LOG_LEN}
              </span>
            </div>
            <Textarea
              value={logs}
              onChange={(e) => setLogs(e.target.value.slice(0, MAX_LOG_LEN))}
              rows={7}
              placeholder={"- Corrigido erro X\n- Adicionada função Y\n- Melhoria de performance"}
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Será exibido a revendedores e clientes no histórico.
            </p>
          </div>

          <Button onClick={submit} disabled={uploading} className="w-full">
            {uploading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            Publicar versão
          </Button>
        </div>

        {/* Histórico */}
        <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Histórico</h3>
            <span className="text-[10px] text-muted-foreground">
              {versions.length} versão(ões)
            </span>
          </div>

          {versions.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Nenhuma versão publicada ainda.
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {versions.map((v, i) => (
                <div
                  key={v.id}
                  className="rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <GitCommit className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-sm font-semibold">
                          v{v.version}
                        </span>
                        {i === 0 && (
                          <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                            Atual
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {fmtDate(v.created_at)}
                        </span>
                      </div>
                      {v.changelog && (
                        <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[11px] text-muted-foreground">
                          {v.changelog}
                        </pre>
                      )}
                      {v.file_name && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-6 px-2 text-[11px]"
                          onClick={() => download(v.file_path, v.file_name)}
                        >
                          <Download className="mr-1 h-3 w-3" />
                          {fmtSize(v.file_size)}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
