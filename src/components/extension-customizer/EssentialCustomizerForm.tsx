import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Save,
  Upload,
  X,
  Sparkles,
  Palette,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { ExtensionPreview, type ExtCustomization } from "./ExtensionPreview";
import { extractPaletteFromImage, resizeImageToPng, type Swatch } from "@/lib/color-extract";
import { cn } from "@/lib/utils";
import { getValidAccessToken } from "@/lib/authenticated-functions";

// Fallback fixo da extensão LovaX v5.3
const DEFAULT_EXTENSION_ID = "df1cf674-31d2-4320-b0fc-ceee0b3c840a";

type EssentialData = {
  brand_name: string;
  logo_rect_url: string | null;
  logo_square_url: string | null;
  icon_16_url: string | null;
  icon_32_url: string | null;
  icon_48_url: string | null;
  icon_128_url: string | null;
  color_primary: string;
  support_url: string;
  community_url: string;
};

const DEFAULTS: EssentialData = {
  brand_name: "LovConnect",
  logo_rect_url: null,
  logo_square_url: null,
  icon_16_url: null,
  icon_32_url: null,
  icon_48_url: null,
  icon_128_url: null,
  color_primary: "#ff1010",
  support_url: "",
  community_url: "",
};

const getMethodDefaults = (method?: "flow" | "lovax" | null): EssentialData =>
  method === "lovax"
    ? {
        ...DEFAULTS,
        brand_name: "LovConnect",
        color_primary: "#ff1010",
      }
    : DEFAULTS;

const normalizeMethodData = (
  value: EssentialData,
  method?: "flow" | "lovax" | null,
): EssentialData => {
  if (method !== "lovax") return value;
  return {
    ...value,
    brand_name: value.brand_name || "LovConnect",
    color_primary:
      value.color_primary.toLowerCase() === "#3b82f6" ? "#ff1010" : value.color_primary,
  };
};

type Props = {
  resellerId: string;
  extensionId?: string | null;
  extensionName?: string | null;
  extensionVersion?: string | null;
  extensionMethod?: "flow" | "lovax" | null;
};

