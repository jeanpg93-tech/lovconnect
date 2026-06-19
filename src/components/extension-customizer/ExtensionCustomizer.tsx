import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  Loader2, Save, Download, RotateCcw, 
  ChevronRight, ChevronLeft, Layout, Palette, Image as ImageIcon, 
  Type, MousePointer2, Upload, KeyRound
} from "lucide-react";
import { toast } from "sonner";
import { ExtensionPreview, type ExtCustomization } from "./ExtensionPreview";
import { cn } from "@/lib/utils";

const DEFAULT_EXTENSION_ID = "ce171e28-cab8-490f-b50f-381aa975918e";

const DEFAULTS: ExtCustomization = {
  brand_kicker: "Master",
  brand_name: "Lovable",
  brand_badge: "PRO",
  display_version: "v4.3",
  window_title: "Master Lovable - Painel Lateral",
  manifest_name: "Master Lovable",
  manifest_description: "Extensão premium com validação de licença, modo plano e automação inteligente.",
  support_url: "https://wa.me/5511939110427",
  greeting_text: "Olá, Cliente",
  use_license_name: true,
  currency_symbol: "MZN",
  footer_text: "Desenvolvido em Moçambique",
  show_greeting_badge: true,
  header_badge_text: "PRO",
  greeting_badge_text: "PRO",
  color_primary: "#3b82f6",
  color_primary_hover: "#2563eb",
  color_secondary: "#a78bfa",
  color_bg: "#0a0a0b",
  color_bg_elevated: "#111113",
  color_bg_surface: "#18181b",
  color_success: "#34d399",
  card_border_color: "rgba(255,255,255,0.06)",
  card_border_hover_color: "rgba(255,255,255,0.12)",
  card_bg_color: "#18181b",
  card_text_color: "#f4f4f5",
  card_muted_text_color: "#a1a1aa",
  color_wave_deep: "#041436",
  color_wave_navy: "#06205f",
  color_wave_blue: "#0b63ce",
  color_wave_azure: "#168cff",
  color_wave_cyan: "#4ddfff",
  color_wave_ice: "#f8fbff",
  banner_enabled: false,
  banner_url: null,
  banner_link: "",
  history_enabled: true,
  shortcuts: [
    { label: "Bugs", prompt: "Analise o código e identifique bugs." },
    { label: "Refatorar", prompt: "Refatore o sistema." },
    { label: "Erros", prompt: "Implemente tratamento de erros." },
    { label: "Otimizar", prompt: "Otimize a performance." },
    { label: "Comentários", prompt: "Adicione comentários." },
    { label: "SEO", prompt: "Melhore o SEO." },
    { label: "UI", prompt: "Melhore a interface." },
    { label: "Componentes", prompt: "Separe em componentes." },
    { label: "Review", prompt: "Faça uma revisão completa." },
  ],
  license_title: "Ativar Licença",
  license_description: "Insira sua chave de licença para desbloquear.",
  license_placeholder: "QL-XXXXXXXXXXXXXXXXXXXX",
  license_button_text: "Validar Licença",
  license_buy_button_text: "",
  license_extra_buttons: [],
  license_emoji: "🔑",
  license_emoji_size: 64,
};

type Props = {
  scope: "template" | "reseller";
  resellerId?: string | null;
  extensionId?: string | null;
  extensionName?: string | null;
  extensionVersion?: string | null;
  extensionMethod?: "flow" | "lovax" | null;
};

function getExtensionDefaults(
  extensionName?: string | null,
  extensionVersion?: string | null,
  extensionMethod?: "flow" | "lovax" | null,
): ExtCustomization {
  const name = extensionName?.trim();
  if (!name) return DEFAULTS;

  if (extensionMethod === "lovax") {
    return {
      ...DEFAULTS,
      brand_kicker: "",
      brand_name: "LovConnect",
      brand_badge: "PRO",
      header_badge_text: "PRO",
      greeting_badge_text: "PRO",
      manifest_name: name,
      window_title: `${name} - Painel Lateral`,
      display_version: extensionVersion || DEFAULTS.display_version,
      color_primary: "#ff1010",
      color_primary_hover: "#d90000",
      color_secondary: "#ff3b30",
      color_bg: "#070707",
      color_bg_elevated: "#141416",
      color_bg_surface: "#1b1b1f",
      color_success: "#20e6a0",
      license_title: "Bem vindo a TS Community",
      license_description: "Insira sua chave de licença para desbloquear.",
      license_placeholder: "TS-XXXXXXXXXXXXXXXXXXXXXX",
      license_button_text: "Validar Licença",
      footer_text: "Desenvolvido por LovConnect",
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
    };
  }

  return {
    ...DEFAULTS,
    brand_kicker: name.toLowerCase().includes("lovax") ? "LovaX" : DEFAULTS.brand_kicker,
    brand_name: name,
    manifest_name: name,
    window_title: `${name} - Painel Lateral`,
    display_version: extensionVersion || DEFAULTS.display_version,
  };
}

