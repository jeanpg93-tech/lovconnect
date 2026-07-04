// Builds a customized extension ZIP on demand
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  BlobReader, BlobWriter, ZipReader, ZipWriter, TextReader, Uint8ArrayReader, TextWriter, Uint8ArrayWriter
} from "https://deno.land/x/zipjs@v2.7.45/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Cust = {
  brand_kicker: string; brand_name: string; brand_badge: string;
  header_badge_text?: string; greeting_badge_text?: string;
  display_version: string; window_title: string;
  manifest_name: string; manifest_description: string; support_url: string;
  community_url?: string | null;
  greeting_text: string; use_license_name: boolean; currency_symbol: string; footer_text: string;
  license_title?: string | null; license_description?: string | null; license_placeholder?: string | null;
  license_button_text?: string | null;
  show_greeting_badge: boolean; color_success: string;
  color_primary: string; color_primary_hover: string; color_secondary: string;
  color_bg: string; color_bg_elevated: string; color_bg_surface: string;
  color_wave_deep?: string; color_wave_navy?: string; color_wave_blue?: string;
  color_wave_azure?: string; color_wave_cyan?: string; color_wave_ice?: string;
  card_border_color: string; card_border_hover_color: string;
  card_bg_color: string; card_text_color: string; card_muted_text_color: string;
  logo_rect_url?: string | null; logo_square_url?: string | null;
  icon_16_url?: string | null; icon_32_url?: string | null;
  icon_48_url?: string | null; icon_128_url?: string | null;
  banner_enabled?: boolean; banner_url?: string | null; banner_link?: string | null;
  history_enabled?: boolean;
  shortcuts: { label: string; prompt: string }[];
  
  // Popup specific
  popup_brand_kicker?: string; popup_brand_name?: string; popup_brand_badge?: string;
  popup_header_badge_text?: string; popup_greeting_badge_text?: string;
  popup_window_title?: string;
  popup_greeting_text?: string; popup_use_license_name?: boolean; popup_currency_symbol?: string; popup_footer_text?: string;
  popup_show_greeting_badge?: boolean;
  popup_color_primary?: string; popup_color_primary_hover?: string; popup_color_secondary?: string;
  popup_color_bg?: string; popup_color_bg_elevated?: string; popup_color_bg_surface?: string;
  popup_color_wave_deep?: string; popup_color_wave_navy?: string; popup_color_wave_blue?: string;
  popup_color_wave_azure?: string; popup_color_wave_cyan?: string; popup_color_wave_ice?: string;
  popup_history_enabled?: boolean;
  popup_shortcuts?: { label: string; prompt: string }[];
  popup_logo_rect_url?: string | null;
  popup_logo_square_url?: string | null;
  popup_card_border_color?: string;
  popup_card_border_hover_color?: string;
  popup_card_bg_color?: string;
  popup_card_text_color?: string;
  popup_card_muted_text_color?: string;
};

const TEMPLATE_PATH = "templates/master-lovable-base.zip";

const DEFAULT_DARK_THEME = {
  primary: "#ff1010",
  hover: "#d90000",
  secondary: "#ff3b30",
  bg: "#070707",
  elevated: "#141416",
  surface: "#1b1b1f",
  textPrimary: "#f4f4f5",
  textSecondary: "#a1a1aa",
  textMuted: "#71717a",
};

function cssValue(value: unknown, fallback: string) {
  const v = String(value ?? "").trim();
  if (!v || v === "null" || v === "undefined") return fallback;
  return v;
}

function luminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

function darkThemeValue(value: unknown, fallback: string) {
  const v = cssValue(value, fallback);
  const lum = luminance(v);
  return lum !== null && lum > 90 ? fallback : v;
}

function lightTextValue(value: unknown, fallback: string) {
  const v = cssValue(value, fallback);
  const lum = luminance(v);
  return lum !== null && lum < 150 ? fallback : v;
}