export function EssentialCustomizerForm({ resellerId, extensionId, extensionName, extensionVersion, extensionMethod }: Props) {
  const EXTENSION_ID = extensionId || DEFAULT_EXTENSION_ID;
  const activeExtensionMethod: "lovax" = "lovax";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [data, setData] = useState<EssentialData>(getMethodDefaults("lovax"));
  const [palette, setPalette] = useState<Swatch[]>([]);
  const [separateLogos, setSeparateLogos] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resellerId, EXTENSION_ID, extensionMethod]);

  async function load() {
    setLoading(true);
    setRecordId(null);
    const methodDefaults = getMethodDefaults(activeExtensionMethod);
    setData(methodDefaults);
    setPalette([]);
    setSeparateLogos(false);
    try {
      const { data: row } = await supabase
        .from("extension_customizations")
        .select("*")
        .eq("extension_id", EXTENSION_ID)
        .eq("reseller_id", resellerId)
        .eq("is_template", false)
        .maybeSingle();

      if (row) {
        setRecordId(row.id);
        setData(normalizeMethodData({
          brand_name: (row as any).brand_name ?? "",
          logo_rect_url: (row as any).logo_rect_url ?? null,
          logo_square_url: (row as any).logo_square_url ?? null,
          icon_16_url: (row as any).icon_16_url ?? null,
          icon_32_url: (row as any).icon_32_url ?? null,
          icon_48_url: (row as any).icon_48_url ?? null,
          icon_128_url: (row as any).icon_128_url ?? null,
          color_primary: (row as any).color_primary ?? "#3b82f6",
          support_url: (row as any).support_url ?? "",
          community_url: (row as any).community_url ?? "",
        }, activeExtensionMethod));
        const hasSeparate =
          !!(row as any).logo_rect_url &&
          !!(row as any).logo_square_url &&
          (row as any).logo_rect_url !== (row as any).logo_square_url;
        setSeparateLogos(hasSeparate);

        // Extrai paleta da logo existente
        const logoForPalette =
          (row as any).logo_square_url ?? (row as any).logo_rect_url;
        if (logoForPalette) {
          try {
            const sw = await extractPaletteFromImage(logoForPalette);
            setPalette(sw);
          } catch {
            // silencioso — cross-origin pode falhar
          }
        }
      } else {
        // Tenta carregar template do gerente como base
        const { data: tpl } = await supabase
          .from("extension_customizations")
          .select("brand_name,color_primary,support_url,community_url")
          .eq("extension_id", EXTENSION_ID)
          .eq("is_template", true)
          .maybeSingle();
        if (tpl) {
          setData((d) => normalizeMethodData({
            ...d,
            brand_name: (tpl as any).brand_name ?? d.brand_name,
            color_primary: (tpl as any).color_primary ?? d.color_primary,
            support_url: (tpl as any).support_url ?? d.support_url,
            community_url: (tpl as any).community_url ?? d.community_url,
          }, activeExtensionMethod));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof EssentialData>(k: K, v: EssentialData[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  async function ensureRecord(): Promise<string | null> {
    if (recordId) return recordId;
    const { data: ins, error } = await supabase
      .from("extension_customizations")
      .insert({
        extension_id: EXTENSION_ID,
        reseller_id: resellerId,
        is_template: false,
        brand_name: data.brand_name || "Extensão",
        color_primary: data.color_primary,
      } as any)
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    setRecordId(ins.id);
    return ins.id;
  }

  async function handleLogoUpload(
    field: "logo_rect_url" | "logo_square_url",
    file: File,
    alsoApplyTo?: "logo_rect_url" | "logo_square_url",
    generateIcons?: boolean,
  ) {
    // Validação — até 10MB (redimensionamos ao gerar ícones)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Logo deve ter no máximo 10MB");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Formato inválido (PNG, JPG, SVG ou WEBP)");
      return;
    }

    const id = await ensureRecord();
    if (!id) return;

    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `${field}-${Date.now()}.${ext}`;
      const path = `reseller/${id}/${fileName}`;
      const { error: upErr } = await supabase.storage
        .from("extension-customizations")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("extension-customizations")
        .getPublicUrl(path);

      update(field, pub.publicUrl);
      if (alsoApplyTo) update(alsoApplyTo, pub.publicUrl);

      // Gera ícones 16/32/48/128 automaticamente quando logo única
      if (generateIcons && file.type !== "image/svg+xml") {
        try {
          const sizes = [16, 32, 48, 128] as const;
          const results = await Promise.all(
            sizes.map(async (s) => {
              const blob = await resizeImageToPng(file, s);
              const iconPath = `reseller/${id}/icon-${s}-${Date.now()}.png`;
              const { error: iErr } = await supabase.storage
                .from("extension-customizations")
                .upload(iconPath, blob, { upsert: true, contentType: "image/png" });
              if (iErr) throw iErr;
              const { data: iPub } = supabase.storage
                .from("extension-customizations")
                .getPublicUrl(iconPath);
              return [s, iPub.publicUrl] as const;
            }),
          );
          for (const [s, url] of results) {
            update(`icon_${s}_url` as keyof EssentialData, url as any);
          }
          toast.success(
            "Ícones 16/32/48/128 gerados automaticamente a partir da logo",
          );
        } catch (err: any) {
          toast.error(
            `Logo enviada, mas falhou ao gerar ícones: ${err?.message || "erro"}`,
          );
        }
      }

      // Extrai paleta automaticamente
      try {
        const sw = await extractPaletteFromImage(file);
        setPalette(sw);
        if (sw.length > 0) {
          update("color_primary", sw[0].hex);
          toast.success("Logo enviada — cor primária sugerida da logo");
        } else {
          toast.success("Logo enviada");
        }
      } catch {
        toast.success("Logo enviada");
      }
    } catch (e: any) {
      toast.error(e.message || "Falha no upload");
    }
  }

  async function handleSave() {
    if (!data.brand_name.trim()) {
      toast.error("Informe o nome da marca");
      return;
    }
    setSaving(true);
    try {
      const id = await ensureRecord();
      if (!id) return;
      const brand = data.brand_name.trim();
      const version = (extensionVersion || "5.3").replace(/^v/i, "");
      // Derive hover color (slightly darker variant of primary)
      const primaryHover = (() => {
        const m = /^#?([0-9a-f]{6})$/i.exec(data.color_primary.replace("#", ""));
        if (!m) return data.color_primary;
        const n = parseInt(m[1], 16);
        const r = Math.max(0, ((n >> 16) & 0xff) - 24);
        const g = Math.max(0, ((n >> 8) & 0xff) - 24);
        const b = Math.max(0, (n & 0xff) - 24);
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
      })();
      const payload = {
        brand_name: brand,
        logo_rect_url: data.logo_rect_url,
        logo_square_url: data.logo_square_url,
        icon_16_url: data.icon_16_url,
        icon_32_url: data.icon_32_url,
        icon_48_url: data.icon_48_url,
        icon_128_url: data.icon_128_url,
        color_primary: data.color_primary,
        color_primary_hover: primaryHover,
        support_url: data.support_url.trim() || null,
        community_url: data.community_url.trim() || null,
        // Sync derived/legacy fields so the ZIP builder has them
        manifest_name: brand,
        manifest_description: `Extensão ${brand}`,
        window_title: `${brand} - Painel Lateral`,
        display_version: version,
        brand_kicker: "",
        brand_badge: "PRO",
        header_badge_text: "PRO",
        greeting_badge_text: "PRO",
        footer_text: `Desenvolvido por ${brand}`,
        greeting_text: "Olá, Cliente",
        use_license_name: true,
        currency_symbol: "MZN",
        show_greeting_badge: true,
      };
      const { error } = await supabase
        .from("extension_customizations")
        .update(payload as any)
        .eq("id", id);
      if (error) throw error;
      toast.success("Personalização salva!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadZip() {
    if (!EXTENSION_ID) {
      toast.error("Extensão não identificada");
      return;
    }
    setDownloadingZip(true);
    try {
      const token = await getValidAccessToken();
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extension-build-zip`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ extension_id: EXTENSION_ID }),
      });
      if (!res.ok) {
        const body = await res.text();
        let msg = body;
        try {
          const parsed = JSON.parse(body);
          msg = parsed.error || parsed.message || body;
        } catch {
          /* usar texto raw */
        }
        throw new Error(msg || "Erro ao gerar extensão personalizada");
      }
      const blob = await res.blob();
      const fileName = `${data.brand_name.replace(/[^a-z0-9]+/gi, "_") || "Extensao"}_v${extensionVersion || "5.3"}.zip`;
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      toast.success("Download da extensão personalizada iniciado!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao baixar extensão personalizada");
    } finally {
      setDownloadingZip(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const brandName = data.brand_name.trim() || "LovConnect";
  const version = (extensionVersion || "5.3").replace(/^v/i, "");
  const primary = data.color_primary || "#ff1010";
  const previewData: ExtCustomization = {
    brand_kicker: "",
    brand_name: brandName,
    brand_badge: "PRO",
    header_badge_text: "PRO",
    greeting_badge_text: "PRO",
    display_version: version,
    window_title: `${brandName} - Painel Lateral`,
    manifest_name: brandName,
    manifest_description: "Extensão LovaX",
    support_url: data.support_url,
    color_primary: primary.toLowerCase() === "#3b82f6" ? "#ff1010" : primary,
    color_primary_hover: primary.toLowerCase() === "#3b82f6" ? "#d90000" : primary,
    color_secondary: "#ff3b30",
    color_bg: "#070707",
    color_bg_elevated: "#141416",
    color_bg_surface: "#1b1b1f",
    color_success: "#20e6a0",
    logo_rect_url: data.logo_rect_url,
    logo_square_url: data.logo_square_url,
    icon_16_url: data.icon_16_url,
    icon_32_url: data.icon_32_url,
    icon_48_url: data.icon_48_url,
    icon_128_url: data.icon_128_url,
    greeting_text: "Cliente",
    use_license_name: true,
    currency_symbol: "MZN",
    footer_text: `Desenvolvido por ${brandName}`,
    show_greeting_badge: true,
    shortcuts: [
      { label: "Corrigir Bug", prompt: "Corrija bugs no projeto." },
      { label: "Refatorar", prompt: "Refatore o código mantendo o comportamento." },
      { label: "Melhorar UI", prompt: "Melhore a interface do usuário." },
      { label: "Explicar Código", prompt: "Explique este código." },
      { label: "Otimizar", prompt: "Otimize performance e legibilidade." },
      { label: "Segurança", prompt: "Revise problemas de segurança." },
      { label: "Criar Teste", prompt: "Crie testes para este fluxo." },
      { label: "Responsividade", prompt: "Ajuste a responsividade da interface." },
    ],
    license_title: `Bem-vindo a ${brandName}`,
    license_description: "Insira sua chave de licença para desbloquear.",
    license_placeholder: "TS-XXXXXXXXXXXXXXXXXXXXXX",
    license_button_text: "Validar Licença",
    license_buy_button_text: "",
    license_extra_buttons: [],
    license_emoji: "🔑",
    license_emoji_size: 64,
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="border-border bg-card/50 p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold">
              Personalizar Minha Extensão
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure marca, logo, cor e contato. As mudanças aparecem
              automaticamente para seus clientes ativos.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Nome */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-semibold">Nome da marca *</Label>
            <Input
              value={data.brand_name}
              onChange={(e) => update("brand_name", e.target.value)}
              placeholder="Ex: Minha Empresa"
              maxLength={50}
            />
          </div>

          {/* Logo */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Logo</Label>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>Enviar separado</span>
                <Switch
                  checked={separateLogos}
                  onCheckedChange={setSeparateLogos}
                />
              </div>
            </div>

            {!separateLogos ? (
              <>
                <LogoSlot
                  label="Logo única (gera retangular, quadrada e ícones)"
                  url={data.logo_rect_url}
                  onUpload={(f) =>
                    handleLogoUpload("logo_rect_url", f, "logo_square_url", true)
                  }
                  onClear={() => {
                    update("logo_rect_url", null);
                    update("logo_square_url", null);
                    update("icon_16_url", null);
                    update("icon_32_url", null);
                    update("icon_48_url", null);
                    update("icon_128_url", null);
                  }}
                />
                <p className="rounded-md border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-[10px] text-muted-foreground">
                  Geramos automaticamente os ícones do Chrome (16, 32, 48 e
                  128). Se vazio, usamos a logo padrão.
                </p>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <LogoSlot
                  label="Logo retangular"
                  url={data.logo_rect_url}
                  onUpload={(f) => handleLogoUpload("logo_rect_url", f)}
                  onClear={() => update("logo_rect_url", null)}
                />
                <LogoSlot
                  label="Ícone quadrado"
                  url={data.logo_square_url}
                  onUpload={(f) => handleLogoUpload("logo_square_url", f)}
                  onClear={() => update("logo_square_url", null)}
                />
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              PNG, JPG, SVG ou WEBP — máx 10MB
            </p>
          </div>

          {/* Cor primária */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="flex items-center gap-1.5 text-xs font-semibold">
              <Palette className="h-3 w-3" />
              Cor primária
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={data.color_primary}
                onChange={(e) => update("color_primary", e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
              />
              <Input
                value={data.color_primary}
                onChange={(e) => update("color_primary", e.target.value)}
                className="font-mono text-xs"
                maxLength={9}
              />
            </div>
            {palette.length > 0 && (
              <div className="mt-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sugeridas da sua logo
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {palette.map((s) => (
                    <button
                      key={s.hex}
                      type="button"
                      onClick={() => update("color_primary", s.hex)}
                      className={cn(
                        "h-8 w-8 rounded-md border-2 transition-transform hover:scale-110",
                        data.color_primary.toLowerCase() === s.hex.toLowerCase()
                          ? "border-foreground"
                          : "border-transparent",
                      )}
                      style={{ background: s.hex }}
                      title={s.hex}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              WhatsApp / Suporte
            </Label>
            <Input
              value={data.support_url}
              onChange={(e) => update("support_url", e.target.value)}
              placeholder="https://wa.me/55..."
              maxLength={200}
            />
          </div>

          {/* Community */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Comunidade / Grupo do WhatsApp
            </Label>
            <Input
              value={data.community_url}
              onChange={(e) => update("community_url", e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              maxLength={200}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadZip}
            disabled={downloadingZip}
          >
            {downloadingZip ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Baixar extensão alterada
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar personalização
          </Button>
        </div>
      </Card>
      <div className="space-y-3 xl:sticky xl:top-8 xl:self-start">
        <div className="px-1 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
          Visualização LovaX
        </div>
        <ExtensionPreview c={previewData} mode="sidebar" extensionMethod={activeExtensionMethod} />
      </div>
    </div>
  );
}

function LogoSlot({
  label,
  url,
  onUpload,
  onClear,
}: {
  label: string;
  url: string | null;
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {url ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-foreground">{label}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {url ? url.split("/").pop() : "Nenhuma imagem"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
          {url && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={onClear}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}