// ============================================
// Main Lovable – HTML Templates (content)
// Separado da lógica de negócio (content.js)
// ============================================

const SVG_ICONS = {
  wrench: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  zap: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  msgSquare: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  trendUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  palette: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5"/><circle cx="17.5" cy="10.5" r="0.5"/><circle cx="8.5" cy="7.5" r="0.5"/><circle cx="6.5" cy="12" r="0.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  box: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  moon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
  mic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  headphones: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  sparkles: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  sidePanel: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

const PROMPT_TEMPLATES = [
  { icon: SVG_ICONS.wrench, label: "Bugs", prompt: "Analise o código e identifique todos os bugs, erros e falhas. Corrija cada um deles explicando o problema e a solução aplicada." },
  { icon: SVG_ICONS.edit, label: "Refatorar", prompt: "Elabore um plano completo de refatoração e otimização do sistema em etapas." },
  { icon: SVG_ICONS.shield, label: "Erros", prompt: "Implemente tratamento de erros robusto em todo o código, incluindo try/catch, validações e mensagens de erro amigáveis para o usuário." },
  { icon: SVG_ICONS.zap, label: "Otimizar", prompt: "Analise e otimize a performance do sistema, identificando gargalos, melhorando queries, reduzindo re-renders e aplicando boas práticas." },
  { icon: SVG_ICONS.msgSquare, label: "Comentários", prompt: "Adicione comentários claros e documentação em todo o código, explicando a lógica, parâmetros e retornos de cada função." },
  { icon: SVG_ICONS.trendUp, label: "SEO", prompt: "Monte um plano completo de criação e otimização de SEO para este site. Inclua: análise de meta tags (title, description, og:image), estrutura de headings (H1-H6), sitemap.xml, robots.txt, dados estruturados (JSON-LD), performance (Core Web Vitals), acessibilidade, URLs amigáveis, canonical tags, alt text em imagens, lazy loading, e estratégias de link building interno. Implemente todas as melhorias identificadas." },
  { icon: SVG_ICONS.palette, label: "UI", prompt: "Melhore a interface do usuário tornando-a mais moderna, responsiva e acessível, seguindo boas práticas de UX/UI." },
  { icon: SVG_ICONS.box, label: "Componentes", prompt: "Reorganize o código separando em componentes reutilizáveis, bem estruturados e com responsabilidades únicas." },
  { icon: SVG_ICONS.search, label: "Review", prompt: "Faça uma revisão completa do código identificando problemas de qualidade, segurança, performance e sugerindo melhorias." },
];

// ---- Template: License Gate ----
function templateLicenseGate(minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-dot"></span>' +
      '<span class="ql-title">Main Lovable</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<span class="ql-badge">v4.0</span>' +
      '<button id="ql-minimize" class="ql-minimize-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-license-gate">' +
      '<div class="ql-lock-icon">\ud83d\udd10</div>' +
      '<p class="ql-gate-title">Ativar Licen\u00e7a</p>' +
      '<p class="ql-gate-desc">Insira sua chave de licen\u00e7a para desbloquear.</p>' +
      '<div class="ql-field">' +
        '<input id="ql-license-input" placeholder="QL-XXXXXXXXXXXXXXXXXXXX" spellcheck="false">' +
      '</div>' +
      '<button id="ql-validate-btn">Validar Licen\u00e7a</button>' +
      '<div id="ql-license-log"></div>' +
      '<div class="ql-gate-divider"><span>ou</span></div>' +
      '<button id="ql-buy-license-btn" class="ql-buy-btn">\ud83d\uded2 Comprar Licen\u00e7a</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Main UI ----
function templateMainUI(greeting, statusBadge, minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand">\u26a1 Main Lovable</span>' +
      '<span class="ql-badge-pro-header">PRO</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button class="ql-icon-btn ql-notif-btn" title="Notifica\u00e7\u00f5es">' + SVG_ICONS.bell + '<span class="ql-notif-badge" style="display:none">0</span></button>' +
      '<button id="ql-sidepanel-btn" class="ql-icon-btn" title="Abrir no Painel Lateral">' + SVG_ICONS.sidePanel + '</button>' +
      '<button class="ql-icon-btn" title="Tema">' + SVG_ICONS.moon + '</button>' +
      '<button id="ql-logout-btn" class="ql-icon-btn" title="Sair">\ud83d\udeaa</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-profile-card">' +
      '<div class="ql-profile-top">' +
        '<div class="ql-profile-info">' +
          '<span class="ql-profile-name">' + escapeHtml(greeting) + '</span>' +
          statusBadge +
        '</div>' +
      '</div>' +
      '<div id="ql-sync-status" class="ql-sync-status ql-sync-waiting">' +
        '<span class="ql-sync-text">\u23f3 Aguardando sincroniza\u00e7\u00e3o...</span>' +
      '</div>' +
      '<div id="ql-trial-countdown" class="ql-trial-countdown" style="display:none"></div>' +
    '</div>' +
    '<!-- Tabs -->' +
    '<div class="ql-tabs" id="ql-tabs">' +
      '<button class="ql-tab ql-tab-active" data-tab="prompt">\u26a1 Prompt</button>' +
      '<button class="ql-tab" data-tab="history">\ud83d\udcac Hist\u00f3rico <span class="ql-tab-badge" id="ql-history-badge" style="display:none">0</span></button>' +
      '<button class="ql-tab" data-tab="downloads">\u2b07\ufe0f Downloads</button>' +
    '</div>' +
    '<div id="ql-tab-content">' +
    '<textarea id="ql-msg" rows="3" placeholder="Digite seu comando..." spellcheck="false"></textarea>' +
    '<div id="ql-attach-preview" class="ql-attach-preview" style="display:none"></div>' +
    '<div class="ql-action-bar">' +
      '<div class="ql-action-left">' +
        '<label class="ql-toggle">' +
          '<input type="checkbox" id="ql-modo-plano">' +
          '<span class="ql-toggle-slider"></span>' +
        '</label>' +
        '<span class="ql-toggle-label-inline">Modo Plano</span>' +
      '</div>' +
      '<div class="ql-action-center">' +
        '<button id="ql-attach-btn" class="ql-attach-btn" title="Anexar arquivo (m\u00e1x. 10)">\ud83d\udcce</button>' +
        '<button id="ql-optimize-btn" class="ql-tool-btn" title="Otimizar com IA">' + SVG_ICONS.sparkles + '</button>' +
        '<button id="ql-speech-btn" class="ql-tool-btn" title="Voz para texto">' + SVG_ICONS.mic + '</button>' +
      '</div>' +
      '<div class="ql-action-right-send">' +
        '<button id="ql-send" class="ql-send-btn">Enviar</button>' +
      '</div>' +
    '</div>' +
    '<input type="file" id="ql-file-input" multiple style="display:none" accept="*/*">' +
    '<div id="ql-log"></div>' +
    '<div class="ql-shortcuts-section">' +
      '<span class="ql-shortcuts-title">ATALHOS R\u00c1PIDOS</span>' +
      '<div class="ql-shortcuts-grid" id="ql-chips"></div>' +
    '</div>' +
    '<button id="ql-remove-watermark" class="ql-watermark-btn">\ud83d\udeab Remover Marca de \u00c1gua</button>' +
    '<button id="ql-shield-btn" class="ql-shield-btn">' +
      SVG_ICONS.shield + ' <span id="ql-shield-label">Ativar Escudo</span>' +
    '</button>' +
    '<button id="ql-native-chat-btn" class="ql-native-chat-btn">' +
      SVG_ICONS.msgSquare + ' Usar Chat Padr\u00e3o' +
    '</button>' +
    '</div>' +
  '<div id="ql-footer" class="ql-footer">' +
    '<div class="ql-footer-row">' +
      '<a href="https://discord.gg/ts6HQFy7y5" target="_blank" class="ql-support-link">' + SVG_ICONS.headphones + ' Suporte</a>' +
      '<span class="ql-footer-version">v4.0</span>' +
    '</div>' +
    '<span class="ql-badge-mz">\ud83c\uddf2\ud83c\uddff Desenvolvido em Mo\u00e7ambique</span>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>' +
  '<!-- Notifications Panel -->' +
  '<div id="ql-notif-panel" class="ql-notif-panel" style="display:none">' +
    '<div class="ql-notif-header">' +
      '<span>Notifica\u00e7\u00f5es</span>' +
      '<button id="ql-notif-close" class="ql-notif-close-btn">\u2715</button>' +
    '</div>' +
    '<div id="ql-notif-list" class="ql-notif-list">' +
      '<p class="ql-notif-empty">Carregando...</p>' +
    '</div>' +
  '</div>' +
  '<!-- Custom Alert -->' +
  '<div id="ql-custom-alert" class="ql-custom-alert" style="display:none">' +
    '<div class="ql-alert-content">' +
      '<div class="ql-alert-icon">\u2705</div>' +
      '<div class="ql-alert-title">Sucesso!</div>' +
      '<div class="ql-alert-message"></div>' +
      '<button class="ql-alert-ok-btn">OK</button>' +
    '</div>' +
  '</div>';
}

// ---- Template: Expired License Overlay ----
function templateExpiredOverlay() {
  return '<div class="ql-sweetalert-box">' +
    '<div class="ql-sweetalert-icon">\u23f0</div>' +
    '<h2 class="ql-sweetalert-title">Licen\u00e7a Expirada!</h2>' +
    '<p class="ql-sweetalert-text">O prazo da sua licen\u00e7a terminou. Renove agora para continuar.</p>' +
    '<div class="ql-sweetalert-actions">' +
      '<button class="ql-sweetalert-btn ql-sweetalert-btn-primary" id="ql-sweetalert-renew">\ud83d\uded2 Renovar Agora</button>' +
      '<button class="ql-sweetalert-btn ql-sweetalert-btn-secondary" id="ql-sweetalert-close">Fechar</button>' +
    '</div>' +
  '</div>';
}

// ---- Template: Payment UI (packages list) ----
function templatePaymentUI(minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand">\u26a1 Main Lovable</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button id="ql-pay-back" class="ql-icon-btn" title="Voltar">\u2190</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-pay-section">' +
      '<div class="ql-pay-title">Escolha seu Plano</div>' +
      '<div id="ql-packages-list" class="ql-packages-list">' +
        '<div class="ql-pay-loading">\u23f3 Carregando planos...</div>' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Package Card ----
function templatePackageCard(pkg) {
  const popular = pkg.is_popular ? '<span class="ql-pkg-popular">⭐ POPULAR</span>' : '';
  const duration = pkg.duration_days ? escapeHtml(String(pkg.duration_days)) + ' dias' : 'Permanente';
  const features = (pkg.features || []).map(function(f) { return '<li>' + escapeHtml(f) + '</li>'; }).join('');
  return '<div class="ql-pkg-card' + (pkg.is_popular ? ' ql-pkg-highlight' : '') + '" data-pkg-id="' + escapeHtml(pkg.id) + '" data-pkg-name="' + escapeHtml(pkg.name) + '" data-pkg-price="' + escapeHtml(String(pkg.price)) + '">' +
    popular +
    '<div class="ql-pkg-name">' + escapeHtml(pkg.name) + '</div>' +
    '<div class="ql-pkg-price">' + escapeHtml(String(pkg.price)) + ' <span>MZN</span></div>' +
    '<div class="ql-pkg-duration">' + duration + '</div>' +
    '<ul class="ql-pkg-features">' + features + '</ul>' +
    '<button class="ql-pkg-select-btn">Selecionar</button>' +
  '</div>';
}

// ---- Template: Checkout Screen ----
function templateCheckoutScreen(pkg, minimized) {
  return '<div id="ql-header">' +
    '<div class="ql-header-left">' +
      '<span class="ql-brand">\u26a1 Pagamento</span>' +
    '</div>' +
    '<div class="ql-header-right">' +
      '<button id="ql-checkout-back" class="ql-icon-btn" title="Voltar">\u2190</button>' +
      '<button id="ql-minimize" class="ql-icon-btn">' + (minimized ? '\u25a1' : '\u2212') + '</button>' +
    '</div>' +
  '</div>' +
  '<div id="ql-body">' +
    '<div class="ql-pay-section">' +
      '<div class="ql-selected-pkg">\ud83d\udce6 <strong>' + escapeHtml(pkg.name) + '</strong> \u2014 ' + escapeHtml(String(pkg.price)) + ' MZN</div>' +
      '<div class="ql-pay-field">' +
        '<label>M\u00e9todo de Pagamento</label>' +
        '<div class="ql-pay-methods">' +
          '<button class="ql-method-btn ql-method-active" data-method="mpesa">' +
            '<span class="ql-method-icon">\ud83d\udcf1</span> M-Pesa' +
          '</button>' +
          '<button class="ql-method-btn" data-method="emola">' +
            '<span class="ql-method-icon">\ud83d\udcb3</span> e-Mola' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="ql-pay-field">' +
        '<label>N\u00famero de Telefone</label>' +
        '<input type="tel" id="ql-pay-phone" placeholder="84/85/86/87XXXXXXX" maxlength="9" spellcheck="false">' +
        '<span class="ql-pay-hint" id="ql-phone-hint">M-Pesa: 84 ou 85 | e-Mola: 86 ou 87</span>' +
      '</div>' +
      '<button id="ql-confirm-pay" class="ql-confirm-pay-btn">\ud83d\udcb0 Pagar ' + escapeHtml(String(pkg.price)) + ' MZN</button>' +
      '<div id="ql-pay-log" class="ql-pay-log"></div>' +
    '</div>' +
  '</div>' +
  '<div id="ql-resize-handle" class="ql-resize-handle"></div>';
}

// ---- Template: Payment Success ----
function templatePaymentSuccess(licenseKey) {
  return '<div class="ql-pay-section" style="text-align:center;padding:24px 16px">' +
    '<div style="font-size:48px;margin-bottom:12px">🎉</div>' +
    '<div class="ql-pay-title">Pagamento Confirmado!</div>' +
    '<p style="color:var(--ql-muted);font-size:12px;margin:8px 0 16px">Sua licença foi ativada com sucesso.</p>' +
    '<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:12px">' +
      '<p style="font-size:10px;color:var(--ql-muted);margin-bottom:4px">Sua chave de licença</p>' +
      '<p id="ql-new-key" style="font-family:monospace;font-size:13px;color:var(--ql-accent);font-weight:600;word-break:break-all">' + escapeHtml(licenseKey) + '</p>' +
    '</div>' +
    '<button id="ql-copy-key" class="ql-confirm-pay-btn" style="margin-bottom:8px">📋 Copiar Chave</button>' +
    '<p style="font-size:10px;color:var(--ql-muted);margin-bottom:12px">Cole a chave acima para ativar a extensão.</p>' +
    '<button id="ql-activate-key" class="ql-buy-btn" style="font-size:12px">🔑 Ativar Agora</button>' +
  '</div>';
}

// ---- Template: Downloads View ----
function templateDownloadsView() {
  return '<div class="ql-downloads-container">' +
    '<div class="ql-downloads-header">' +
      '<span class="ql-downloads-title">Recursos Disponíveis</span>' +
      '<p class="ql-downloads-desc">Baixe arquivos e extensões personalizadas.</p>' +
    '</div>' +
    '<div class="ql-downloads-list" id="ql-downloads-list">' +
      '<div class="ql-download-card">' +
        '<div class="ql-download-icon">📦</div>' +
        '<div class="ql-download-info">' +
          '<span class="ql-download-name">Extensão Premium v4.3</span>' +
          '<span class="ql-download-meta">Arquivo .zip • 1.2 MB</span>' +
        '</div>' +
        '<button class="ql-download-btn" data-dl-url="https://ynvrijkuampxpsmshftm.supabase.co/storage/v1/object/public/extensions/premium-v4.3.zip">' + SVG_ICONS.download + '</button>' +
      '</div>' +
      '<div class="ql-download-card">' +
        '<div class="ql-download-icon">📑</div>' +
        '<div class="ql-download-info">' +
          '<span class="ql-download-name">Guia de Prompts PRO</span>' +
          '<span class="ql-download-meta">PDF • 450 KB</span>' +
        '</div>' +
        '<button class="ql-download-btn" data-dl-url="https://ynvrijkuampxpsmshftm.supabase.co/storage/v1/object/public/extensions/guia-prompts.pdf">' + SVG_ICONS.download + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

