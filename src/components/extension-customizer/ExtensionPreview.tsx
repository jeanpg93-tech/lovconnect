import { CSSProperties } from "react";

export type ExtCustomization = {
  brand_kicker: string;
  brand_name: string;
  brand_badge: string;
  header_badge_text?: string;
  greeting_badge_text?: string;
  display_version: string;
  window_title?: string;
  manifest_name?: string;
  manifest_description?: string;
  support_url?: string;
  color_primary: string;
  color_primary_hover: string;
  color_secondary: string;
  color_bg: string;
  color_bg_elevated: string;
  color_bg_surface: string;
  color_wave_deep?: string;
  color_wave_navy?: string;
  color_wave_blue?: string;
  color_wave_azure?: string;
  color_wave_cyan?: string;
  color_wave_ice?: string;
  logo_rect_url?: string | null;
  logo_square_url?: string | null;
  icon_16_url?: string | null;
  icon_32_url?: string | null;
  icon_48_url?: string | null;
  icon_128_url?: string | null;
  banner_enabled?: boolean;
  banner_url?: string | null;
  banner_link?: string | null;
  history_enabled?: boolean;
  shortcuts: { label: string; prompt: string }[];
  greeting_text?: string;
  use_license_name?: boolean;
  currency_symbol?: string;
  footer_text?: string;
  show_greeting_badge?: boolean;
  color_success?: string;
  card_border_color?: string;
  card_border_hover_color?: string;
  card_bg_color?: string;
  card_text_color?: string;
  card_muted_text_color?: string;
  license_title?: string;
  license_description?: string;
  license_placeholder?: string;
  license_button_text?: string;
  license_buy_button_text?: string;
  license_extra_buttons?: { label: string; url: string }[];
  license_emoji?: string;
  license_emoji_size?: number;
  
  // Popup specific fields
  popup_brand_kicker?: string;
  popup_brand_name?: string;
  popup_brand_badge?: string;
  popup_window_title?: string;
  popup_color_primary?: string;
  popup_color_primary_hover?: string;
  popup_color_secondary?: string;
  popup_color_bg?: string;
  popup_color_bg_elevated?: string;
  popup_color_bg_surface?: string;
  popup_color_wave_deep?: string;
  popup_color_wave_navy?: string;
  popup_color_wave_blue?: string;
  popup_color_wave_azure?: string;
  popup_color_wave_cyan?: string;
  popup_color_wave_ice?: string;
  popup_history_enabled?: boolean;
  popup_shortcuts?: { label: string; prompt: string }[];
  popup_logo_rect_url?: string | null;
  popup_logo_square_url?: string | null;
  popup_use_license_name?: boolean;
  popup_header_badge_text?: string;
  popup_greeting_badge_text?: string;
  popup_greeting_text?: string;
  popup_currency_symbol?: string;
  popup_footer_text?: string;
  popup_show_greeting_badge?: boolean;
  popup_card_border_color?: string;
  popup_card_border_hover_color?: string;
  popup_card_bg_color?: string;
  popup_card_text_color?: string;
  popup_card_muted_text_color?: string;
};

function LovaxLogo({ src, large = false }: { src?: string | null; large?: boolean }) {
  if (src) {
    return (
      <img
        src={src}
        alt="Logo da extensão"
        className={large ? "h-20 w-20 object-contain" : "h-8 w-8 object-contain"}
      />
    );
  }

  return (
    <div
      className={large ? "grid h-20 w-20 place-items-center rounded-full text-4xl font-black italic" : "grid h-8 w-8 place-items-center rounded-full text-lg font-black italic"}
      style={{
        background: "radial-gradient(circle at 35% 25%, #ff5c5c, #b00000 48%, #111 52%, #3a3a3a 76%, #ff1010)",
        color: "#ff1010",
        textShadow: "0 1px 0 #fff, 0 0 10px rgba(255,16,16,.75)",
        boxShadow: "0 0 22px rgba(255,16,16,.32)",
      }}
    >
      LC
    </div>
  );
}