function escapeJs(s: string) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeJsonStringContent(s: string) {
  return JSON.stringify(String(s)).slice(1, -1);
}
function replaceLegacyBrandText(content: string, brandName: string) {
  return String(content)
    .replace(/TS(?:\s|&nbsp;|&#160;|\\u00a0|\u00a0)+Community/gi, brandName)
    .replace(/T\s*S\s*Community/gi, brandName)
    .replace(/Main Lovable/g, brandName)
    .replace(/Master Lovable/g, brandName)
    .replace(
      /(Bem[- ]?vindo[a]?\s+a[o]?\s+)([^<\n"'`\\]{1,80}?)(?=[<\n"'`\\]|\s*<\/|\s*\+|$)/gi,
      (_m, p1) => `${p1}${brandName}`,
    );
}
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = String(hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

// SSRF hardening: only fetch public https URLs; block loopback / private / link-local hosts
// and refuse redirects (an attacker-controlled 302 could point at internal services).
function isSafeAssetUrl(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return false;
  // IPv6 literal or userinfo -> reject (covers ::1, link-local, ULA)
  if (host.includes(":") || u.username || u.password) return false;
  // IPv4 literal? Block private / loopback / link-local ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [parseInt(ipv4[1], 10), parseInt(ipv4[2], 10)];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false; // AWS/GCP metadata + link-local
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a >= 224) return false; // multicast / reserved
  } else if (!host.includes(".")) {
    // bare hostname (could resolve to internal service) -> reject
    return false;
  }
  return true;
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  if (!isSafeAssetUrl(url)) return null;
  try {
    const r = await fetch(url, { redirect: "error" });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const extension_id = body.extension_id as string;
    if (!extension_id) {
      return new Response(JSON.stringify({ error: "extension_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find reseller_id of this user (if any)
    const { data: reseller } = await supabase
      .from("resellers").select("id, activation_status").eq("user_id", user.id).maybeSingle();
    if (reseller && reseller.activation_status && reseller.activation_status !== "active") {
      return new Response(JSON.stringify({ error: "activation_required", message: "Painel pendente de ativação (R$ 200)" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick customization: own > template
    let cust: Cust | null = null;
    if (reseller?.id) {
      const { data } = await supabase
        .from("extension_customizations")
        .select("*")
        .eq("extension_id", extension_id)
        .eq("reseller_id", reseller.id)
        .maybeSingle();
      if (data) cust = data as any;
    }
    if (!cust) {
      const { data } = await supabase
        .from("extension_customizations")
        .select("*")
        .eq("extension_id", extension_id)
        .eq("is_template", true)
        .maybeSingle();
      if (data) cust = data as any;
    }
    if (!cust) {
      return new Response(JSON.stringify({ error: "Customization not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If the download is triggered directly from the customizer form, use the
    // just-submitted values too. This avoids stale downloads when the user edits
    // the form and immediately clicks "Baixar extensão alterada".
    const customizationOverride = body.customization_override;
    if (customizationOverride && typeof customizationOverride === "object" && !Array.isArray(customizationOverride)) {
      const allowedOverrideFields = [
        "brand_name", "logo_rect_url", "logo_square_url", "icon_16_url", "icon_32_url", "icon_48_url", "icon_128_url",
        "color_primary", "color_primary_hover", "color_secondary", "color_bg", "color_bg_elevated", "color_bg_surface", "color_success",
        "card_bg_color", "card_border_color", "card_border_hover_color", "card_text_color", "card_muted_text_color",
        "popup_color_primary", "popup_color_primary_hover", "popup_color_secondary", "popup_color_bg", "popup_color_bg_elevated", "popup_color_bg_surface",
        "popup_card_bg_color", "popup_card_border_color", "popup_card_border_hover_color", "popup_card_text_color", "popup_card_muted_text_color",
        "support_url", "community_url", "manifest_name", "manifest_description", "window_title", "display_version", "brand_kicker", "brand_badge",
        "header_badge_text", "greeting_badge_text", "footer_text", "greeting_text", "use_license_name", "currency_symbol", "show_greeting_badge",
        "license_title", "license_description", "license_placeholder", "license_button_text", "popup_brand_name", "popup_window_title",
        "popup_footer_text", "popup_greeting_text", "popup_header_badge_text", "popup_greeting_badge_text", "popup_brand_badge",
      ];
      const merged = { ...cust } as Record<string, unknown>;
      for (const field of allowedOverrideFields) {
        if (Object.prototype.hasOwnProperty.call(customizationOverride, field)) {
          merged[field] = customizationOverride[field];
        }
      }
      cust = merged as Cust;
    }

    // Download base ZIP: prefer the extension's actual uploaded file;
    // fall back to the legacy template if present.
    let tplBlob: Blob | null = null;
    const { data: extRow } = await supabase
      .from("extensions")
      .select("file_path")
      .eq("id", extension_id)
      .maybeSingle();
    if (extRow?.file_path) {
      const { data } = await supabase.storage
        .from("extension-files").download(extRow.file_path);
      if (data) tplBlob = data;
    }
    if (!tplBlob) {
      const { data } = await supabase.storage
        .from("extension-builds").download(TEMPLATE_PATH);
      if (data) tplBlob = data;
    }
    if (!tplBlob) {
      return new Response(JSON.stringify({ error: "Base ZIP not found for this extension" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read entries
    const reader = new ZipReader(new BlobReader(tplBlob));
    const entries = await reader.getEntries();
    const baseName = (name: string) => name.split("/").pop() || name;
    const manifestEntry = entries.find(e => baseName(e.filename) === "manifest.json");
    const manifestDir = manifestEntry?.filename.includes("/")
      ? manifestEntry.filename.replace(/manifest\.json$/, "")
      : "";
    const zipPath = (relativePath: string) => `${manifestDir}${relativePath}`;

    // Prepare custom assets
    const overrides = new Map<string, Uint8Array | string>();

    // 0) Process images and define dynamic names
    const brandPrefix = cust.brand_name.replace(/[^a-z0-9]+/gi, "") || "brand";
    const logo1254Path = `assets/${brandPrefix}-logo1254.png`;
    const logo512Path = `assets/${brandPrefix}-logo512.png`;

    const imageMap: Array<[string, string | null | undefined, string]> = [
      ["assets/logo-master-lovable.png", cust.logo_rect_url, logo1254Path],
      ["assets/logo-master-lovable-square.png", cust.logo_square_url, logo512Path],
      ["assets/icon16.png", cust.icon_16_url, "assets/icon16.png"],
      ["assets/icon32.png", cust.icon_32_url, "assets/icon32.png"],
      ["assets/icon48.png", cust.icon_48_url, "assets/icon48.png"],
      ["assets/icon128.png", cust.icon_128_url, "assets/icon128.png"],
    ];

    const entriesToRemove = new Set<string>();
    const availableIcons: Record<string, string> = {};

    for (const [oldPath, url, newPath] of imageMap) {
      if (url && url.trim() !== "") {
        const bytes = await fetchBytes(url);
        if (bytes) {
          overrides.set(zipPath(newPath), bytes);
          if (oldPath !== newPath) {
            entriesToRemove.add(zipPath(oldPath));
          }
          // Track icons for manifest
          const iconMatch = newPath.match(/icon(\d+)\.png/);
          if (iconMatch) {
            availableIcons[iconMatch[1]] = newPath;
          }
        } else {
          entriesToRemove.add(zipPath(oldPath));
        }
      } else {
        entriesToRemove.add(zipPath(oldPath));
      }
    }

    // 1) manifest.json
    if (manifestEntry?.getData) {
      const txt = await manifestEntry.getData(new TextWriter());
      try {
        const m = JSON.parse(txt as string);
        m.name = cust.manifest_name || cust.brand_name || m.name;
        m.description = cust.manifest_description || `Extensão ${cust.brand_name || ""}`.trim() || m.description;
        m.version = String(cust.display_version || "1.0.0").replace(/^v/, "").replace(/[^0-9.]/g, "") || "1.0.0";
        
        // Ensure action exists
        if (!m.action) m.action = {};
        m.action.default_title = cust.manifest_name;

        // Update Icons
        if (Object.keys(availableIcons).length > 0) {
          m.icons = availableIcons;
          m.action.default_icon = availableIcons;
        } else {
          delete m.icons;
          delete m.action.default_icon;
        }

        overrides.set(manifestEntry.filename, JSON.stringify(m, null, 2));
      } catch (err) {
        console.error("Error parsing manifest.json", err);
      }
    }

    // Helper to read an entry as text (accounting for potential overrides)
    const getFileText = async (name: string): Promise<string | null> => {
      const ov = overrides.get(name);
      if (typeof ov === "string") return ov;
      const e = entries.find(x => x.filename === name);
      if (!e?.getData) return null;
      return (await e.getData(new TextWriter())) as string;
    };

    const wave = {
      deep:  cust.color_wave_deep  ?? "#041436",
      navy:  cust.color_wave_navy  ?? "#06205f",
      blue:  cust.color_wave_blue  ?? "#0b63ce",
      azure: cust.color_wave_azure ?? "#168cff",
      cyan:  cust.color_wave_cyan  ?? "#4ddfff",
      ice:   cust.color_wave_ice   ?? "#f8fbff",
    };

    const transformCss = (input: string, mode: "sidebar" | "popup"): string => {
      const isPopup = mode === "popup";
      
      const p = {
        primary: cssValue((isPopup && cust.popup_color_primary) || cust.color_primary, DEFAULT_DARK_THEME.primary),
        hover: cssValue((isPopup && cust.popup_color_primary_hover) || cust.color_primary_hover, DEFAULT_DARK_THEME.hover),
        secondary: cssValue((isPopup && cust.popup_color_secondary) || cust.color_secondary, DEFAULT_DARK_THEME.secondary),
        bg: darkThemeValue((isPopup && cust.popup_color_bg) || cust.color_bg, DEFAULT_DARK_THEME.bg),
        elevated: darkThemeValue((isPopup && cust.popup_color_bg_elevated) || cust.color_bg_elevated, DEFAULT_DARK_THEME.elevated),
        surface: darkThemeValue((isPopup && cust.popup_color_bg_surface) || cust.color_bg_surface, DEFAULT_DARK_THEME.surface),
      };

      const cardBg = darkThemeValue((isPopup && cust.popup_card_bg_color) || cust.card_bg_color, p.surface);
      const cardBorder = cssValue((isPopup && cust.popup_card_border_color) || cust.card_border_color, 'rgba(255,255,255,0.08)');
      const cardBorderHover = cssValue((isPopup && cust.popup_card_border_hover_color) || cust.card_border_hover_color, 'rgba(255,255,255,0.14)');
      const cardText = lightTextValue((isPopup && cust.popup_card_text_color) || cust.card_text_color, DEFAULT_DARK_THEME.textPrimary);
      const cardMuted = lightTextValue((isPopup && cust.popup_card_muted_text_color) || cust.card_muted_text_color, DEFAULT_DARK_THEME.textSecondary);

      const w = {
        deep:  (isPopup && cust.popup_color_wave_deep) || wave.deep,
        navy:  (isPopup && cust.popup_color_wave_navy) || wave.navy,
        blue:  (isPopup && cust.popup_color_wave_blue) || wave.blue,
        azure: (isPopup && cust.popup_color_wave_azure) || wave.azure,
        cyan:  (isPopup && cust.popup_color_wave_cyan) || wave.cyan,
        ice:   (isPopup && cust.popup_color_wave_ice) || wave.ice,
      };

      const vars = `
:root, [data-theme], body, #ql-floating, .sp-body {
  --ql-accent: ${p.primary};
  --ql-accent-hover: ${p.hover};
  --ql-accent-glow: ${p.primary}55;
  --ql-accent-subtle: ${p.primary}1f;
  --ql-secondary: ${p.secondary};
  --ql-bg: ${p.bg};
  --ql-bg-elevated: ${p.elevated};
  --ql-bg-surface: ${cardBg};
  --ql-bg-hover: ${cardBg};
  --ql-border: ${cardBorder};
  --ql-border-hover: ${cardBorderHover};
  --ql-text-primary: ${cardText};
  --ql-text-secondary: ${cardMuted};
  --ql-text-muted: ${DEFAULT_DARK_THEME.textMuted};
  --ql-success: ${cust.color_success || '#34d399'};
  --ql-success-bg: ${(cust.color_success || '#34d399')}1a;
  --ml-deep: ${w.deep};
  --ml-navy: ${w.navy};
  --ml-blue: ${w.blue};
  --ml-azure: ${w.azure};
  --ml-cyan: ${w.cyan};
  --ml-ice: ${w.ice};
}
`;
      let output = vars + "\n" + input;

      // Mapa de cores REAIS auditadas em /extension/floating.css e sidepanel.css.
      // Cores semânticas (verde sucesso, vermelho destrutivo do botão "Remover Marca",
      // amarelo warning, mutes/bordas neutras) NÃO são substituídas.
      const hexMap: Record<string, string> = {
        // Backgrounds
        "#0a0a0b": p.bg,
        "#111113": p.elevated,
        "#18181b": p.surface,
        "#1f1f23": p.surface,
        // Roxos / secundária
        "#a78bfa": p.secondary,
        "#7c5aff": p.secondary,
        "#6d4aef": p.secondary,
        "#7c3aed": p.secondary,
        "#a855f7": p.secondary,
        "#c4b5fd": p.secondary,
        // Azuis / primária
        "#ef4444": p.primary,
        "#dc2626": p.hover,
        "#ff1010": p.primary,
        "#d90000": p.hover,
        "#ff3b30": p.secondary,
        "#3b82f6": p.primary,
        "#2563eb": p.hover,
        "#38bdf8": p.primary,
        // Wave palette
        "#041436": w.deep,
        "#06205f": w.navy,
        "#0b63ce": w.blue,
        "#168cff": w.azure,
        "#4ddfff": w.cyan,
        "#f8fbff": w.ice,
      };
      for (const [oldHex, newHex] of Object.entries(hexMap)) {
        output = output.replace(new RegExp(oldHex, "gi"), newHex);
      }

      // rgb()/rgba() equivalentes dos roxos e azuis mais usados em sombras/glows
      const bgRgb = hexToRgb(p.bg);
      if (bgRgb) {
        output = output.replace(/rgba?\(\s*10\s*,\s*10\s*,\s*11/gi, (m) => m.replace(/\d+\s*,\s*\d+\s*,\s*\d+/, `${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}`));
      }
      const elRgb = hexToRgb(p.elevated);
      if (elRgb) {
        output = output.replace(/rgba?\(\s*17\s*,\s*17\s*,\s*19/gi, (m) => m.replace(/\d+\s*,\s*\d+\s*,\s*\d+/, `${elRgb.r}, ${elRgb.g}, ${elRgb.b}`));
      }
      const surfRgb = hexToRgb(p.surface);
      if (surfRgb) {
        output = output.replace(/rgba?\(\s*24\s*,\s*24\s*,\s*27/gi, (m) => m.replace(/\d+\s*,\s*\d+\s*,\s*\d+/, `${surfRgb.r}, ${surfRgb.g}, ${surfRgb.b}`));
      }

      const secRgb = hexToRgb(p.secondary);
      if (secRgb) {
        const reps = [
          /rgba?\(\s*124\s*,\s*90\s*,\s*255/gi,   // #7c5aff
          /rgba?\(\s*167\s*,\s*139\s*,\s*250/gi,  // #a78bfa
          /rgba?\(\s*109\s*,\s*74\s*,\s*239/gi,   // #6d4aef
        ];
        for (const re of reps) {
          output = output.replace(re, (m) => m.replace(/\d+\s*,\s*\d+\s*,\s*\d+/, `${secRgb.r}, ${secRgb.g}, ${secRgb.b}`));
        }
      }
      const priRgb = hexToRgb(p.primary);
      if (priRgb) {
        const reps = [
          /rgba?\(\s*239\s*,\s*68\s*,\s*68/gi,    // #ef4444
          /rgba?\(\s*220\s*,\s*38\s*,\s*38/gi,    // #dc2626
          /rgba?\(\s*255\s*,\s*16\s*,\s*16/gi,    // #ff1010
          /rgba?\(\s*59\s*,\s*130\s*,\s*246/gi,   // #3b82f6
          /rgba?\(\s*56\s*,\s*189\s*,\s*248/gi,   // #38bdf8
        ];
        for (const re of reps) {
          output = output.replace(re, (m) => m.replace(/\d+\s*,\s*\d+\s*,\s*\d+/, `${priRgb.r}, ${priRgb.g}, ${priRgb.b}`));
        }
      }
      
      // Substituições extras forçadas de cores para elementos problemáticos
      output = output.replace(/\.sp-trial-countdown\s*{[\s\S]*?background:[\s\S]*?rgba\(255,255,255,0\.03\)/gi, (m) => m.replace(/rgba\(255,255,255,0\.03\)/, `var(--ql-bg-surface)`));
      output = output.replace(/\.sp-download-card\s*{[\s\S]*?background:[\s\S]*?rgba\(255,255,255,0\.03\)/gi, (m) => m.replace(/rgba\(255,255,255,0\.03\)/, `var(--ql-bg-surface)`));

      const history_enabled = isPopup ? (cust.popup_history_enabled !== false) : (cust.history_enabled !== false);

      output += `
/* Final Forced Overrides */
${isPopup ? "#ql-floating" : "body, html"} { background-color: var(--ql-bg) !important; background-image: none !important; }
body::before, body::after { background: var(--ql-bg) !important; opacity: 1 !important; display: block !important; }
${isPopup ? "#ql-header" : ".sp-header, header"} { background: var(--ql-bg-elevated) !important; }
${isPopup ? "#ql-body" : ".sp-container, .main-container"} { background: var(--ql-bg) !important; }
.ql-profile-card, .sp-profile-card { background: var(--ql-bg-surface) !important; }
.ql-textarea, .sp-textarea, #ql-msg, #sp-msg { background: var(--ql-bg-surface) !important; color: var(--ql-text-primary) !important; }
.ql-tab.ql-tab-active, .sp-tab.sp-tab-active { background: var(--ql-accent-subtle) !important; color: var(--ql-accent) !important; }
.ql-send-btn, .sp-send-btn { background: linear-gradient(135deg, var(--ql-accent), var(--ql-secondary)) !important; }

/* Dark is the downloaded extension default. Light mode receives a separate high-contrast palette. */
#ql-floating.ql-light, body.sp-light {
  --ql-bg: #f8fafc !important;
  --ql-bg-elevated: #ffffff !important;
  --ql-bg-surface: #ffffff !important;
  --ql-bg-hover: #e5e7eb !important;
  --ql-border: rgba(15,23,42,0.16) !important;
  --ql-border-hover: rgba(15,23,42,0.28) !important;
  --ql-text-primary: #0f172a !important;
  --ql-text-secondary: #334155 !important;
  --ql-text-muted: #475569 !important;
  --ql-accent-subtle: color-mix(in srgb, var(--ql-accent) 12%, transparent) !important;
  --ql-accent-glow: color-mix(in srgb, var(--ql-accent) 24%, transparent) !important;
}
#ql-floating.ql-light .ql-icon-btn,
#ql-floating.ql-light .ql-tool-btn,
#ql-floating.ql-light .ql-attach-btn,
body.sp-light .sp-icon-btn,
body.sp-light .sp-tool-btn,
body.sp-light .sp-attach-btn,
body.sp-light .sp-back-to-popup {
  color: var(--ql-text-secondary) !important;
  border-color: var(--ql-border) !important;
}
#ql-floating.ql-light .ql-icon-btn:hover,
#ql-floating.ql-light .ql-tool-btn:hover,
#ql-floating.ql-light .ql-attach-btn:hover,
body.sp-light .sp-icon-btn:hover,
body.sp-light .sp-tool-btn:hover,
body.sp-light .sp-attach-btn:hover,
body.sp-light .sp-back-to-popup:hover {
  color: var(--ql-text-primary) !important;
  background: var(--ql-bg-hover) !important;
}
#ql-floating.ql-light .ql-profile-name,
#ql-floating.ql-light .ql-gate-title,
#ql-floating.ql-light .ql-modal-title,
#ql-floating.ql-light .ql-pkg-name,
#ql-floating.ql-light strong,
body.sp-light .sp-profile-name,
body.sp-light .sp-gate-title,
body.sp-light .sp-modal-title,
body.sp-light strong {
  color: var(--ql-text-primary) !important;
}
/* Headings de boas-vindas / títulos do gate em modo claro: garantem leitura.
   Cobre variações conhecidas (sp-welcome, sp-welcome-title, ql-welcome,
   h1/h2 dentro do gate de licença, etc.). */
body.sp-light .sp-welcome,
body.sp-light .sp-welcome-title,
body.sp-light .sp-welcome-heading,
body.sp-light .sp-hero-title,
body.sp-light .sp-license-gate h1,
body.sp-light .sp-license-gate h2,
body.sp-light .sp-license-gate h3,
body.sp-light .sp-license-gate .sp-title,
#ql-floating.ql-light .ql-welcome,
#ql-floating.ql-light .ql-welcome-title,
#ql-floating.ql-light .ql-license-gate h1,
#ql-floating.ql-light .ql-license-gate h2,
#ql-floating.ql-light .ql-license-gate h3 {
  color: var(--ql-text-primary) !important;
  opacity: 1 !important;
}
body.sp-light .sp-license-gate p,
body.sp-light .sp-gate-desc,
body.sp-light .sp-welcome-subtitle,
#ql-floating.ql-light .ql-license-gate p,
#ql-floating.ql-light .ql-gate-desc {
  color: var(--ql-text-secondary) !important;
  opacity: 1 !important;
}
#ql-floating.ql-light .ql-chip:hover,
body.sp-light .sp-chip:hover {
  color: var(--ql-accent) !important;
}
#ql-floating.ql-light .ql-trial-countdown,
#ql-floating.ql-light .ql-download-card,
body.sp-light .sp-trial-countdown,
body.sp-light .sp-download-card {
  background: var(--ql-bg-surface) !important;
  border-color: var(--ql-border) !important;
}

/* Hide logos if not provided */
${!cust.logo_rect_url ? ".sp-logo, .brand-logo, .ql-brand-logo, img[src*='logo1254'] { display: none !important; }" : ""}
${!cust.logo_square_url ? ".sp-logo-square, .brand-logo-square, .ql-brand-logo-square, img[src*='logo512'] { display: none !important; }" : ""}
.sp-brand-logo, .ql-brand-logo { width: 28px !important; height: 28px !important; object-fit: contain !important; flex: 0 0 28px !important; border-radius: 6px !important; }
.sp-brand, .ql-header-left { display: flex !important; align-items: center !important; gap: 8px !important; min-width: 0 !important; }
.sp-brand-text, .ql-brand, .ql-title { min-width: 0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
`;
      if (history_enabled === false) {
        output += `\n.sp-tab[data-tab="history"], [data-tab-id="history"], .ql-tab[data-tab="history"] { display: none !important; }\n`;
      }
      return output;
    };

    // Decide o "modo" (popup vs sidebar) com base no nome do arquivo
    const fileMode = (name: string): "popup" | "sidebar" => {
      const n = baseName(name).toLowerCase();
      if (n.includes("popup") || n.includes("floating") || n === "content.js" || n === "content-templates.js") {
        return "popup";
      }
      return "sidebar";
    };

    // Substituições de TEXTO da interface (auditadas em /extension/)
    const applyTextReplacements = (content: string, fileName: string, mode: "popup" | "sidebar"): string => {
      const brand_kicker = (mode === "popup" && cust.popup_brand_kicker) || cust.brand_kicker;
      const brand_name   = (mode === "popup" && cust.popup_brand_name)   || cust.brand_name;
      const header_badge   = (mode === "popup" && cust.popup_header_badge_text) || cust.header_badge_text || cust.brand_badge;
      const greeting_badge = (mode === "popup" && cust.popup_greeting_badge_text) || cust.greeting_badge_text || cust.brand_badge;
      const window_title = (mode === "popup" && cust.popup_window_title) || cust.window_title;
      
      const greeting_text = (mode === "popup" && cust.popup_greeting_text) || cust.greeting_text || "Olá, Cliente";
      const use_license_name = mode === "popup" ? (cust.popup_use_license_name !== false) : (cust.use_license_name !== false);
      const currency_symbol = (mode === "popup" && cust.popup_currency_symbol) || cust.currency_symbol || "MZN";
      const footer_text = (mode === "popup" && cust.popup_footer_text) || cust.footer_text || "Desenvolvido em Moçambique";
      const show_greeting_badge = mode === "popup" ? (cust.popup_show_greeting_badge !== false) : (cust.show_greeting_badge !== false);
      const licenseTitle = (cust.license_title && cust.license_title.trim()) || `Bem vindo a ${brand_name}`;
      const licenseDescription = (cust.license_description && cust.license_description.trim()) || "Insira sua chave de licença para desbloquear.";
      const licensePlaceholder = (cust.license_placeholder && cust.license_placeholder.trim()) || "TS-XXXXXXXXXXXXXXXXXXXXXX";
      const licenseButtonText = (cust.license_button_text && cust.license_button_text.trim()) || "Validar Licença";

      // HTML específico
      if (fileName.endsWith(".html")) {
        content = content.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(window_title)}</title>`);
        content = content.replace(/<span class="sp-brand-text">[\s\S]*?<\/span>/g, `<span class="sp-brand-text">⚡ ${escapeHtml(brand_name)}</span>`);
        content = content.replace(/<span class="ql-brand">[\s\S]*?<\/span>/g, `<span class="ql-brand">⚡ ${escapeHtml(brand_name)}</span>`);
        content = content.replace(/<span class="sp-brand-kicker">[\s\S]*?<\/span>/g, `<span class="sp-brand-kicker">${escapeHtml(brand_kicker)}</span>`);
        content = content.replace(/<span class="sp-badge">[\s\S]*?<\/span>/g, `<span class="sp-badge">${escapeHtml(header_badge)}</span>`);
        content = content.replace(/<span class="ql-badge-pro-header">[\s\S]*?<\/span>/g, `<span class="ql-badge-pro-header">${escapeHtml(header_badge)}</span>`);
        content = content.replace(/<span class="ql-status-badge ql-badge-pro">[\s\S]*?<\/span>/g, show_greeting_badge ? `<span class="ql-status-badge ql-badge-pro">${escapeHtml(greeting_badge)}</span>` : '');
        content = content.replace(/<span class="sp-status-badge sp-badge-pro">[\s\S]*?<\/span>/g, show_greeting_badge ? `<span class="sp-status-badge sp-badge-pro">${escapeHtml(greeting_badge)}</span>` : '');
        content = content.replace(/<span class="sp-footer-badge">[\s\S]*?<\/span>/g, `<span class="sp-footer-badge">🇲🇿 ${escapeHtml(cust.display_version)}</span>`);
        content = content.replace(/Desenvolvido em Moçambique/g, escapeHtml(footer_text));
        content = content.replace(/Olá, Cliente/g, escapeHtml(greeting_text));
        content = content.replace(/Bem vindo a\s+TS\s+Community/gi, escapeHtml(licenseTitle));
        content = content.replace(/Bem-vindo a\s+TS\s+Community/gi, escapeHtml(licenseTitle));
        content = content.replace(/Ativar Licen[cç]a/g, escapeHtml(licenseTitle));
        content = content.replace(/Insira sua chave de licen[cç]a para desbloquear\./g, escapeHtml(licenseDescription));
        content = content.replace(/TS-X{8,}/g, escapeHtml(licensePlaceholder));
        content = content.replace(/Validar Licen[cç]a/g, escapeHtml(licenseButtonText));
        content = content.replace(/Aguardando sincronização\.\.\./g, (mode === 'popup' ? 'Sincronizando...' : 'Aguardando sincronização...')); // Optional tweak
        content = content.replace(/MZN/g, escapeHtml(currency_symbol));
        content = content.replace(/Master Lovable • v[\d.]+/g, `${escapeHtml(brand_kicker)} ${escapeHtml(brand_name)} • ${escapeHtml(cust.display_version)}`);
        // Force the greeting text in content.js even if not "Olá, Cliente"
        if (baseName(fileName) === "content.js") {
          const greetingVal = use_license_name ? "qlUserName || 'Usuário'" : `'${escapeJs(greeting_text)}'`;
          content = content.replace(/qlUserName\s*\|\|\s*"User"/g, greetingVal);
        }
        // Force status badge in content.js
        if (!show_greeting_badge) {
          content = content.replace(/<span class="ql-status-badge ql-badge-pro">PRO<\/span>/g, "");
          content = content.replace(/<span class="sp-status-badge sp-badge-pro">PRO<\/span>/g, "");
        } else {
          content = content.replace(/>PRO<\/span>/g, `>${escapeHtml(greeting_badge)}</span>`);
        }
        // Suporte: substitui qualquer link conhecido (WhatsApp, Discord, Telegram)
        content = content.replace(/href="https:\/\/wa\.me\/[^"]+"/g, `href="${escapeHtml(cust.support_url)}"`);
        content = content.replace(/href="https:\/\/discord\.gg\/[^"]+"/g, `href="${escapeHtml(cust.support_url)}"`);
        content = content.replace(/href="https:\/\/t\.me\/[^"]+"/g, `href="${escapeHtml(cust.support_url)}"`);

        // Comunidade: injeta um segundo link ao lado do "Suporte" quando configurado
        if (cust.community_url && cust.community_url.trim() !== "") {
          const cu = escapeHtml(cust.community_url.trim());
          content = content.replace(
            /(<a [^>]*class="sp-support-link"[^>]*>[\s\S]*?<\/a>)/,
            `$1\n    <a href="${cu}" target="_blank" class="sp-community-link" style="display:inline-flex;align-items:center;gap:6px;color:var(--ql-accent);text-decoration:none;font-size:12px;margin-left:8px">👥 Comunidade</a>`,
          );
        }

        if (cust.banner_enabled && cust.banner_url) {
          const bannerInner = `<img src="${escapeHtml(cust.banner_url)}" alt="" style="width:100%;display:block;border-radius:8px"/>`;
          const bannerHtml = cust.banner_link
            ? `<a href="${escapeHtml(cust.banner_link)}" target="_blank" rel="noopener" style="display:block;padding:8px 12px 0;text-decoration:none">${bannerInner}</a>`
            : `<div style="padding:8px 12px 0">${bannerInner}</div>`;
          // Insere o banner LOGO APÓS o fechamento da div.sp-header (regex robusta)
          content = content.replace(
            /(<div class="sp-header">[\s\S]*?<div class="sp-header-actions">[\s\S]*?<\/div>\s*<\/div>)/,
            `$1\n  <div class="sp-banner">${bannerHtml}</div>`
          );
        }
      }

      // Strings inline em JS/HTML
      if (fileName.endsWith(".js") || fileName.endsWith(".html")) {
        // Tema: escuro deve ser o padrão real. Valores antigos salvos como light não podem vencer
        // até o usuário tocar de novo no botão de tema dentro da extensão personalizada.
        content = content.replace(/chrome\.storage\.local\.get\(\["ql_license_valid","ql_license_key","ql_minimized","ql_height","ql_dark_mode","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_session_id"\]/g, 'chrome.storage.local.get(["ql_license_valid","ql_license_key","ql_minimized","ql_height","ql_dark_mode","ql_theme_user_choice","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_session_id"]');
        content = content.replace(/if\(res\.ql_dark_mode === false\)\s*\{\s*box\.classList\.add\("ql-light"\);\s*\}/g, 'if(res.ql_theme_user_choice === true && res.ql_dark_mode === false) { box.classList.add("ql-light"); } else { box.classList.remove("ql-light"); chrome.storage.local.set({ ql_dark_mode: true }); }');
        content = content.replace(/chrome\.storage\.local\.set\(\{ ql_dark_mode: !isLight \}\);/g, 'chrome.storage.local.set({ ql_dark_mode: !isLight, ql_theme_user_choice: true });');
        content = content.replace(/chrome\.storage\.local\.get\(\["ql_dark_mode"\], r => \{ if\(r\.ql_dark_mode === false\) document\.body\.classList\.add\('sp-light'\); \}\);/g, 'chrome.storage.local.get(["ql_dark_mode","ql_theme_user_choice"], r => { if(r.ql_theme_user_choice === true && r.ql_dark_mode === false) document.body.classList.add(\'sp-light\'); else { document.body.classList.remove(\'sp-light\'); chrome.storage.local.set({ ql_dark_mode: true }); } });');
        // Suporte: substitui também dentro de strings JS (ex.: content-templates.js)
        const jsLicenseTitle = escapeJsonStringContent(licenseTitle);
        const jsLicenseDescription = escapeJsonStringContent(licenseDescription);
        const jsLicensePlaceholder = escapeJsonStringContent(licensePlaceholder);
        const jsLicenseButtonText = escapeJsonStringContent(licenseButtonText);
        content = content.replace(/Bem vindo a\s+TS\s+Community/gi, jsLicenseTitle);
        content = content.replace(/Bem-vindo a\s+TS\s+Community/gi, jsLicenseTitle);
        content = content.replace(/Ativar Licen(?:ç|\\u00e7)c?a/g, jsLicenseTitle);
        content = content.replace(/Insira sua chave de licen(?:ç|\\u00e7)c?a para desbloquear\./g, jsLicenseDescription);
        content = content.replace(/TS-X{8,}/g, jsLicensePlaceholder);
        content = content.replace(/Validar Licen(?:ç|\\u00e7)c?a/g, jsLicenseButtonText);
        content = content.replace(/href=\\"https:\/\/discord\.gg\/[^"]+\\"/g, `href=\\"${escapeJs(cust.support_url)}\\"`);
        content = content.replace(/href=\\"https:\/\/wa\.me\/[^"]+\\"/g, `href=\\"${escapeJs(cust.support_url)}\\"`);
        content = content.replace(/href="https:\/\/discord\.gg\/[^"]+"/g, `href="${escapeJs(cust.support_url)}"`);
        content = content.replace(/href="https:\/\/wa\.me\/[^"]+"/g, `href="${escapeJs(cust.support_url)}"`);
        // Comunidade dentro do popup flutuante (content-templates.js): adiciona ao lado do Suporte
        if (cust.community_url && cust.community_url.trim() !== "" && baseName(fileName) === "content-templates.js") {
          const cu = escapeJs(cust.community_url.trim());
          content = content.replace(
            /('<a href="[^']*" target="_blank" class="ql-support-link">[\s\S]*?Suporte<\/a>')/,
            `$1 +\n      '<a href="${cu}" target="_blank" class="ql-community-link" style="display:inline-flex;align-items:center;gap:4px;color:var(--ql-accent);text-decoration:none;margin-left:8px">👥 Comunidade</a>'`,
          );
        }
        // Versões "🇲🇿 v4.2", "🇲🇿 v4.3" → display_version
        content = content.replace(/🇲🇿\s*v[\d.]+/g, `🇲🇿 ${cust.display_version}`);
        // "Extensão v4.3" no card de downloads
        content = content.replace(/Extensão\s+v[\d.]+/g, `Extensão ${cust.display_version}`);
        // Overlay "Protegido pelo Main/Master Lovable"
        content = content.replace(/Protegido pelo\s+(Main|Master)\s+Lovable/g, `Protegido pelo ${brand_name}`);
        // Badge PRO em strings JS
        content = content.replace(/sp-status-badge sp-badge-pro">PRO</g, `sp-status-badge sp-badge-pro">${escapeJs(greeting_badge)}<`);
      }

      // Fallback final: troca o nome literal da marca em qualquer arquivo de UI.
      // Aplicado por último para pegar ocorrências em strings JS embutidas.
      if (fileName.endsWith(".html") || fileName.endsWith(".js") || fileName.endsWith(".css")) {
        content = replaceLegacyBrandText(content, brand_name);
      }

      return content;
    };

    // 2) HTML/CSS/JS file processing with global asset renaming
    const filesToProcess = entries
      .filter(e => !e.directory && (e.filename.endsWith(".html") || e.filename.endsWith(".css") || e.filename.endsWith(".js") || e.filename.endsWith(".json")))
      .map(e => e.filename);

    for (const fileName of filesToProcess) {
      let content = await getFileText(fileName);
      if (!content) continue;

      // Apply asset renames
      content = content.replace(/assets\/logo-master-lovable\.png/g, logo1254Path);
      content = content.replace(/assets\/logo-master-lovable-square\.png/g, logo512Path);

      const mode = fileMode(fileName);

      // CSS: aplica cores corretas conforme modo (sidebar vs popup)
      if (fileName.endsWith(".css")) {
        content = transformCss(content, mode);
      }

      // Atalhos da Sidebar (sidepanel-templates.js)
      if (baseName(fileName) === "sidepanel-templates.js" && Array.isArray(cust.shortcuts) && cust.shortcuts.length > 0) {
        const arr = cust.shortcuts.map((s) =>
          `  { icon: SP_SVG.sparkles, label: '${escapeJs(s.label)}', prompt: '${escapeJs(s.prompt)}' }`
        ).join(",\n");
        const newArrBlock = `const SP_TEMPLATES = [\n${arr}\n];`;
        content = content.replace(/const SP_TEMPLATES\s*=\s*\[[\s\S]*?\];/, newArrBlock);
      }

      // Atalhos do Popup flutuante (content-templates.js)
      if (baseName(fileName) === "content-templates.js" && Array.isArray(cust.popup_shortcuts) && cust.popup_shortcuts.length > 0) {
        const arr = cust.popup_shortcuts.map((s) =>
          `  { icon: QL_SVG.sparkles, label: '${escapeJs(s.label)}', prompt: '${escapeJs(s.prompt)}' }`
        ).join(",\n");
        const newArrBlock = `const QL_TEMPLATES = [\n${arr}\n];`;
        content = content.replace(/const QL_TEMPLATES\s*=\s*\[[\s\S]*?\];/, newArrBlock);
      }

      // Aplica todas as substituições de marca/texto
      content = applyTextReplacements(content, fileName, mode);

      overrides.set(fileName, content);
    }

    // Build new ZIP
    const outBlob = new BlobWriter("application/zip");
    const writer = new ZipWriter(outBlob);

    const writtenEntries = new Set<string>();

    for (const entry of entries) {
      if (entry.directory) continue;
      if (entriesToRemove.has(entry.filename)) {
        console.log(`[build-zip] Removing entry: ${entry.filename}`);
        continue;
      }

      const override = overrides.get(entry.filename);
      if (override !== undefined) {
        if (typeof override === "string") {
          await writer.add(entry.filename, new TextReader(override));
        } else {
          await writer.add(entry.filename, new Uint8ArrayReader(override));
        }
        writtenEntries.add(entry.filename);
      } else {
        // copy original bytes
        const data = await entry.getData!(new Uint8ArrayWriter()) as Uint8Array;
        await writer.add(entry.filename, new Uint8ArrayReader(data));
        writtenEntries.add(entry.filename);
      }
    }
    for (const [path, override] of overrides.entries()) {
      if (writtenEntries.has(path)) continue;
      if (typeof override === "string") {
        await writer.add(path, new TextReader(override));
      } else {
        await writer.add(path, new Uint8ArrayReader(override));
      }
    }
    await reader.close();
    const finalBlob = await writer.close();
    const buf = new Uint8Array(await finalBlob.arrayBuffer());

    const filename = `${cust.manifest_name.replace(/[^a-z0-9]+/gi, "_")}_v${cust.display_version.replace(/^v/, "")}.zip`;

    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("[extension-build-zip] error", err);
    return new Response(JSON.stringify({ error: err?.message || "build failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
