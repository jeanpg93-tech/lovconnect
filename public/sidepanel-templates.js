// ============================================================
// Main Lovable - Side Panel Templates (Static/HTML)
// Separado da lógica de negócio para facilitar manutenção
// ============================================================

const SP_SVG = {
  sparkles: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  mic: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  wrench: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  edit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  shield: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  zap: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  msgSq: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  trendUp: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  palette: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="0.5"/><circle cx="17.5" cy="10.5" r="0.5"/><circle cx="8.5" cy="7.5" r="0.5"/><circle cx="6.5" cy="12" r="0.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  box: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
  search: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
};

const SP_TEMPLATES = [
  { icon: SP_SVG.wrench, label: "Bugs", prompt: "Analise o código e identifique todos os bugs, erros e falhas. Corrija cada um deles explicando o problema e a solução aplicada." },
  { icon: SP_SVG.edit, label: "Refatorar", prompt: "Elabore um plano completo de refatoração e otimização do sistema em etapas." },
  { icon: SP_SVG.shield, label: "Erros", prompt: "Implemente tratamento de erros robusto em todo o código." },
  { icon: SP_SVG.zap, label: "Otimizar", prompt: "Analise e otimize a performance do sistema." },
  { icon: SP_SVG.msgSq, label: "Comentários", prompt: "Adicione comentários claros e documentação em todo o código." },
  { icon: SP_SVG.trendUp, label: "SEO", prompt: "Monte um plano completo de criação e otimização de SEO para este site." },
  { icon: SP_SVG.palette, label: "UI", prompt: "Melhore a interface do usuário tornando-a mais moderna, responsiva e acessível." },
  { icon: SP_SVG.box, label: "Componentes", prompt: "Reorganize o código separando em componentes reutilizáveis." },
  { icon: SP_SVG.search, label: "Review", prompt: "Faça uma revisão completa do código identificando problemas de qualidade, segurança, performance." }
];

function spEscapeHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function spSanitizeUrl(url) {
  if (!url) return '';
  try {
    const p = new URL(url);
    return (p.protocol === 'http:' || p.protocol === 'https:') ? url : '';
  } catch(e) { return ''; }
}

function spTemplateLicenseGate() {
  return '<div class="sp-license-gate">' +
    '<div class="sp-lock-icon">🔐</div>' +
    '<p class="sp-gate-title">Ativar Licença</p>' +
    '<p class="sp-gate-desc">Insira sua chave de licença para desbloquear.</p>' +
    '<input class="sp-input" id="sp-license-input" placeholder="QL-XXXXXXXXXXXXXXXXXXXX" spellcheck="false">' +
    '<button class="sp-btn-primary" id="sp-validate-btn">Validar Licença</button>' +
    '<div class="sp-log" id="sp-license-log"></div>' +
  '</div>';
}

function spTemplateMainUI(greeting, statusBadge) {
  return '<div id="sp-update-banner" style="display:none"></div>' +
    '<div class="sp-profile-card">' +
      '<div class="sp-profile-top"><span class="sp-profile-name" id="sp-name">' + greeting + '</span>' + statusBadge + '</div>' +
      '<div class="sp-sync-status" id="sp-sync">⏳ Aguardando sincronização...</div>' +
      '<div class="sp-trial-countdown" id="sp-countdown" style="display:none"></div>' +
    '</div>' +
    '<div id="sp-reseller-btn" style="display:none;margin-bottom:14px">' +
      '<a href="https://lovablepromz.lovable.app/reseller" target="_blank" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;border:1px solid rgba(124,90,255,0.3);background:rgba(124,90,255,0.06);color:var(--ql-accent);text-decoration:none;font-size:12px;font-weight:700;transition:all 0.2s">' +
        '💼 Painel do Revendedor<span style="margin-left:auto;font-size:10px;opacity:0.6">→</span>' +
      '</a>' +
    '</div>' +
    '<textarea class="sp-textarea" id="sp-msg" rows="3" placeholder="Digite seu comando..." spellcheck="false"></textarea>' +
    '<div id="sp-attach-preview" class="sp-attach-preview" style="display:none"></div>' +
    '<div class="sp-action-bar">' +
      '<div class="sp-action-left"><label class="sp-toggle"><input type="checkbox" id="sp-modo-plano"><span class="sp-toggle-slider"></span></label><span class="sp-toggle-label">Plano</span></div>' +
      '<div class="sp-action-center">' +
        '<button class="sp-attach-btn" id="sp-attach-btn" title="Anexar arquivo">📎</button>' +
        '<button class="sp-tool-btn" id="sp-optimize" title="Otimizar com IA">' + SP_SVG.sparkles + '</button>' +
        '<button class="sp-tool-btn" id="sp-speech" title="Voz">' + SP_SVG.mic + '</button>' +
      '</div>' +
      '<button class="sp-send-btn" id="sp-send">Enviar</button>' +
    '</div>' +
    '<input type="file" id="sp-file-input" multiple style="display:none" accept="*/*">' +
    '<div class="sp-log" id="sp-log"></div>' +
    '<span class="sp-shortcuts-title">ATALHOS R\u00c1PIDOS</span>' +
    '<div class="sp-shortcuts-grid" id="sp-chips"></div>' +
    '<button id="sp-remove-watermark" class="sp-watermark-btn">\ud83d\udeab Remover Marca de \u00c1gua</button>';
}