function LovaxHeader({ c, logo }: { c: ExtCustomization; logo?: string | null }) {
  return (
    <div className="flex h-[62px] shrink-0 items-center gap-2 border-b border-red-500/10 bg-[#141416] px-4">
      <LovaxLogo src={logo} />
      <div className="text-[15px] font-extrabold text-[#ff1010]">{c.brand_name || "LovConnect"}</div>
      <span className="ml-1 rounded-md bg-[#ff1010] px-2 py-0.5 text-[10px] font-black text-white shadow-[0_0_14px_rgba(255,16,16,.55)]">
        {(c.header_badge_text || c.brand_badge || "PRO").toUpperCase()}
      </span>
    </div>
  );
}

function LovaxPreview({
  c,
  mode,
  onModeChange,
  showLicense,
}: {
  c: ExtCustomization;
  mode: "sidebar" | "popup";
  onModeChange?: (mode: "sidebar" | "popup") => void;
  showLicense?: boolean;
}) {
  const accent = c.color_primary || "#ff1010";
  const version = c.display_version || "5.3";
  const logo = c.logo_square_url || c.logo_rect_url;
  const shortcuts = (c.shortcuts?.length ? c.shortcuts : []).slice(0, 8);
  const badge = c.greeting_badge_text || c.brand_badge || "PRO";

  return (
    <div
      className="ext-preview-container overflow-hidden rounded-xl border border-red-500/10 font-sans shadow-2xl"
      style={{ width: 390, height: showLicense ? 820 : 760, background: "#070707", color: "#f8fafc" }}
    >
      <div className="relative flex h-full flex-col bg-[#070707]">
        <LovaxHeader c={c} logo={logo} />

        {showLicense ? (
          <div className="flex flex-1 flex-col px-14 pb-4 pt-28 text-center">
            <div className="mx-auto mb-7">
              <LovaxLogo src={logo} large />
            </div>
            <h3 className="text-[20px] font-black leading-tight text-white">
              Bem vindo a <span style={{ color: accent }}>TS Community</span>
            </h3>
            <p className="mt-2 text-[15px] text-slate-300">{c.license_description || "Insira sua chave de licença para desbloquear."}</p>
            <div className="mt-6 rounded-lg border border-white/10 bg-[#1b1b1f] px-4 py-3 text-left font-mono text-[15px] text-slate-400">
              {c.license_placeholder || "TS-XXXXXXXXXXXXXXXXXXXXXX"}
            </div>
            <button className="mt-3 rounded-lg py-3 text-[15px] font-black text-white shadow-[0_0_26px_rgba(255,16,16,.32)]" style={{ background: accent }}>
              {c.license_button_text || "Validar Licença"}
            </button>
            <div className="mt-5 space-y-3 text-left">
              {[
                ["🔑", "Adquirir licença", "Adquira sua licença de forma rá..."],
                ["💬", "Entrar na comunidade", "Participe da comunidade exclusi..."],
                ["🎧", "Obter suporte", "Fale com nossa equipe e tire sua..."],
              ].map(([icon, title, desc]) => (
                <div key={title} className="flex items-center gap-3 rounded-xl border border-red-500/35 bg-red-950/20 p-3 text-[#ff1010]">
                  <div className="grid h-10 w-10 place-items-center rounded-lg border border-red-500/50">{icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-black">{title}</div>
                    <div className="truncate text-[12px]">{desc}</div>
                  </div>
                  <span className="text-lg">›</span>
                </div>
              ))}
            </div>
            <div className="mt-auto border-t border-red-500/10 pt-4">
              <span className="rounded-full border border-red-500/70 px-5 py-2 text-[12px] font-black text-[#ff1010]">
                {c.footer_text || "Desenvolvido por LovConnect"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden px-4 pb-0 pt-5">
            <div className="rounded-xl border border-white/10 bg-[#1b1b1f] p-4 shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[16px] font-black">Jean <span className="rounded-md border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">{badge}</span></div>
                  <div className="mt-3 truncate text-[14px] font-bold text-emerald-400">✅ Sincronizado! Projeto: 196668...</div>
                </div>
                <div className="flex gap-4 text-[16px]" style={{ color: accent }}><span>☾</span><span>?</span><span>▯</span><span>↗</span></div>
              </div>
              <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-900/35 px-5 py-5 text-center">
                <div className="text-xl text-emerald-300">∞</div>
                <div className="mt-1 text-[14px] font-black tracking-[0.18em] text-emerald-300">VITALÍCIO</div>
                <div className="mt-1 text-[13px] text-slate-300">Acesso sem expiração</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl bg-[#151518] text-[14px] font-bold text-slate-500">
              <div className="border-b-2 px-4 py-3" style={{ borderColor: accent, background: "rgba(255,16,16,.16)", color: accent }}>↯ Prompt</div>
              <div className="px-4 py-3">☆ Skills</div>
              <div className="px-4 py-3">▱ Histórico <span className="rounded-full px-1.5 text-white" style={{ background: accent }}>7</span></div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {shortcuts.map((s, i) => (
                <button key={`${s.label}-${i}`} className="h-[84px] rounded-xl border bg-red-950/25 px-1 text-[11px] font-bold text-slate-200" style={{ borderColor: accent }}>
                  <div className="mx-auto mb-2 grid h-8 w-8 place-items-center rounded-full bg-red-500/20 text-lg">{["🛠️", "♻️", "🎨", "🖥️", "⚡", "🛡️", "🧪", "🧮"][i] || "⚡"}</div>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex-1 rounded-t-2xl border border-b-0 bg-[#18181b] p-4" style={{ borderColor: accent }}>
              <div className="text-[16px] text-slate-500">O que vamos criar hoje?</div>
              <div className="mt-auto flex h-full flex-col justify-end">
                <div className="mb-8 border-t border-white/10 pt-3">
                  <div className="flex flex-wrap items-center gap-2 text-slate-400">
                    {['📎', '🎙️', '🛡️', '▱', '👁️', '⇩', '⚡'].map((i) => <span key={i} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5">{i}</span>)}
                    <button className="ml-auto grid h-12 w-12 place-items-center rounded-full text-2xl text-white shadow-[0_0_20px_rgba(255,16,16,.45)]" style={{ background: accent }}>➜</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!showLicense && (
          <div className="flex shrink-0 items-center justify-between border-t border-red-500/10 px-4 py-2 text-[10px] text-slate-400">
            <button onClick={() => onModeChange?.(mode === "popup" ? "sidebar" : "popup")}>◀ Popup</button>
            <span style={{ color: accent }}>Suporte</span>
            <span>{version}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ExtensionPreview({ 
  c, 
  mode = "sidebar", 
  onModeChange,
  showLicense = false,
  extensionMethod,
}: { 
  c: ExtCustomization; 
  mode?: "sidebar" | "popup";
  onModeChange?: (mode: "sidebar" | "popup") => void;
  showLicense?: boolean;
  extensionMethod?: "flow" | "lovax" | null;
}) {
  const isPopup = mode === "popup";
  const isLovax = extensionMethod === "lovax";
  const shouldShowLicense = showLicense && !isLovax;

  // Use popup specific values if in popup mode and they exist, otherwise fall back to main values
  const brand_kicker = (isPopup && c.popup_brand_kicker) || c.brand_kicker;
  const brand_name = (isPopup && c.popup_brand_name) || c.brand_name;
  const brand_badge = (isPopup && c.popup_header_badge_text) || c.header_badge_text || c.brand_badge;
  const greeting_badge = (isPopup && c.popup_greeting_badge_text) || c.greeting_badge_text || c.brand_badge;
  
  const color_primary = (isPopup && c.popup_color_primary) || c.color_primary;
  const color_primary_hover = (isPopup && c.popup_color_primary_hover) || c.color_primary_hover;
  const color_secondary = (isPopup && c.popup_color_secondary) || c.color_secondary;
  const color_bg = (isPopup && c.popup_color_bg) || c.color_bg;
  const color_bg_elevated = (isPopup && c.popup_color_bg_elevated) || c.color_bg_elevated;
  const color_bg_surface = (isPopup && c.popup_color_bg_surface) || c.color_bg_surface;

  const cyan = (isPopup && c.popup_color_wave_cyan) || c.color_wave_cyan || "#4ddfff";
  const azure = (isPopup && c.popup_color_wave_azure) || c.color_wave_azure || "#168cff";
  const navy = (isPopup && c.popup_color_wave_navy) || c.color_wave_navy || "#06205f";
  const deep = (isPopup && c.popup_color_wave_deep) || c.color_wave_deep || "#041436";
  const ice = (isPopup && c.popup_color_wave_ice) || c.color_wave_ice || "#f8fbff";
  const blue = (isPopup && c.popup_color_wave_blue) || c.color_wave_blue || "#0b63ce";

  const history_enabled = isPopup ? (c.popup_history_enabled !== false) : (c.history_enabled !== false);
  const shortcuts = (isPopup && c.popup_shortcuts) || c.shortcuts;
  const logo_rect = (isPopup && c.popup_logo_rect_url) || c.logo_rect_url;
  
  const greeting_text = (isPopup && c.popup_greeting_text) || c.greeting_text || "Olá, Cliente";
  const use_license_name = isPopup ? (c.popup_use_license_name !== false) : (c.use_license_name !== false);
  const currency_symbol = (isPopup && c.popup_currency_symbol) || c.currency_symbol || "MZN";
  const footer_text = (isPopup && c.popup_footer_text) || c.footer_text || "Desenvolvido em Moçambique";
  const show_greeting_badge = isPopup ? (c.popup_show_greeting_badge !== false) : (c.show_greeting_badge !== false);
  const color_success = c.color_success || "#34d399";

  const vars = {
    "--ql-accent": color_primary,
    "--ql-accent-hover": color_primary_hover,
    "--ql-secondary": color_secondary,
    "--ql-bg": color_bg,
    "--ql-bg-elevated": color_bg_elevated,
    "--ql-bg-surface": (isPopup && c.popup_card_bg_color) || c.card_bg_color || color_bg_surface,
    "--ml-deep": deep,
    "--ml-navy": navy,
    "--ml-blue": blue,
    "--ml-azure": azure,
    "--ml-cyan": cyan,
    "--ml-ice": ice,
    "--xp-text": (isPopup && c.popup_card_text_color) || c.card_text_color || "#f4f4f5",
    "--xp-muted": (isPopup && c.popup_card_muted_text_color) || c.card_muted_text_color || "#a1a1aa",
    "--xp-border": (isPopup && c.popup_card_border_color) || c.card_border_color || "rgba(255,255,255,0.06)",
    "--xp-border-hover": (isPopup && c.popup_card_border_hover_color) || c.card_border_hover_color || "rgba(255,255,255,0.12)",
  } as CSSProperties;

  if (isLovax) {
    return (
      <LovaxPreview
        c={c}
        mode={mode}
        onModeChange={onModeChange}
        showLicense={showLicense}
      />
    );
  }

  return (
    <div
      className={`ext-preview-container rounded-2xl overflow-hidden flex flex-col font-[Inter,system-ui,sans-serif] transition-all duration-300 ${isPopup ? 'scale-95 shadow-primary/20 border' : ''}`}
      style={{
        ...vars,
        background: "var(--ql-bg)",
        color: "var(--xp-text)",
        borderColor: "var(--xp-border)",
        width: 360,
        height: isPopup ? 580 : 620,
        position: "relative"
      }}
    >
      <style>{`
        .ext-preview-container .glass-card {
          transition: all 0.2s ease-in-out;
        }
        .ext-preview-container .glass-card:hover {
          border-color: var(--xp-border-hover) !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
      `}</style>
      {/* Wave Effect Background Sim */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background: `
            radial-gradient(circle at 14% -8%, color-mix(in srgb, var(--ml-cyan), transparent 80%), transparent 34%), 
            radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--ml-azure), transparent 85%), transparent 32%), 
            linear-gradient(145deg, transparent, color-mix(in srgb, var(--ml-navy), transparent 70%) 52%, transparent)
          `
        }}
      />
      
      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ background: "var(--ql-bg-elevated)", borderColor: "var(--xp-border)" }}
        >
          <div className="flex items-center gap-2">
            {!isPopup && (
              logo_rect ? (
                <img src={logo_rect} alt="" className="h-6 w-6 rounded object-cover" />
              ) : (
                <div
                  className="h-6 w-6 rounded"
                  style={{ background: `linear-gradient(135deg, var(--ql-accent), var(--ql-secondary))` }}
                />
              )
            )}
            {isPopup && <span className="text-[14px]"></span>}
            <div className="leading-tight">
              {!isPopup && <div className="text-[10px]" style={{ color: "var(--xp-muted)" }}>{brand_kicker}</div>}
              <div className="text-[14px] font-bold tracking-tight">
                {brand_name}
              </div>
            </div>
            <span
              className="text-[9px] font-extrabold px-2 py-0.5 rounded-md text-white tracking-widest"
              style={{ background: `linear-gradient(135deg, var(--ql-accent), var(--ql-secondary))` }}
            >
              {brand_badge}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isPopup && (
              <button 
                onClick={() => onModeChange?.("sidebar")}
                className="w-7 h-7 rounded-lg grid place-items-center text-[12px] hover:bg-white/5 transition-colors"
                style={{ color: "var(--xp-muted)" }}
                title="Abrir no Painel Lateral"
              >
                🔲
              </button>
            )}
            <button 
              className="w-8 h-8 rounded-xl grid place-items-center transition-all hover:bg-red-500/10 group"
              style={{ color: "rgba(239, 68, 68, 0.7)" }}
              title="Sair"
            >
              <span className="text-[16px] group-hover:scale-110 transition-transform">🚪</span>
            </button>
            {isPopup && <span className="w-7 h-7 rounded-lg grid place-items-center text-[12px]" style={{ color: "var(--xp-muted)" }}>−</span>}
          </div>
        </div>

        {/* Banner */}
        {c.banner_enabled && c.banner_url && !isPopup && (
          <div className="px-3 pt-2 shrink-0">
            <img src={c.banner_url} alt="" className="w-full rounded-md object-cover max-h-20" />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-3 flex flex-col">
          {shouldShowLicense ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-10 animate-in fade-in zoom-in duration-300">
              {c.license_emoji && (
                <div 
                  className="grid place-items-center"
                  style={{ 
                    width: (c.license_emoji_size || 64),
                    height: (c.license_emoji_size || 64)
                  }}
                >
                  <span style={{ fontSize: (c.license_emoji_size || 64) }}>{c.license_emoji}</span>
                </div>
              )}
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold tracking-tight" style={{ color: "var(--xp-text)" }}>
                  {c.license_title || "Ativar Licença"}
                </h3>
                <p className="text-[12px] px-6" style={{ color: "var(--xp-muted)" }}>
                  {c.license_description || "Insira sua chave de licença para desbloquear."}
                </p>
              </div>

              <div className="w-full space-y-4">
                <div 
                  className="rounded-xl border p-3 font-mono text-sm text-center"
                  style={{ background: "var(--ql-bg-surface)", borderColor: "var(--xp-border)", color: "var(--xp-muted)" }}
                >
                  {c.license_placeholder || "QL-XXXXXXXXXXXXXXXXXXXX"}
                </div>
                
                <button
                  className="w-full py-3 rounded-xl text-[14px] font-bold text-white shadow-lg transition-all active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, var(--ql-accent), var(--ql-secondary))`,
                  }}
                >
                  {c.license_button_text || "Validar Licença"}
                </button>

                {((c.license_extra_buttons && c.license_extra_buttons.length > 0) || c.license_buy_button_text) && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-[1px]" style={{ background: "var(--xp-border)" }} />
                    <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--xp-muted)" }}>ou</span>
                    <div className="flex-1 h-[1px]" style={{ background: "var(--xp-border)" }} />
                  </div>
                )}

                {c.license_extra_buttons && c.license_extra_buttons.length > 0 && (
                  c.license_extra_buttons.map((btn, idx) => (
                    <button
                      key={idx}
                      className="w-full py-3 rounded-xl text-[13px] font-bold border transition-all active:scale-95 flex items-center justify-center gap-2 mb-2"
                      style={{
                        borderColor: "var(--xp-border)",
                        background: "rgba(255,255,255,0.02)",
                        color: "var(--xp-text)"
                      }}
                    >
                      {btn.label}
                    </button>
                  ))
                )}
                
                {c.license_buy_button_text && (
                  <button
                    className="w-full py-3 rounded-xl text-[13px] font-bold border transition-all active:scale-95 flex items-center justify-center gap-2 mb-2"
                    style={{
                      borderColor: "var(--xp-border)",
                      background: "rgba(255,255,255,0.02)",
                      color: "var(--xp-text)"
                    }}
                  >
                    {c.license_buy_button_text}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Tabs preview */}
          <div className="flex items-center gap-1 border-b pb-2" style={{ borderColor: "var(--xp-border)" }}>
            <span className="text-[10px] font-semibold px-2 py-1 rounded" style={{ background: "var(--ql-bg-surface)" }}>Prompt</span>
            {history_enabled && (
              <span className="text-[10px] font-semibold px-2 py-1 rounded" style={{ color: "var(--xp-muted)" }}>💬 Histórico</span>
            )}
            <span className="text-[10px] font-semibold px-2 py-1 rounded" style={{ color: "var(--xp-muted)" }}>📥 Downloads</span>
          </div>

          {/* Profile card */}
          <div
            className="glass-card rounded-xl border p-3 cursor-pointer"
            style={{ background: "var(--ql-bg-surface)", borderColor: "var(--xp-border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold">{use_license_name ? "Olá, Usuário" : greeting_text}</span>
              {show_greeting_badge && (
                <span
                  className="text-[9px] font-extrabold px-2 py-0.5 rounded"
                  style={{ background: `${color_success}1a`, color: color_success }}
                >
                  {greeting_badge}
                </span>
              )}
            </div>
            <div className="text-[11px] mt-1" style={{ color: color_success }}>✓ Sincronizado</div>
          </div>

          {/* Textarea */}
          <textarea
            rows={3}
            placeholder="Digite seu comando..."
            readOnly
            className="w-full rounded-lg border px-3 py-2 text-[12px] outline-none resize-none"
            style={{
              background: "var(--ql-bg-surface)",
              borderColor: "var(--xp-border)",
              color: "var(--xp-text)",
            }}
          />

          {/* Action bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px]" style={{ color: "var(--xp-muted)" }}>Plano</span>
              <div
                className="w-7 h-4 rounded-full p-0.5"
                style={{ background: "var(--ql-accent)" }}
              >
                <div className="w-3 h-3 rounded-full bg-white ml-auto" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-7 h-7 rounded border grid place-items-center text-[12px]" style={{ borderColor: "var(--xp-border)" }}>📎</span>
              <span className="w-7 h-7 rounded border grid place-items-center text-[12px]" style={{ borderColor: "var(--xp-border)" }}>✨</span>
              <span className="w-7 h-7 rounded border grid place-items-center text-[12px]" style={{ borderColor: "var(--xp-border)" }}>🎙️</span>
            </div>
            <button
              className="px-4 py-2 rounded-lg text-[12px] font-bold text-white ml-auto"
              style={{
                background: `linear-gradient(135deg, var(--ql-accent), var(--ql-secondary))`,
              }}
            >
              Enviar
            </button>
          </div>

          {/* Shortcuts */}
          <div className="pt-1">
            <div
              className="text-[9px] font-extrabold tracking-[0.15em] mb-2 text-center"
              style={{ color: "var(--xp-muted)" }}
            >
              ATALHOS RÁPIDOS
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {shortcuts.slice(0, 9).map((s, i) => (
                <button
                  key={i}
                  className="glass-card rounded-lg border px-2 py-2 text-[10px] font-semibold truncate transition-all"
                  style={{
                    background: "var(--ql-bg-surface)",
                    borderColor: "var(--xp-border)",
                    color: "var(--xp-text)",
                  }}
                  title={s.prompt}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <button 
            className="w-full py-2.5 rounded-xl text-[12px] font-bold text-white mt-2"
            style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}
          >
            🚫 Remover Marca de Água
          </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-3 py-2 border-t text-[10px] shrink-0"
          style={{ background: "var(--ql-bg-elevated)", borderColor: "var(--xp-border)", color: "var(--xp-muted)" }}
        >
          {isPopup ? (
             <div className="flex items-center justify-between w-full">
                <span style={{ color: "var(--ql-accent)" }}>🎧 Suporte</span>
                <span>v4.3</span>
             </div>
          ) : (
            <>
              <button 
                onClick={() => onModeChange?.("popup")}
                className="flex items-center gap-1 hover:text-white transition-colors"
              >
                ◀ Popup
              </button>
              <span style={{ color: "var(--ql-accent)" }}>Suporte</span>
              <span>{c.display_version}</span>
            </>
          )}
        </div>
        {isPopup && (
          <div className="px-3 py-1.5 bg-black/20 text-[9px] text-center" style={{ color: "var(--xp-muted)" }}>
             🇲🇿 {footer_text}
          </div>
        )}
      </div>
    </div>
  );
}