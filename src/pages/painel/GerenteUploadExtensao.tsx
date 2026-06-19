import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { sanitizeRichText } from "@/lib/sanitize-html";
import {
  Upload,
  Download,
  FileCheck2,
  Loader2,
  Package,
  X,
  GitCommit,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import * as tus from "tus-js-client";

type Ext = {
  id: string;
  name: string;
  slug: string;
  version: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  changelog: string | null;
  method: "flow" | "lovax" | null;
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

type Method = "flow" | "lovax";
const METHOD_DEFAULTS: Record<Method, { name: string; slug: string }> = {
  flow: { name: "PromptFlow", slug: "extensao-flow" },
  lovax: { name: "LovaX", slug: "extensao-lovax" },
};
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

const METHOD_STORAGE_KEY = "licencas.delivery.method";
const SETTING_KEY = "licencas.delivery.method";

const normalizeMethod = (value: unknown): Method | null => {
  const raw = typeof value === "object" && value !== null && "method" in value
    ? (value as { method?: unknown }).method
    : value;
  if (raw === "flow" || raw === "promptflow") return "flow";
  if (raw === "lovax") return "lovax";
  return null;
};

const methodLabel = (m: Method) => (m === "flow" ? "MétodoFlow" : "MétodoLovax");

export default function GerenteUploadExtensao() {
  const [method, setMethodState] = useState<Method>("flow");
  const [ext, setExt] = useState<Ext | null>(null);
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState<Version[]>([]);

  const [file, setFile] = useState<File | null>(null);
  const [logs, setLogs] = useState("");
  const [versionInput, setVersionInput] = useState("1.0.0");
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (v: Version) => {
    setEditingId(v.id);
    setEditingValue(v.changelog ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const saveEdit = async (v: Version) => {
    if (!ext) return;
    const value = editingValue.trim();
    if (!value) return toast.error("A descrição não pode ficar vazia");
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("extension_versions")
        .update({ changelog: value })
        .eq("id", v.id);
      if (error) throw error;
      // Se for a versão atual, espelha em extensions.changelog
      if (ext.version === v.version) {
        await supabase.from("extensions").update({ changelog: value }).eq("id", ext.id);
      }
      toast.success("Descrição atualizada");
      cancelEdit();
      await loadVersions(ext.id);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar");
    } finally {
      setSavingEdit(false);
    }
  };

  const removeVersion = async (v: Version) => {
    if (!ext) return;
    if (!window.confirm(`Excluir a versão v${v.version} do histórico? Esta ação não pode ser desfeita.`)) return;
    try {
      const { error } = await supabase.from("extension_versions").delete().eq("id", v.id);
      if (error) throw error;
      if (v.file_path) {
        await supabase.storage.from("extension-files").remove([v.file_path]);
      }
      toast.success("Versão removida");
      await loadVersions(ext.id);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir");
    }
  };

  const ensureExtension = async (m: Method): Promise<Ext | null> => {
    const { data: byMethod } = await supabase
      .from("extensions")
      .select("id,name,slug,version,file_path,file_name,file_size,changelog,method")
      .eq("method", m)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (byMethod) return byMethod as Ext;

    // Backfill: if there's a legacy extension without method, claim it for "flow".
    if (m === "flow") {
      const { data: legacy } = await supabase
        .from("extensions")
        .select("id,name,slug,version,file_path,file_name,file_size,changelog,method")
        .is("method", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (legacy) {
        await supabase.from("extensions").update({ method: "flow" }).eq("id", (legacy as any).id);
        return { ...(legacy as any), method: "flow" } as Ext;
      }
    }

    const def = METHOD_DEFAULTS[m];
    // Make slug unique if needed
    let slug = def.slug;
    let i = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: clash } = await supabase
        .from("extensions")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!clash) break;
      i += 1;
      slug = `${def.slug}-${i}`;
    }

    const { data: created, error: cErr } = await supabase
      .from("extensions")
      .insert({ name: def.name, slug, method: m })
      .select("id,name,slug,version,file_path,file_name,file_size,changelog,method")
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

  const getActiveMethod = async (): Promise<Method> => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    const active = normalizeMethod(data?.value);
    if (active) {
      try {
        window.localStorage.setItem(METHOD_STORAGE_KEY, active);
      } catch {}
      return active;
    }

    const saved = typeof window !== "undefined" ? normalizeMethod(window.localStorage.getItem(METHOD_STORAGE_KEY)) : null;
    return saved ?? "flow";
  };

  const load = async () => {
    setLoading(true);
    const activeMethod = await getActiveMethod();
    setMethodState(activeMethod);
    const e = await ensureExtension(activeMethod);
    if (e) {
      setExt(e);
      setVersionInput(bumpPatch(e.version));
      await loadVersions(e.id);
    } else {
      setExt(null);
      setVersions([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Use TUS resumable upload — more reliable for files > 6MB and survives
      // CORS/timeout quirks that break a single multipart POST.
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) throw new Error("Sessão expirada, faça login novamente");
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const anonKey = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;
      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          headers: {
            authorization: `Bearer ${accessToken}`,
            apikey: anonKey,
            "x-upsert": "true",
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          chunkSize: 6 * 1024 * 1024,
          metadata: {
            bucketName: "extension-files",
            objectName: path,
            contentType: file.type || "application/octet-stream",
            cacheControl: "3600",
          },
          onError: (err) => reject(err),
          onSuccess: () => resolve(),
        });
        upload.findPreviousUploads().then((prev) => {
          if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0]);
          upload.start();
        });
      });

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
              <div className="font-display text-lg font-semibold">LovConnect {ext?.version}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                Atual: v{ext?.version}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Método ativo</Label>
            <div className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2 text-sm">
              <span className="font-medium">{methodLabel(method)}</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Ativo
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              O upload será publicado automaticamente para o método de entrega ativo no sistema.
            </p>
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
            <RichTextEditor
              value={logs}
              onChange={setLogs}
              maxLength={MAX_LOG_LEN}
              placeholder="Descreva o que mudou nesta versão..."
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
                        editingId === v.id ? (
                          <div className="mt-2 space-y-2">
                            <RichTextEditor
                              value={editingValue}
                              onChange={setEditingValue}
                              maxLength={MAX_LOG_LEN}
                              placeholder="Descreva o que mudou..."
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => saveEdit(v)}
                                disabled={savingEdit}
                              >
                                {savingEdit ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="mr-1 h-3 w-3" />
                                )}
                                Salvar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-[11px]"
                                onClick={cancelEdit}
                                disabled={savingEdit}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="prose-sm mt-1.5 max-w-none whitespace-pre-wrap text-[11px] text-muted-foreground [&_ol]:ml-4 [&_ol]:list-decimal [&_ul]:ml-4 [&_ul]:list-disc"
                            dangerouslySetInnerHTML={{ __html: sanitizeRichText(v.changelog) }}
                          />
                        )
                      )}
                      {v.file_name && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => download(v.file_path, v.file_name)}
                          >
                            <Download className="mr-1 h-3 w-3" />
                            {fmtSize(v.file_size)}
                          </Button>
                          {editingId !== v.id && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={() => startEdit(v)}
                              >
                                <Pencil className="mr-1 h-3 w-3" />
                                Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                                onClick={() => removeVersion(v)}
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Excluir
                              </Button>
                            </>
                          )}
                        </div>
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