function spTemplateStatusBadge(status) {
  if (status === 'trial') {
    return '<span class="sp-status-badge sp-badge-test">TEST</span>';
  }
  return '<span class="sp-status-badge sp-badge-pro">PRO</span>';
}

function spTemplateAlert(title, message) {
  return '<div class="sp-alert-box">' +
    '<div class="sp-alert-icon">✅</div>' +
    '<div class="sp-alert-title">' + spEscapeHtml(title) + '</div>' +
    '<div class="sp-alert-message">' + spEscapeHtml(message) + '</div>' +
    '<button class="sp-alert-ok">OK</button>' +
  '</div>';
}

function spTemplateNotifItem(n) {
  const date = new Date(n.created_at).toLocaleDateString('pt-BR');
  const safeLink = spSanitizeUrl(n.link);
  const linkHtml = safeLink
    ? '<a href="' + spEscapeHtml(safeLink) + '" target="_blank" rel="noopener noreferrer" class="sp-notif-link">Abrir link →</a>'
    : '';
  return '<div class="sp-notif-item">' +
    '<div class="sp-notif-item-title">' + spEscapeHtml(n.title) + '</div>' +
    '<div class="sp-notif-item-msg">' + spEscapeHtml(n.message) + '</div>' +
    linkHtml +
    '<div class="sp-notif-item-date">' + date + '</div>' +
  '</div>';
}

function spTemplateUpdateBanner(version, changelog, dlUrl) {
  return '<div style="padding:10px 12px;background:linear-gradient(135deg,rgba(251,191,36,0.12),rgba(245,158,11,0.08));border:1px solid rgba(251,191,36,0.3);border-radius:10px;margin:8px 0">' +
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
      '<span style="font-size:14px">🔔</span>' +
      '<strong style="font-size:11px;color:#f59e0b">Nova atualização v' + version + '!</strong>' +
    '</div>' +
    '<p style="font-size:10px;color:#a1a1aa;margin:0 0 6px;white-space:pre-line">' + (changelog || '') + '</p>' +
    (dlUrl ? '<a href="' + dlUrl + '" target="_blank" style="display:inline-block;padding:4px 12px;background:#f59e0b;color:#000;border-radius:6px;text-decoration:none;font-size:10px;font-weight:700">Baixar v' + version + '</a>' : '') +
  '</div>';
}

function spTemplateCountdown(label, timeStr, pct, urgentClass) {
  return '<div class="sp-countdown-row">' +
    '<span>⏳</span>' +
    '<span class="sp-countdown-label">' + label + '</span>' +
    '<span class="sp-countdown-time">' + timeStr + '</span>' +
  '</div>' +
  '<div class="sp-trial-bar">' +
    '<div class="sp-trial-bar-fill' + urgentClass + '" style="width:' + pct + '%"></div>' +
  '</div>';
}

function spTemplateAttachItem(f, index) {
  const thumb = f.previewUrl
    ? '<img class="sp-attach-thumb" src="' + f.previewUrl + '" alt="">'
    : '<div class="sp-attach-icon">📄</div>';
  return '<div class="sp-attach-item' + (f.uploading ? ' sp-attach-uploading' : '') + '">' +
    thumb +
    '<div class="sp-attach-info">' +
      '<span class="sp-attach-name" title="' + spEscapeHtml(f.file_name) + '">' + spEscapeHtml(f.file_name) + '</span>' +
      '<span class="sp-attach-size">' + spEscapeHtml(f.sizeLabel) + '</span>' +
    '</div>' +
    '<button class="sp-attach-remove" data-idx="' + index + '">✕</button>' +
  '</div>';
}

function spFormatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ========== Chat History Templates ==========
function spTemplateTabs(activeTab, msgCount) {
  var countBadge = msgCount > 0 ? '<span class="sp-tab-badge">' + msgCount + '</span>' : '';
  return '<div class="sp-tabs">' +
    '<button class="sp-tab' + (activeTab === 'prompt' ? ' sp-tab-active' : '') + '" data-tab="prompt">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>' +
      ' Prompt' +
    '</button>' +
    '<button class="sp-tab' + (activeTab === 'history' ? ' sp-tab-active' : '') + '" data-tab="history">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      ' Histórico ' + countBadge +
    '</button>' +
    '<button class="sp-tab' + (activeTab === 'downloads' ? ' sp-tab-active' : '') + '" data-tab="downloads">' +
      '📥 Downloads' +
    '</button>' +
  '</div>';
}

function spTemplateDownloadsView() {
  return '<div style="padding:16px;display:flex;flex-direction:column;gap:12px">' +
    '<div style="margin-bottom:8px"><strong style="font-size:14px;color:var(--ql-text-primary)">Downloads</strong><p style="font-size:11px;color:var(--ql-text-muted);margin:2px 0 0">Recursos e ferramentas PRO.</p></div>' +
    '<div class="sp-download-card" style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px">' +
      '<div style="font-size:20px">📦</div>' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:600">Extensão v4.3</div><div style="font-size:10px;color:var(--ql-text-muted)">ZIP • 1.2MB</div></div>' +
      '<button class="sp-dl-btn" data-dl-url="https://ynvrijkuampxpsmshftm.supabase.co/storage/v1/object/public/extensions/premium-v4.3.zip" style="padding:6px;background:var(--ql-accent);border:none;border-radius:8px;cursor:pointer">⬇️</button>' +
    '</div>' +
    '<div class="sp-download-card" style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px">' +
      '<div style="font-size:20px">📑</div>' +
      '<div style="flex:1"><div style="font-size:12px;font-weight:600">Guia de Prompts</div><div style="font-size:10px;color:var(--ql-text-muted)">PDF • 450KB</div></div>' +
      '<button class="sp-dl-btn" data-dl-url="https://ynvrijkuampxpsmshftm.supabase.co/storage/v1/object/public/extensions/guia-prompts.pdf" style="padding:6px;background:var(--ql-accent);border:none;border-radius:8px;cursor:pointer">⬇️</button>' +
    '</div>' +
  '</div>';
}



function spTemplateChatEmpty() {
  return '<div class="sp-chat-empty">' +
    '<div class="sp-chat-empty-icon">💬</div>' +
    '<div class="sp-chat-empty-title">Nenhuma mensagem</div>' +
    '<div class="sp-chat-empty-desc">Seus prompts enviados aparecerão aqui como histórico.</div>' +
  '</div>';
}

function spFormatChatDate(dateStr) {
  var d = new Date(dateStr);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = (today - msgDay) / 86400000;
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7) return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()];
  return d.toLocaleDateString('pt-BR');
}

function spFormatChatTime(dateStr) {
  var d = new Date(dateStr);
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function spTemplateChatBubble(msg) {
  var statusClass = msg.status === 'error' ? 'sp-chat-status-err' : 'sp-chat-status-ok';
  var statusText = msg.status === 'error' ? '✗ Erro' : '✓ Enviado';
  var truncated = msg.text.length > 300 ? spEscapeHtml(msg.text.substring(0, 300)) + '…' : spEscapeHtml(msg.text);
  return '<div class="sp-chat-bubble" title="' + spEscapeHtml(msg.text) + '">' +
    truncated +
    '<div class="sp-chat-meta">' +
      '<span class="sp-chat-status ' + statusClass + '">' + statusText + '</span>' +
      '<span class="sp-chat-time">' + spFormatChatTime(msg.timestamp) + '</span>' +
      '<span class="sp-chat-check">✓✓</span>' +
    '</div>' +
  '</div>';
}

function spTemplateChatHistory(messages) {
  if (!messages || !messages.length) return spTemplateChatEmpty();
  var html = '<div class="sp-chat-messages">';
  var lastDate = '';
  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var dateLabel = spFormatChatDate(m.timestamp);
    if (dateLabel !== lastDate) {
      html += '<div class="sp-chat-date-divider"><span class="sp-chat-date-label">' + dateLabel + '</span></div>';
      lastDate = dateLabel;
    }
    html += spTemplateChatBubble(m);
  }
  html += '</div>';
  html += '<div class="sp-chat-actions">' +
    '<span class="sp-chat-count">' + messages.length + ' mensagen' + (messages.length === 1 ? '' : 's') + '</span>' +
    '<button class="sp-chat-clear" id="sp-chat-clear">🗑 Limpar Histórico</button>' +
  '</div>';
  return html;
}