function normalizeLovaxCustomization<T extends Partial<ExtCustomization>>(value: T, defaults: ExtCustomization, method?: "flow" | "lovax" | null): T {
  if (method !== "lovax") return value;
  const oldFlowBlue = String(value.color_primary ?? "").toLowerCase() === "#3b82f6";
  const oldFlowSecondary = String(value.color_secondary ?? "").toLowerCase() === "#a78bfa";
  return {
    ...value,
    color_primary: oldFlowBlue ? defaults.color_primary : value.color_primary,
    color_primary_hover: oldFlowBlue ? defaults.color_primary_hover : value.color_primary_hover,
    color_secondary: oldFlowSecondary ? defaults.color_secondary : value.color_secondary,
  };
}

export function ExtensionCustomizer({ scope, resellerId, extensionId, extensionName, extensionVersion, extensionMethod }: Props) {
  const EXTENSION_ID = extensionId || DEFAULT_EXTENSION_ID;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [data, setData] = useState<ExtCustomization>(DEFAULTS);
  const [previewMode, setPreviewMode] = useState<"sidebar" | "popup" | "license">("sidebar");
  const [currentStep, setCurrentStep] = useState(0);

  const STEPS = [
    { id: "layout", title: "Estrutura", icon: Layout, description: "Nomes e títulos básicos" },
    { id: "colors", title: "Cores", icon: Palette, description: "Identidade visual" },
    { id: "brand", title: "Textos", icon: Type, description: "Saudações e rodapé" },
    { id: "images", title: "Imagens", icon: ImageIcon, description: "Logos e ícones" },
    { id: "shortcuts", title: "Atalhos", icon: MousePointer2, description: "Ações rápidas" },
    { id: "license", title: "Ativação", icon: KeyRound, description: "Tela de licença" },
  ];
  const visibleSteps = STEPS;
  const activeStep = visibleSteps[currentStep] ?? visibleSteps[0];

  useEffect(() => {
    void loadData();
  }, [scope, resellerId, extensionId, extensionName, extensionVersion, extensionMethod]);

  useEffect(() => {
    if (currentStep >= visibleSteps.length) {
      setCurrentStep(Math.max(0, visibleSteps.length - 1));
      return;
    }
    if (activeStep?.id === "license") {
      setPreviewMode("license");
    } else {
      setPreviewMode("sidebar");
    }
  }, [currentStep, extensionMethod, activeStep?.id, visibleSteps.length]);

  async function loadData() {
    setLoading(true);
    const defaults = getExtensionDefaults(extensionName, extensionVersion, extensionMethod);
    setRecordId(null);
    setData(defaults);
    try {
      let q = supabase
        .from("extension_customizations")
        .select("*")
        .eq("extension_id", EXTENSION_ID);
      if (scope === "template") {
        q = q.eq("is_template", true);
      } else if (resellerId) {
        q = q.eq("reseller_id", resellerId).eq("is_template", false);
      }
      const { data: row } = await q.maybeSingle();

      if (row) {
        setRecordId(row.id);
        const typedRow = normalizeLovaxCustomization(row as unknown as ExtCustomization, defaults, extensionMethod);
        setData({ 
          ...defaults, 
          ...typedRow, 
          shortcuts: (row.shortcuts as any) ?? defaults.shortcuts,
        });
      } else if (scope === "reseller") {
        const { data: tpl } = await supabase
          .from("extension_customizations")
          .select("*")
          .eq("extension_id", EXTENSION_ID)
          .eq("is_template", true)
          .maybeSingle();
        if (tpl) {
          const typedTpl = normalizeLovaxCustomization(tpl as unknown as ExtCustomization, defaults, extensionMethod);
          setData({ 
            ...defaults, 
            ...typedTpl, 
            shortcuts: (tpl.shortcuts as any) ?? defaults.shortcuts,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function update<K extends keyof ExtCustomization>(k: K, v: ExtCustomization[K]) {
    setData((d) => ({ ...d, [k]: v }));
  }

  function updateShortcut(i: number, k: "label" | "prompt", v: string) {
    setData((d) => {
      const sc = [...(d.shortcuts || [])];
      sc[i] = { ...sc[i], [k]: v };
      return { ...d, shortcuts: sc };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        extension_id: EXTENSION_ID,
        is_template: scope === "template",
        reseller_id: scope === "template" ? null : resellerId,
        ...data,
        shortcuts: data.shortcuts as any,
      } as any;
      if (recordId) {
        const { error } = await supabase
          .from("extension_customizations")
          .update(payload)
          .eq("id", recordId);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase
          .from("extension_customizations")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setRecordId(ins.id);
      }
      toast.success("Personalização salva!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetToTemplate() {
    if (scope !== "reseller") return;
    if (!confirm("Resetar para o padrão do gerente? Suas alterações serão perdidas.")) return;
    const { data: tpl } = await supabase
      .from("extension_customizations")
      .select("*")
      .eq("extension_id", EXTENSION_ID)
      .eq("is_template", true)
      .maybeSingle();
    if (tpl) {
      const typedTpl = tpl as unknown as ExtCustomization;
      setData({ 
        ...DEFAULTS, 
        ...typedTpl, 
        shortcuts: (tpl.shortcuts as any) ?? DEFAULTS.shortcuts,
      });
      toast.success("Restaurado para o padrão");
    }
  }

  async function handleUpload(field: keyof ExtCustomization, file: File) {
    try {
      // Garante que o registro existe antes de enviar arquivos —
      // a política de storage exige que o customization_id na pasta
      // pertença ao revendedor autenticado.
      let currentRecordId = recordId;
      if (!currentRecordId) {
        await handleSave();
        currentRecordId = recordId;
        if (!currentRecordId) {
          toast.error("Salve a personalização antes de enviar imagens.");
          return;
        }
      }
      const ext = file.name.split(".").pop() || "png";
      const brandSlug = data.brand_name?.replace(/[^a-z0-9]+/gi, "").toLowerCase() || "extensao";
      
      let fileName = `${String(field)}-${Date.now()}`;
      if (field === "logo_rect_url") {
        fileName = `${brandSlug}-logo1254-${Date.now()}`;
      } else if (field === "logo_square_url") {
        fileName = `${brandSlug}-logo512-${Date.now()}`;
      }

      const path = `${scope}/${currentRecordId}/${fileName}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("extension-customizations")
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("extension-customizations")
        .getPublicUrl(path);
      update(field, pub.publicUrl as any);
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e.message || "Falha no upload");
    }
  }

  async function handleDownloadZip() {
    setDownloading(true);
    try {
      await handleSave();
      const { data: { session } } = await supabase.auth.getSession();
      const url = `https://tmvucidickemtrmftlyb.supabase.co/functions/v1/extension-build-zip`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ extension_id: EXTENSION_ID }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Falha ao gerar");
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${data.manifest_name?.replace(/[^a-z0-9]+/gi, "_") || "extensao"}_${data.display_version}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("ZIP gerado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar ZIP");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 max-w-[1400px] mx-auto pb-10">
      {/* EDITOR */}
      <div className="space-y-6 min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Personalizar Extensão</h2>
            <p className="text-sm text-muted-foreground">Configure os detalhes visuais da sua extensão sidebar passo a passo.</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 w-fit">
             <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70">Editando agora:</span>
             <span className="text-xs font-bold text-primary uppercase">Sidebar</span>
          </div>
        </div>

        {/* Stepper Header */}
        <div className="grid grid-cols-5 gap-2">
          {visibleSteps.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => setCurrentStep(idx)}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                currentStep === idx 
                  ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-[1.02]" 
                  : "bg-card/50 backdrop-blur-sm hover:bg-card border-white/5 text-muted-foreground"
              )}
            >
              <step.icon className={cn("h-5 w-5", currentStep === idx ? "text-primary-foreground" : "text-muted-foreground")} />
              <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">{step.title}</span>
            </button>
          ))}
        </div>

        <Card className="p-6 relative overflow-hidden border-white/5 bg-card/30 backdrop-blur-xl">
          <div className="mb-6">
            <h3 className="text-lg font-bold flex items-center gap-2 text-white">
              {activeStep.title}
            </h3>
            <p className="text-xs text-muted-foreground">{activeStep.description}</p>
          </div>

          <div className="min-h-[350px]">
            {currentStep === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Field label="Nome no manifest (Chrome)">
                  <Input value={data.manifest_name ?? ""} onChange={(e) => update("manifest_name", e.target.value)} placeholder="Ex: Master Lovable" className="bg-white/5 border-white/10" />
                </Field>
                <Field label="Título da janela (Sidebar)">
                  <Input 
                    value={data.window_title ?? ""} 
                    onChange={(e) => update("window_title", e.target.value)} 
                    placeholder="Ex: Master Lovable - Painel Lateral"
                    className="bg-white/5 border-white/10"
                  />
                </Field>
                <Field label="Versão atual">
                  <div className="flex flex-col gap-1">
                    <Input 
                      value={data.display_version} 
                      readOnly 
                      className="bg-white/5 border-white/10 opacity-70 cursor-not-allowed font-mono" 
                    />
                    <p className="text-[9px] text-amber-500/80 italic font-medium">
                      * Definida pelo gerente do sistema.
                    </p>
                  </div>
                </Field>
                <Field label="Descrição (manifest)" className="md:col-span-2">
                  <Textarea
                    rows={2}
                    value={data.manifest_description ?? ""}
                    onChange={(e) => update("manifest_description", e.target.value)}
                    placeholder="Breve descrição da sua extensão..."
                    className="bg-white/5 border-white/10"
                  />
                </Field>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ColorField label="Cor primária" value={data.color_primary ?? "#3b82f6"} onChange={(v) => update("color_primary", v)} />
                  <ColorField label="Cor secundária (gradiente)" value={data.color_secondary ?? "#a78bfa"} onChange={(v) => update("color_secondary", v)} />
                  <ColorField label="Fundo principal" value={data.color_bg ?? "#0a0a0b"} onChange={(v) => update("color_bg", v)} />
                  <ColorField label="Fundo do Topo/Rodapé" value={data.color_bg_elevated ?? "#111113"} onChange={(v) => update("color_bg_elevated", v)} />
                  <ColorField label="Cor de Sucesso" value={data.color_success ?? "#34d399"} onChange={(v) => update("color_success", v)} />
                </div>
                
                <div className="pt-4 border-t border-white/5">
                  <Label className="text-xs font-bold uppercase text-white mb-3 block tracking-widest">Cards Liquid Glass</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ColorField label="Cor do fundo" value={data.card_bg_color ?? "#18181b"} onChange={(v) => update("card_bg_color", v)} />
                    <ColorField label="Cor da letra" value={data.card_text_color ?? "#f4f4f5"} onChange={(v) => update("card_text_color", v)} />
                    <ColorField label="Cor da borda normal" value={data.card_border_color ?? "rgba(255,255,255,0.06)"} onChange={(v) => update("card_border_color", v)} />
                    <ColorField label="Cor da borda (Hover)" value={data.card_border_hover_color ?? "rgba(255,255,255,0.12)"} onChange={(v) => update("card_border_hover_color", v)} />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <Label className="text-xs font-bold uppercase text-muted-foreground mb-3 block tracking-widest">Efeitos e Brilhos (Wave)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <ColorField label="Deep" value={data.color_wave_deep ?? "#041436"} onChange={(v) => update("color_wave_deep", v)} />
                    <ColorField label="Navy" value={data.color_wave_navy ?? "#06205f"} onChange={(v) => update("color_wave_navy", v)} />
                    <ColorField label="Azure" value={data.color_wave_azure ?? "#168cff"} onChange={(v) => update("color_wave_azure", v)} />
                    <ColorField label="Cyan (Glow)" value={data.color_wave_cyan ?? "#4ddfff"} onChange={(v) => update("color_wave_cyan", v)} />
                    <ColorField label="Blue" value={data.color_wave_blue ?? "#0b63ce"} onChange={(v) => update("color_wave_blue", v)} />
                    <ColorField label="Ice" value={data.color_wave_ice ?? "#f8fbff"} onChange={(v) => update("color_wave_ice", v)} />
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <Field label="Marca (kicker pequeno)">
                  <Input value={data.brand_kicker ?? ""} onChange={(e) => update("brand_kicker", e.target.value)} placeholder="Ex: Master" className="bg-white/5 border-white/10" />
                </Field>
                <Field label="Nome principal">
                  <Input value={data.brand_name ?? ""} onChange={(e) => update("brand_name", e.target.value)} placeholder="Ex: Lovable" className="bg-white/5 border-white/10" />
                </Field>
                <Field label="Texto do selo (Topo)">
                  <Input value={data.header_badge_text ?? "PRO"} onChange={(e) => update("header_badge_text", e.target.value)} placeholder="Ex: PRO, Master, VIP" className="bg-white/5 border-white/10" />
                </Field>
                <Field label="Texto do selo (Saudação)">
                  <Input value={data.greeting_badge_text ?? "PRO"} onChange={(e) => update("greeting_badge_text", e.target.value)} placeholder="Ex: PRO, Master, VIP" className="bg-white/5 border-white/10" />
                </Field>
                <Field label="Link de suporte">
                  <Input value={data.support_url ?? ""} onChange={(e) => update("support_url", e.target.value)} placeholder="Link WhatsApp ou URL" className="bg-white/5 border-white/10" />
                </Field>
                <div className="space-y-4 md:col-span-2">
                  <div className="flex items-center justify-between p-4 border border-white/5 rounded-xl bg-white/5">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold text-white">Usar nome da licença na saudação</Label>
                      <p className="text-[10px] text-muted-foreground">Exibe o nome vinculado à chave de licença ativa.</p>
                    </div>
                    <Switch checked={data.use_license_name !== false} onCheckedChange={(v) => update("use_license_name", v)} />
                  </div>
                  
                  {!data.use_license_name && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <Field label="Texto de saudação fixo">
                        <Input value={data.greeting_text ?? "Olá, Cliente"} onChange={(e) => update("greeting_text", e.target.value)} className="bg-white/5 border-white/10" />
                      </Field>
                    </div>
                  )}
                </div>
                <Field label="Texto do rodapé">
                  <Input value={data.footer_text ?? "Desenvolvido em Moçambique"} onChange={(e) => update("footer_text", e.target.value)} className="bg-white/5 border-white/10" />
                </Field>
                <div className="flex items-center justify-between p-4 border border-white/5 rounded-xl bg-white/5 md:col-span-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold text-white">Mostrar selo na saudação</Label>
                    <p className="text-[10px] text-muted-foreground">Exibe o badge ao lado do nome do cliente.</p>
                  </div>
                  <Switch checked={data.show_greeting_badge !== false} onCheckedChange={(v) => update("show_greeting_badge", v)} />
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <ImageField 
                  label="Logo retangular (1254x1254)" 
                  url={data.logo_rect_url} 
                  onUpload={(f) => handleUpload("logo_rect_url", f)} 
                  onClear={() => update("logo_rect_url", null)} 
                  hint="Aparece no topo da sidebar."
                />
                <ImageField 
                  label="Logo quadrada (512x512)" 
                  url={data.logo_square_url} 
                  onUpload={(f) => handleUpload("logo_square_url", f)} 
                  onClear={() => update("logo_square_url", null)} 
                  hint="Ícone principal da marca."
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <ImageField label="Ícone 16" url={data.icon_16_url} onUpload={(f) => handleUpload("icon_16_url", f)} onClear={() => update("icon_16_url", null)} tiny />
                  <ImageField label="Ícone 32" url={data.icon_32_url} onUpload={(f) => handleUpload("icon_32_url", f)} onClear={() => update("icon_32_url", null)} tiny />
                  <ImageField label="Ícone 48" url={data.icon_48_url} onUpload={(f) => handleUpload("icon_48_url", f)} onClear={() => update("icon_48_url", null)} tiny />
                  <ImageField label="Ícone 128" url={data.icon_128_url} onUpload={(f) => handleUpload("icon_128_url", f)} onClear={() => update("icon_128_url", null)} tiny />
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="text-xs text-muted-foreground mb-4 italic px-1">Configure os botões de ação rápida que aparecem abaixo do chat.</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {(data.shortcuts || []).slice(0, 9).map((s, i) => (
                    <Card key={i} className="p-4 border border-white/5 bg-white/5">
                      <div className="space-y-3">
                        <Input
                          placeholder="Etiqueta"
                          className="h-8 text-xs font-bold bg-white/5 border-white/10"
                          value={s.label}
                          onChange={(e) => updateShortcut(i, "label", e.target.value)}
                        />
                        <Textarea
                          placeholder="Prompt que será enviado"
                          className="text-[10px] min-h-[60px] py-2 bg-white/5 border-white/10"
                          value={s.prompt}
                          onChange={(e) => updateShortcut(i, "prompt", e.target.value)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Emoji da tela">
                    <Input value={data.license_emoji ?? ""} onChange={(e) => update("license_emoji", e.target.value)} placeholder="Ex: 🔑 (vazio esconde)" className="bg-white/5 border-white/10" />
                  </Field>
                  <Field label="Tamanho do Emoji (px)">
                    <Input 
                      type="number" 
                      value={data.license_emoji_size ?? 64} 
                      onChange={(e) => update("license_emoji_size", parseInt(e.target.value) || 0)} 
                      className="bg-white/5 border-white/10" 
                    />
                  </Field>
                </div>
                <Field label="Título da tela de licença">
                  <Input value={data.license_title ?? ""} onChange={(e) => update("license_title", e.target.value)} className="bg-white/5 border-white/10" />
                </Field>
                <Field label="Subtítulo/Descrição">
                  <Textarea value={data.license_description ?? ""} onChange={(e) => update("license_description", e.target.value)} className="bg-white/5 border-white/10" />
                </Field>
                <Field label="Placeholder da chave">
                  <Input value={data.license_placeholder ?? ""} onChange={(e) => update("license_placeholder", e.target.value)} className="bg-white/5 border-white/10 font-mono" />
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Texto do botão validar">
                    <Input value={data.license_button_text ?? ""} onChange={(e) => update("license_button_text", e.target.value)} className="bg-white/5 border-white/10" />
                  </Field>
                  <Field label="Texto do botão comprar (Opcional)">
                    <Input value={data.license_buy_button_text ?? ""} onChange={(e) => update("license_buy_button_text", e.target.value)} placeholder="Deixe vazio para esconder" className="bg-white/5 border-white/10" />
                  </Field>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold text-white uppercase tracking-widest">Botões Extras (Links)</Label>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 text-[10px] text-primary hover:text-primary"
                      onClick={() => update("license_extra_buttons", [...(data.license_extra_buttons || []), { label: "Novo Botão", url: "" }])}
                    >
                      + Adicionar Botão
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {(data.license_extra_buttons || []).map((btn, idx) => (
                      <div key={idx} className="flex gap-2 items-end bg-white/5 p-3 rounded-xl border border-white/5">
                        <div className="flex-1 space-y-1">
                          <Label className="text-[9px] uppercase text-muted-foreground">Etiqueta</Label>
                          <Input 
                            value={btn.label} 
                            onChange={(e) => {
                              const newList = [...(data.license_extra_buttons || [])];
                              newList[idx].label = e.target.value;
                              update("license_extra_buttons", newList);
                            }}
                            className="h-8 text-xs bg-white/5 border-white/10"
                          />
                        </div>
                        <div className="flex-[2] space-y-1">
                          <Label className="text-[9px] uppercase text-muted-foreground">URL (Link)</Label>
                          <Input 
                            value={btn.url} 
                            onChange={(e) => {
                              const newList = [...(data.license_extra_buttons || [])];
                              newList[idx].url = e.target.value;
                              update("license_extra_buttons", newList);
                            }}
                            placeholder="https://..."
                            className="h-8 text-xs bg-white/5 border-white/10"
                          />
                        </div>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            const newList = (data.license_extra_buttons || []).filter((_, i) => i !== idx);
                            update("license_extra_buttons", newList);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {(data.license_extra_buttons || []).length === 0 && (
                      <div className="text-[10px] text-muted-foreground italic text-center py-2">
                        Nenhum botão extra adicionado. O botão "Comprar" padrão será usado.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stepper Footer */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/5">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
              className="rounded-xl border-white/10 hover:bg-white/5 text-white"
            >
              <ChevronLeft className="h-4 w-4 mr-2" /> Anterior
            </Button>
            
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} variant="outline" className="rounded-xl border-white/10 hover:bg-white/5 text-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
              
              {currentStep < visibleSteps.length - 1 ? (
                <Button 
                  onClick={() => setCurrentStep(prev => Math.min(visibleSteps.length - 1, prev + 1))}
                  className="rounded-xl px-8 shadow-lg shadow-primary/10"
                >
                  Próximo <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button 
                  onClick={handleDownloadZip} 
                  disabled={downloading} 
                  className="bg-primary hover:bg-primary/90 rounded-xl px-8 shadow-xl shadow-primary/20"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                  Gerar Extensão
                </Button>
              )}
            </div>
          </div>
        </Card>

        {scope === "reseller" && (
          <Button onClick={handleResetToTemplate} variant="ghost" className="w-full text-muted-foreground hover:text-destructive text-[10px] uppercase tracking-widest font-bold mt-4">
            <RotateCcw className="h-3 w-3 mr-2" /> Resetar tudo para o padrão do sistema
          </Button>
        )}
      </div>

      {/* PREVIEW */}
      <div className="lg:sticky lg:top-8 self-start space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-extrabold">
            Visualização ao vivo
          </div>
          <div className="flex gap-1">
            <div className={cn("text-[10px] border border-emerald-500/20 px-3 py-1 rounded-full font-bold cursor-pointer transition-colors", previewMode === "sidebar" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-muted-foreground")} onClick={() => setPreviewMode("sidebar")}>
              Sidebar
            </div>
            <div className={cn("text-[10px] border border-emerald-500/20 px-3 py-1 rounded-full font-bold cursor-pointer transition-colors", previewMode === "license" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-muted-foreground")} onClick={() => setPreviewMode("license")}>
              Ativação
            </div>
          </div>
        </div>
        <ExtensionPreview
          c={data}
          mode={previewMode === "license" ? "sidebar" : previewMode}
          showLicense={previewMode === "license"}
          extensionMethod={extensionMethod}
        />
        <Card className="p-4 bg-primary/5 border border-primary/10 rounded-2xl">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <strong>Dica:</strong> As cores escolhidas no passo "Cores" são o coração do tema e serão aplicadas em toda a interface automaticamente.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">{label}</Label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">{label}</Label>
      <div className="flex items-center gap-3">
        <div className="relative group cursor-pointer h-10 w-12 rounded-xl border border-white/10 bg-white/5 p-1 overflow-hidden">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-[-4px] h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer bg-transparent border-none"
          />
        </div>
        <Input 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          className="font-mono text-xs h-10 rounded-xl bg-white/5 border-white/10 text-white focus-visible:ring-1 focus-visible:ring-primary" 
        />
      </div>
    </div>
  );
}

function ImageField({
  label, url, onUpload, onClear, hint, tiny
}: { label: string; url?: string | null; onUpload: (f: File) => void; onClear: () => void; hint?: string; tiny?: boolean }) {
  return (
    <div className={cn("space-y-2", tiny ? "flex flex-col items-center text-center" : "")}>
      {!tiny && (
        <div className="flex items-center justify-between">
          <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-tight">{label}</Label>
          {hint && <span className="text-[9px] text-muted-foreground bg-white/5 px-2 py-1 rounded italic">{hint}</span>}
        </div>
      )}
      {tiny && <Label className="text-[9px] font-bold text-muted-foreground uppercase">{label}</Label>}
      
      <div className={cn("flex gap-4", tiny ? "flex-col items-center" : "items-center")}>
        <div
          className={cn(
            "rounded-2xl border border-dashed border-white/10 flex items-center justify-center bg-white/5 overflow-hidden shrink-0 transition-all hover:border-primary/40 group",
            tiny ? "h-14 w-14" : "h-20 w-20"
          )}
        >
          {url ? (
            <div className="relative h-full w-full">
              <img src={url} alt="" className="h-full w-full object-contain p-2" />
              <button 
                onClick={(e) => { e.preventDefault(); onClear(); }}
                className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-all"
              >
                Limpar
              </button>
            </div>
          ) : (
            <Upload className={cn("text-white/20", tiny ? "h-5 w-5" : "h-8 w-8")} />
          )}
        </div>
        <label className={cn("flex-1", tiny ? "w-full" : "")}>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
          <div className={cn(
            "border rounded-xl p-2.5 text-center text-xs font-semibold cursor-pointer transition-all hover:bg-white/5 text-white",
            tiny ? "text-[9px] p-1.5 border-dashed border-white/10" : "border-solid border-white/10 bg-white/5"
          )}>
            {url ? "Alterar" : tiny ? "Subir" : "Escolher Arquivo"}
          </div>
        </label>
      </div>
    </div>
  );
}
