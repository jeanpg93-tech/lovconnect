// ============================================================
// Main Lovable - Side Panel Logic (Business Logic Only)
// Templates/HTML estão em sidepanel-templates.js
// ============================================================

(function(){
  const hasExtensionRuntime = () =>
    typeof chrome !== "undefined" && !!chrome.runtime && !!chrome.runtime.id;

  if (typeof chrome === "undefined") {
    const listeners = [];
    const readStore = () => {
      try { return JSON.parse(localStorage.getItem("lov-sidepanel-store") || "{}"); }
      catch (_) { return {}; }
    };
    const writeStore = (store) => {
      try { localStorage.setItem("lov-sidepanel-store", JSON.stringify(store)); }
      catch (_) {}
    };
    const pickValues = (store, keys) => {
      if (!keys) return { ...store };
      if (Array.isArray(keys)) return keys.reduce((acc, key) => ({ ...acc, [key]: store[key] }), {});
      if (typeof keys === "string") return { [keys]: store[keys] };
      return Object.keys(keys).reduce((acc, key) => ({ ...acc, [key]: store[key] ?? keys[key] }), {});
    };
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => cb && cb(pickValues(readStore(), keys)),
          set: (values, cb) => {
            const store = { ...readStore(), ...values };
            writeStore(store);
            listeners.forEach((listener) => listener(values, "local"));
            if (cb) cb();
          },
          remove: (keys, cb) => {
            const store = readStore();
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete store[key]);
            writeStore(store);
            if (cb) cb();
          },
        },
        onChanged: { addListener: (listener) => listeners.push(listener) },
      },
      runtime: { sendMessage: (_msg, cb) => cb && cb(null), lastError: null },
      tabs: { query: (_query, cb) => cb && cb([]) },
      scripting: { executeScript: () => Promise.resolve() },
    };
  }

  const SUPABASE_URL = "https://ynvrijkuampxpsmshftm.supabase.co";
  const VALIDATE_URL = SUPABASE_URL + "/functions/v1/validate-license";
  const OPTIMIZE_URL = SUPABASE_URL + "/functions/v1/optimize-prompt";
  const NOTIFICATIONS_URL = SUPABASE_URL + "/rest/v1/notifications?select=*&order=created_at.desc&limit=20";
  const VERSIONS_URL = SUPABASE_URL + "/rest/v1/extension_versions?select=version,changelog,file_path,is_alert_active&order=created_at.desc&limit=1&is_alert_active=eq.true";
  const USER_ROLES_URL = SUPABASE_URL + "/rest/v1/user_roles?select=role";
  const PROXY_COMMAND_URL = SUPABASE_URL + "/functions/v1/proxy-command";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InludnJpamt1YW1weHBzbXNoZnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDc1NjYsImV4cCI6MjA4OTc4MzU2Nn0.wFo3etz2hWmb8VCtadXRdqQAyCDaP2Li4Rs5kHLTdfM";

  let sessionId = null, userName = null, expiresAt = null, licenseStatus = null, heartbeatInterval = null, deviceId = null, isResellerUser = false;
  let spAttachedFiles = [];
  let spActiveTab = 'prompt';
  let spChatHistory = [];
  const SP_MAX_FILES = 15;
  const SP_MAX_FILE_SIZE = 20 * 1024 * 1024;
  const SP_HISTORY_KEY = 'ql_chat_history';
  const SP_MAX_HISTORY = 200;
  const CURRENT_EXT_VERSION = "4.2";

  // --- Utilities ---
  function safeSendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        if (!hasExtensionRuntime()) return reject(new Error("Extension context unavailable"));
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp);
        });
      } catch(e) { reject(new Error("Extension context invalidated")); }
    });
  }

  function bgFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!hasExtensionRuntime()) {
          fetch(url, {
            method: opts.method || "POST",
            headers: opts.headers || {},
            body: opts.body || null,
          })
            .then(async (resp) => {
              const text = await resp.text();
              const data = text ? JSON.parse(text) : null;
              if (!resp.ok) throw new Error((data && (data.error || data.message)) || "Fetch failed (" + resp.status + ")");
              resolve(data);
            })
            .catch(reject);
          return;
        }
        chrome.runtime.sendMessage({ action: "proxyFetch", url, method: opts.method || "POST", headers: opts.headers || {}, body: opts.body || null }, (resp) => {
          if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if(!resp) return reject(new Error("No response"));
          if(resp.data && typeof resp.data === "object") resolve(resp.data);
          else if(!resp.ok) reject(new Error("Fetch failed (" + resp.status + ")"));
          else resolve(resp.data);
        });
      } catch(e) { reject(new Error("Extension context invalidated")); }
    });
  }

  function getDeviceId() {
    return getHardwareFingerprint();
  }

  function showAlert(title, message) {
    const existing = document.querySelector('.sp-alert-overlay');
    if(existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'sp-alert-overlay';
    overlay.innerHTML = spTemplateAlert(title, message);
    document.body.appendChild(overlay);
    overlay.querySelector('.sp-alert-ok').addEventListener('click', () => overlay.remove());
    setTimeout(() => overlay.remove(), 4000);
  }

  // --- Header Event Listeners ---
  document.getElementById('sp-back-to-popup').addEventListener('click', () => {
    try { chrome.storage.local.set({ ql_sidebar_mode: false }); } catch(e) {}
    try { chrome.runtime.sendMessage({ action: "deactivateSidebar" }); } catch(e) {}
    try { hasExtensionRuntime() ? window.close() : window.location.assign('/painel'); } catch(e) {}
  });

  document.querySelector('.sp-theme-btn').addEventListener('click', () => {
    const isLight = document.body.classList.toggle('sp-light');
    chrome.storage.local.set({ ql_dark_mode: !isLight, ql_theme_user_choice: true });
  });

  document.querySelector('.sp-logout-btn').addEventListener('click', () => {
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => {
      userName = null; expiresAt = null; licenseStatus = null; sessionId = null;
      showLicenseGate();
    });
  });

  // --- Notifications ---
  const notifPanel = document.getElementById('sp-notif-panel');
  document.querySelector('.sp-notif-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = notifPanel.style.display !== 'none';
    notifPanel.style.display = isOpen ? 'none' : 'block';
    if(!isOpen) loadNotifications();
  });
  document.getElementById('sp-notif-close').addEventListener('click', () => { notifPanel.style.display = 'none'; });

  async function loadNotifications() {
    const list = document.getElementById('sp-notif-list');
    list.innerHTML = '<p class="sp-notif-empty">Carregando...</p>';
    try {
      const data = await bgFetch(NOTIFICATIONS_URL, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } });
      if(!data || !data.length) { list.innerHTML = '<p class="sp-notif-empty">Nenhuma notificação.</p>'; return; }
      const ids = data.map(n => n.id);
      chrome.storage.local.set({ ql_read_notifs: ids });
      const badge = document.querySelector('.sp-notif-badge');
      if(badge) badge.style.display = 'none';
      list.innerHTML = data.map(n => spTemplateNotifItem(n)).join('');
    } catch(e) { list.innerHTML = '<p class="sp-notif-empty">Erro ao carregar.</p>'; }
  }

  async function checkUnread() {
    try {
      const data = await bgFetch(NOTIFICATIONS_URL, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } });
      if(!data || !data.length) return;
      chrome.storage.local.get(["ql_read_notifs"], res => {
        const readIds = res.ql_read_notifs || [];
        const unread = data.filter(n => !readIds.includes(n.id)).length;
        const badge = document.querySelector('.sp-notif-badge');
        if(badge) { badge.textContent = unread; badge.style.display = unread > 0 ? 'flex' : 'none'; }
      });
    } catch(e) {}
  }

  // --- Update Check ---
  async function checkForUpdate() {
    try {
      const data = await bgFetch(VERSIONS_URL, { method: "GET", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } });
      if (!data || !data.length) return;
      const latest = data[0];
      if (latest.version !== CURRENT_EXT_VERSION && latest.is_alert_active) {
        const banner = document.getElementById('sp-update-banner');
        if (banner) {
          const dlUrl = latest.file_path ? SUPABASE_URL + "/storage/v1/object/public/extension-releases/" + latest.file_path : null;
          banner.innerHTML = spTemplateUpdateBanner(latest.version, latest.changelog, dlUrl);
          banner.style.display = 'block';
        }
      }
    } catch(e) {}
  }

  // --- Reseller Role Check ---
  async function checkResellerRole() {
    try {
      const data = await bgFetch(USER_ROLES_URL + "&user_id=eq." + (await getUserId()), { method: "GET", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } });
      if (data && Array.isArray(data) && data.some(r => r.role === 'reseller' || r.role === 'admin')) {
        isResellerUser = true;
        const btn = document.getElementById('sp-reseller-btn');
        if (btn) btn.style.display = 'block';
      }
    } catch(e) {}
  }

  async function getUserId() {
    return new Promise(r => chrome.storage.local.get(["ql_license_key"], async res => {
      if (!res.ql_license_key) return r('');
      try {
        const data = await bgFetch(SUPABASE_URL + "/rest/v1/licenses?select=user_id&license_key=eq." + encodeURIComponent(res.ql_license_key) + "&limit=1", { method: "GET", headers: { apikey: SUPABASE_ANON_KEY } });
        if (data && data.length && data[0].user_id) r(data[0].user_id);
        else r('');
      } catch(e) { r(''); }
    }));
  }

  // --- License Gate ---
  function showLicenseGate() {
    const body = document.getElementById('sp-body');
    body.innerHTML = spTemplateLicenseGate();
    document.getElementById('sp-validate-btn').addEventListener('click', validateLicense);
  }

  async function validateLicense() {
    const input = document.getElementById('sp-license-input');
    const log = document.getElementById('sp-license-log');
    const key = input ? input.value.trim() : '';
    if(!key) { log.className = 'sp-log sp-log-error'; log.textContent = '⚠ Insira uma chave'; return; }
    log.className = 'sp-log sp-log-info'; log.textContent = '⏳ Validando...';
    try {
      if(!deviceId) deviceId = await getDeviceId();
      const data = await bgFetch(VALIDATE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: key, device_id: deviceId }) });
      if(data.valid) {
        sessionId = data.session_id; userName = data.user_name; expiresAt = data.expires_at; licenseStatus = data.status;
        chrome.storage.local.set({ ql_license_valid: true, ql_license_key: key, ql_session_id: data.session_id, ql_user_name: data.user_name || null, ql_expires_at: data.expires_at || null, ql_activated_at: data.activated_at || null, ql_license_status: data.status || null }, () => {
          log.className = 'sp-log sp-log-success'; log.textContent = '✓ ' + data.message;
          setTimeout(() => { showMainUI(); startHeartbeat(key); }, 800);
        });
      } else {
        log.className = 'sp-log sp-log-error'; log.textContent = '✗ ' + data.message;
      }
    } catch(err) { log.className = 'sp-log sp-log-error'; log.textContent = '✗ Erro de conexão'; }
  }

  // --- Chat History ---
  function loadChatHistory(cb) {
    chrome.storage.local.get([SP_HISTORY_KEY], function(r) {
      spChatHistory = r[SP_HISTORY_KEY] || [];
      if (cb) cb();
    });
  }

  function saveChatHistory() {
    if (spChatHistory.length > SP_MAX_HISTORY) spChatHistory = spChatHistory.slice(-SP_MAX_HISTORY);
    chrome.storage.local.set({ [SP_HISTORY_KEY]: spChatHistory });
  }

  function addToHistory(text, status) {
    spChatHistory.push({ text: text, timestamp: new Date().toISOString(), status: status || 'ok' });
    saveChatHistory();
    updateHistoryBadge();
  }

  function updateHistoryBadge() {
    var badge = document.querySelector('.sp-tab[data-tab="history"] .sp-tab-badge');
    if (badge) badge.textContent = spChatHistory.length;
  }

  function renderHistoryTab() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    container.innerHTML = spTemplateChatHistory(spChatHistory);
    // Scroll to bottom
    var msgs = container.querySelector('.sp-chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    // Clear button
    var clearBtn = document.getElementById('sp-chat-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        spChatHistory = [];
        saveChatHistory();
        renderHistoryTab();
      });
    }
  }

  function renderPromptTab() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    container.innerHTML = spTemplatePromptContent();
  }

  function switchTab(tab) {
    spActiveTab = tab;
    document.querySelectorAll('.ql-tab, .sp-tab').forEach(function(t) {
      t.classList.toggle('ql-tab-active', t.getAttribute('data-tab') === tab);
      t.classList.toggle('sp-tab-active', t.getAttribute('data-tab') === tab);
    });
    const container = document.getElementById('ql-tab-content') || document.getElementById('sp-tab-content');
    if (tab === 'history') {
      loadChatHistory(function() { 
        if(typeof renderHistoryView === 'function') renderHistoryView();
        else if(typeof renderHistoryTab === 'function') renderHistoryTab();
      });
    } else if (tab === 'downloads') {
      if(container) {
        if(typeof templateDownloadsView === 'function') container.innerHTML = templateDownloadsView();
        else if(typeof spTemplateDownloadsView === 'function') container.innerHTML = spTemplateDownloadsView();
        
        // Setup clicks for both content and sidepanel buttons
        container.querySelectorAll('.ql-download-btn, .sp-dl-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-dl-url');
            chrome.runtime.sendMessage({ action: "openUrl", url });
          });
        });
      }
    } else {
      if(typeof renderPromptView === 'function') renderPromptView();
      else if(typeof showMainUIContent === 'function') showMainUIContent();
    }
  }



  // --- Main UI ---
  function showMainUI() {
    const greeting = spEscapeHtml(userName || 'User');
    const statusBadge = spTemplateStatusBadge(licenseStatus);
    const body = document.getElementById('sp-body');
    loadChatHistory(function() {
      body.innerHTML = '<div id="sp-update-banner" style="display:none"></div>' +
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
        spTemplateTabs(spActiveTab, spChatHistory.length) +
        '<div id="sp-tab-content"></div>';

      // Tab click handlers
      document.querySelectorAll('.sp-tab').forEach(function(t) {
        t.addEventListener('click', function() { switchTab(t.getAttribute('data-tab')); });
      });

      // Show active content
      if (spActiveTab === 'history') {
        renderHistoryTab();
      } else if (spActiveTab === 'downloads') {
        const container = document.getElementById('sp-tab-content');
        if(container) container.innerHTML = spTemplateDownloadsView();
      } else {
        showMainUIContent();
      }


      // Sync status
      updateSync();
      chrome.storage.onChanged.addListener((ch) => { if(ch.lovable_projectId || ch.lovable_token) updateSync(); });

      // Countdown
      updateCountdown();

      // Heartbeat
      chrome.storage.local.get(["ql_license_key","ql_session_id"], r => {
        if(r.ql_license_key) { sessionId = r.ql_session_id || sessionId; startHeartbeat(r.ql_license_key); }
      });

      checkUnread();
      checkForUpdate();
      checkResellerRole();
    });
  }

  function showMainUIContent() {
    var container = document.getElementById('sp-tab-content');
    if (!container) return;
    container.innerHTML =
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
      '<span class="sp-shortcuts-title">ATALHOS RÁPIDOS</span>' +
      '<div class="sp-shortcuts-grid" id="sp-chips"></div>' +
      '<button id="sp-remove-watermark" class="sp-watermark-btn">🚫 Remover Marca de Água</button>' +
      '<button id="sp-shield-btn" class="sp-shield-btn">' + SP_SVG.shield + ' <span id="sp-shield-label">Ativar Escudo</span></button>';

    // Setup chips
    const chips = document.getElementById('sp-chips');
    SP_TEMPLATES.forEach(t => {
      const chip = document.createElement('button');
      chip.className = 'sp-chip';
      chip.innerHTML = t.icon + ' ' + t.label;
      chip.title = t.prompt;
      chip.addEventListener('click', () => { document.getElementById('sp-msg').value = t.prompt; });
      chips.appendChild(chip);
    });

    // Modo Plano
    chrome.storage.local.get(["ql_modo_plano"], r => { if(r.ql_modo_plano) document.getElementById('sp-modo-plano').checked = true; });
    document.getElementById('sp-modo-plano').addEventListener('change', function() {
      const checkbox = this;
      chrome.storage.local.set({ ql_modo_plano: checkbox.checked });
      if (checkbox.checked) showModoPlanoAlert();
    });

    // File attachment
    setupSpFileAttachment();

    // Event listeners
    document.getElementById('sp-send').addEventListener('click', handleSend);
    document.getElementById('sp-optimize').addEventListener('click', handleOptimize);
    setupSpWatermarkButton();
    setupSpShield();
  }

  // --- Sync Status ---
  function updateSync() {
    chrome.storage.local.get(["lovable_projectId","lovable_token"], r => {
      const el = document.getElementById('sp-sync');
      if(!el) return;
      if(r.lovable_projectId && r.lovable_token) { el.className = 'sp-sync-status sp-sync-ok'; el.textContent = '✅ Sincronizado! Projeto: ' + r.lovable_projectId.substring(0,6) + '...'; }
      else { el.className = 'sp-sync-status sp-sync-waiting'; el.textContent = '⏳ Aguardando sincronização...'; }
    });
  }

  // --- Countdown ---
  function updateCountdown() {
    if(!expiresAt) return;
    const el = document.getElementById('sp-countdown');
    if(!el) return;
    el.style.display = 'flex';
    const expiresMs = new Date(expiresAt).getTime();
    const totalDuration = Math.max(expiresMs - Date.now(), 3600000);
    function tick() {
      const remaining = expiresMs - Date.now();
      if(remaining <= 0) { el.innerHTML = '<span style="color:var(--ql-danger);font-weight:600;font-size:12px">⏰ Licença expirada</span>'; return; }
      const days = Math.floor(remaining / 86400000);
      const hrs = Math.floor((remaining % 86400000) / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));
      let timeStr = days > 0 ? days + 'd ' + hrs + 'h ' + mins + 'm' : hrs > 0 ? hrs + 'h ' + mins + 'm ' + String(secs).padStart(2,'0') + 's' : mins + ':' + String(secs).padStart(2,'0');
      const label = licenseStatus === 'trial' ? 'Teste expira em' : 'Plano expira em';
      const urgentClass = pct < 20 ? ' sp-bar-urgent' : '';
      el.innerHTML = spTemplateCountdown(label, timeStr, pct, urgentClass);
    }
    tick();
    setInterval(tick, 1000);
  }

  // --- JWT Decode ---
  function spDecodeJwtUserId(token) {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      return payload.sub || payload.user_id || null;
    } catch(e) { return null; }
  }

  // --- Image Compression ---
  async function spCompressImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_DIM = 1280;
        let w = img.width, h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob((blob) => {
          if (!blob) return resolve({ file, previewUrl: null });
          resolve({ file: new File([blob], file.name, { type: outputType }), previewUrl: URL.createObjectURL(blob) });
        }, outputType, file.type === 'image/png' ? undefined : 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ file, previewUrl: null }); };
      img.src = url;
    });
  }

  // --- File Upload ---
  function spInferContentType(file) {
    if (file && typeof file.type === 'string' && file.type.trim()) return file.type;
    const name = (file && file.name ? file.name : '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    const map = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      zip: 'application/zip',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      webm: 'video/webm'
    };
    return map[ext] || 'application/octet-stream';
  }

  function spBuildUploadFileName(fileId, file) {
    const rawName = file && file.name ? String(file.name) : '';
    const ext = rawName.includes('.') ? rawName.split('.').pop().toLowerCase() : '';
    const safeExt = ext && /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
    return fileId + '.' + safeExt;
  }

  async function spUploadFileDirect(file, token) {
    const fileId = crypto.randomUUID();
    const userId = spDecodeJwtUserId(token);
    if (!userId) throw new Error('userId não extraído do token');

    const contentType = spInferContentType(file);
    const uploadFileName = spBuildUploadFileName(fileId, file);

    const uploadResp = await bgFetch('https://api.lovable.dev/files/generate-upload-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ file_name: uploadFileName, content_type: contentType, status: 'uploading' })
    });

    var signedUrl = (uploadResp && uploadResp.url) || (uploadResp && uploadResp.signed_url) || (uploadResp && uploadResp.signedUrl) || (uploadResp && uploadResp.data && uploadResp.data.url) || null;
    if (!signedUrl) throw new Error('URL assinada não retornada');

    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('PUT falhou: ' + xhr.status));
      xhr.onerror = () => reject(new Error('Erro de rede'));
      xhr.send(file);
    });

    try {
      await bgFetch('https://api.lovable.dev/files/generate-download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ dir_name: userId, file_name: uploadFileName })
      });
    } catch(e) {}

    return { file_id: uploadFileName, file_name: file.name || 'file' };
  }

  // --- Attachment Preview ---
  function spRenderAttachPreview() {
    const container = document.getElementById('sp-attach-preview');
    if (!container) return;
    if (spAttachedFiles.length === 0) { container.style.display = 'none'; container.innerHTML = ''; return; }
    container.style.display = 'flex';
    container.innerHTML = spAttachedFiles.map((f, i) => spTemplateAttachItem(f, i)).join('');
    container.querySelectorAll('.sp-attach-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        if (spAttachedFiles[idx] && spAttachedFiles[idx].previewUrl) URL.revokeObjectURL(spAttachedFiles[idx].previewUrl);
        spAttachedFiles.splice(idx, 1);
        spRenderAttachPreview();
      });
    });
  }

  // --- File Attachment Setup ---
  function setupSpFileAttachment() {
    const attachBtn = document.getElementById('sp-attach-btn');
    const fileInput = document.getElementById('sp-file-input');
    if (!attachBtn || !fileInput) return;
    attachBtn.addEventListener('click', () => {
      if (spAttachedFiles.length >= SP_MAX_FILES) { showAlert('Limite', 'Máximo ' + SP_MAX_FILES + ' arquivos.'); return; }
      fileInput.click();
    });
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      fileInput.value = '';
      if (!files.length) return;
      const sd = await new Promise(r => chrome.storage.local.get(['lovable_token'], r));
      let token = sd.lovable_token || '';
      if (!token) { showAlert('Erro', 'Token não capturado.'); return; }
      if (token.startsWith('Bearer ')) token = token.slice(7);
      for (const file of files) {
        if (spAttachedFiles.length >= SP_MAX_FILES) break;
        if (file.size > SP_MAX_FILE_SIZE) { showAlert('Grande', file.name + ' excede 20MB.'); continue; }
        let processedFile = file, previewUrl = null;
        if (['image/png','image/jpeg','image/webp'].includes(file.type)) {
          const r = await spCompressImage(file);
          processedFile = r.file; previewUrl = r.previewUrl;
        }
        const isImage = ['image/png','image/jpeg','image/webp'].includes(processedFile.type);
        const idx = spAttachedFiles.length;
        spAttachedFiles.push({ file_id: null, file_name: file.name, previewUrl, file_type: processedFile.type, sizeLabel: spFormatFileSize(processedFile.size), uploading: true, rawFile: processedFile });
        spRenderAttachPreview();
        try {
          const res = await spUploadFileDirect(processedFile, token);
          spAttachedFiles[idx].file_id = res.file_id;
          spAttachedFiles[idx].uploading = false;
          spRenderAttachPreview();
        } catch(err) {
          console.warn('[QL] Signed URL upload failed, keeping file for direct FormData send:', err.message);
          spAttachedFiles[idx].uploading = false;
          spAttachedFiles[idx].file_id = 'local_direct_' + crypto.randomUUID();
          spAttachedFiles[idx].uploadFailed = true;
          spRenderAttachPreview();
        }
      }
    });
  }

  // --- Modo Plano Alert ---
  function showModoPlanoAlert() {
    const overlay = document.createElement('div');
    overlay.className = 'sp-modal-overlay';
    overlay.innerHTML = '<div class="sp-modal">' +
      '<div class="sp-modal-icon">\u26a0\ufe0f</div>' +
      '<div class="sp-modal-title">Aten\u00e7\u00e3o \u2014 Modo Plano</div>' +
      '<div class="sp-modal-body">' +
        'O <strong>Modo Plano/Pensar</strong> pode consumir cr\u00e9ditos, mas oferece um excelente aux\u00edlio. Use com modera\u00e7\u00e3o!' +
      '</div>' +
      '<div style="margin-bottom:14px;">' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">1</span><span class="sp-modal-step-text">Ative o <strong>Modo Plano</strong> e envie seu prompt pela extens\u00e3o.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">2</span><span class="sp-modal-step-text">O Lovable vai gerar um plano. <strong>N\u00c3O clique no bot\u00e3o "Aprovar"</strong> dentro do Lovable.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">3</span><span class="sp-modal-step-text"><strong>Copie o plano gerado</strong> e cole no campo de prompt da extens\u00e3o.</span></div>' +
        '<div class="sp-modal-step"><span class="sp-modal-step-num">4</span><span class="sp-modal-step-text"><strong>Desligue o Modo Plano</strong> e envie o prompt pela extens\u00e3o. Nenhum cr\u00e9dito extra ser\u00e1 consumido!</span></div>' +
      '</div>' +
      '<div class="sp-modal-check">' +
        '<input type="checkbox" id="sp-modal-dismiss" />' +
        '<label for="sp-modal-dismiss">N\u00e3o mostrar novamente</label>' +
      '</div>' +
      '<button class="sp-modal-btn" id="sp-modal-ok">Entendi!</button>' +
    '</div>';
    document.body.appendChild(overlay);
    document.getElementById('sp-modal-ok').addEventListener('click', function() {
      var dismiss = document.getElementById('sp-modal-dismiss').checked;
      if (dismiss) chrome.storage.local.set({ ql_modo_plano_alert_dismissed: true });
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  }

  // --- Convert file to base64 ---
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
      reader.readAsDataURL(file);
    });
  }

  var SP_WATERMARK_PROMPT = "Adicione isso ao arquivo index.css do projecto \n" +
    "a[href*=\"lovable.dev\"], \n" +
    "iframe[src*=\"lovable.dev\"],\n" +
    "div[style*=\"Edit with Lovable\"],\n" +
    ".lovable-badge {\n" +
    "  display: none !important;\n" +
    "  opacity: 0 !important;\n" +
    "  visibility: hidden !important;\n" +
    "  pointer-events: none !important;\n" +
    "  position: absolute !important;\n" +
    "  z-index: -9999 !important;\n" +
    "}";

  function setupSpWatermarkButton(){
    var btn = document.getElementById("sp-remove-watermark");
    if(!btn) return;
    btn.addEventListener("click", async function(){
      var log = document.getElementById("sp-log");
      btn.disabled = true;
      btn.textContent = "\u23f3 Enviando...";

      try {
        var sd = await new Promise(function(r){ chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key","ql_session_id"], r); });
        var token = sd.lovable_token || "";
        var pid = sd.lovable_projectId || "";
        var licKey = sd.ql_license_key || "";

        if(!pid || !token){
          log.className = "sp-log sp-log-error";
          log.textContent = "\u26a0 Projeto n\u00e3o sincronizado.";
          btn.disabled = false;
          btn.textContent = "\ud83d\udeab Remover Marca de \u00c1gua";
          return;
        }

        if(token.startsWith("Bearer ")) token = token.slice(7);

        var payload = {
          license_key: licKey,
          session_id: sessionId,
          projeto_id: pid,
          token_lovable: token,
          mensagem: SP_WATERMARK_PROMPT,
          modo_pensar: false
        };

        var result = await bgFetch(PROXY_COMMAND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify(payload)
        });

        if(result && result.success === false){
          throw new Error(result.error_display || result.message || "Erro no envio");
        }

        log.className = "sp-log sp-log-success";
        log.textContent = "\u2713 Marca de \u00e1gua removida com sucesso!";
      } catch(err) {
        log.className = "sp-log sp-log-error";
        log.textContent = "\u2717 " + (err.message || err);
      } finally {
        btn.disabled = false;
        btn.textContent = "\ud83d\udeab Remover Marca de \u00c1gua";
      }
    });
  }

  // --- Send Message ---
  async function handleSend() {
    const msg = document.getElementById('sp-msg').value.trim();
    const modoPlano = document.getElementById('sp-modo-plano').checked;
    const log = document.getElementById('sp-log');
    const btn = document.getElementById('sp-send');
    if(!msg) { log.className = 'sp-log sp-log-error'; log.textContent = '⚠ Prompt vazio'; return; }
    btn.disabled = true; btn.textContent = '⏳';

    const filesPayload = spAttachedFiles.filter(f => f.file_id && !f.uploading && !f.uploadFailed).map(f => ({ file_id: f.file_id, file_name: f.file_name }));

    // Find any file with rawFile available for direct FormData send (images or any file whose signed URL failed)
    const directFiles = spAttachedFiles.filter(f => !f.uploading && f.rawFile);
    const directFile = directFiles.length > 0 ? directFiles[0] : null;
    const isImage = directFile && ['image/jpeg','image/png','image/webp'].includes(directFile.file_type);

    if (directFile) {
      log.className = 'sp-log sp-log-info'; log.textContent = '📎 Preparando arquivo para envio...';
    } else {
      log.className = 'sp-log sp-log-info'; log.textContent = '⏳ Enviando...';
    }

    try {
      const sd = await new Promise(r => chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key","ql_session_id"], r));
      let token = sd.lovable_token || ""; const pid = sd.lovable_projectId || ""; const licKey = sd.ql_license_key || "";
      if(!licKey) { log.className = 'sp-log sp-log-error'; log.textContent = '⚠ Licença ausente'; btn.disabled = false; btn.textContent = 'Enviar'; return; }
      if(token.startsWith('Bearer ')) token = token.slice(7);

      // Build payload for proxy-command (handles everything server-side)
      const payload = {
        license_key: licKey,
        session_id: sessionId,
        projeto_id: pid,
        token_lovable: token,
        mensagem: msg,
        modo_pensar: modoPlano,
        files: filesPayload
      };

      // If there's a file, encode and include in payload
      if (directFile && directFile.rawFile) {
        log.className = 'sp-log sp-log-info'; log.textContent = '📤 Codificando arquivo...';
        const base64Data = await fileToBase64(directFile.rawFile);
        payload.file_data = base64Data;
        payload.file_name = directFile.file_name || 'file';
        payload.file_type = directFile.file_type || 'application/octet-stream';
        log.className = 'sp-log sp-log-info'; log.textContent = '📡 Enviando via servidor seguro...';
      }

      const result = await bgFetch(PROXY_COMMAND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify(payload)
      });

      if (result && result.success === false) {
        throw new Error(result.error_display || result.message || "Erro no envio");
      }

      const apiData = result.data || result;
      const msgId = apiData.ai_message_id_usado || '';
      log.className = 'sp-log sp-log-success';
      if (directFile) {
        const isImg = ['image/jpeg','image/png','image/webp'].includes(directFile.file_type);
        log.textContent = isImg ? '✓ Prompt enviado! imagem válida 😁' : '✓ Prompt enviado com arquivo!';
      } else {
        log.textContent = '✓ Prompt enviado!';
      }
      if (msgId) console.log('[QL] API message ID:', msgId);

      // Save to chat history
      addToHistory(msg, 'ok');

      document.getElementById('sp-msg').value = '';
      spAttachedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      spAttachedFiles = [];
      spRenderAttachPreview();
    } catch(err) { log.className = 'sp-log sp-log-error'; log.textContent = '✗ ' + (err.message || err); addToHistory(msg, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Enviar'; }
  }

  // --- Optimize Prompt ---
  async function handleOptimize() {
    const textarea = document.getElementById('sp-msg');
    const btn = document.getElementById('sp-optimize');
    if(!textarea || !textarea.value.trim()) { showAlert('Atenção', 'Digite um prompt antes de otimizar.'); return; }
    btn.classList.add('sp-tool-loading'); btn.disabled = true;
    try {
      const sd = await new Promise(r => chrome.storage.local.get(["ql_license_key"], r));
      const data = await bgFetch(OPTIMIZE_URL, { method: "POST", headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, "x-license-key": sd.ql_license_key || "" }, body: JSON.stringify({ prompt: textarea.value.trim() }) });
      if(data.optimized_prompt) { textarea.value = data.optimized_prompt; showAlert('Prompt Otimizado! ✨', 'Seu prompt foi aprimorado com IA.'); }
      else if(data.error) showAlert('Erro', data.error);
    } catch(err) { showAlert('Erro', 'Falha ao otimizar: ' + (err.message || '')); }
    finally { btn.classList.remove('sp-tool-loading'); btn.disabled = false; }
  }

  // --- Heartbeat ---
  function startHeartbeat(key) {
    if(heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          clearInterval(heartbeatInterval);
          console.warn("[SP] Heartbeat stopped: extension context invalidated");
          return;
        }
        const data = await bgFetch(VALIDATE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: key, session_id: sessionId, heartbeat: true, device_id: deviceId }) });
        if(!data.valid) {
          clearInterval(heartbeatInterval);
          chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => showLicenseGate());
          if(data.reason === 'device_conflict') setTimeout(() => showAlert('Acesso Negado', data.message), 500);
          return;
        }
        if(data.user_name) { userName = data.user_name; const el = document.getElementById('sp-name'); if(el) el.textContent = data.user_name; }
        if(data.expires_at) expiresAt = data.expires_at;
        if(data.status) licenseStatus = data.status;
      } catch(e) {
        if (e.message && e.message.includes("Extension context invalidated")) {
          clearInterval(heartbeatInterval);
          console.warn("[SP] Heartbeat stopped: extension context invalidated");
        }
      }
    }, 60000);
  }

  // --- Initialize ---
  (async function init() {
    deviceId = await getDeviceId();
    chrome.storage.local.get(["ql_dark_mode", "ql_theme_user_choice"], r => {
      if(r.ql_theme_user_choice === true && r.ql_dark_mode === false) document.body.classList.add('sp-light');
      else { document.body.classList.remove('sp-light'); chrome.storage.local.set({ ql_dark_mode: true }); }
    });
    chrome.storage.local.get(["ql_license_valid","ql_license_key","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_session_id"], async (res) => {
      if(res.ql_license_valid) {
        userName = res.ql_user_name || null;
        expiresAt = res.ql_expires_at || null;
        licenseStatus = res.ql_license_status || null;
        sessionId = res.ql_session_id || null;
        showMainUI();
        if(res.ql_license_key) {
          try {
            const data = await bgFetch(VALIDATE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: res.ql_license_key, session_id: sessionId, heartbeat: true, device_id: deviceId }) });
            if(data.valid) {
              userName = data.user_name || userName; expiresAt = data.expires_at || expiresAt; licenseStatus = data.status || licenseStatus; sessionId = data.session_id || sessionId;
              chrome.storage.local.set({ ql_user_name: userName, ql_expires_at: expiresAt, ql_license_status: licenseStatus, ql_session_id: sessionId });
              const nameEl = document.getElementById('sp-name'); if(nameEl) nameEl.textContent = userName || 'User';
              updateCountdown();
            } else {
              chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
              showLicenseGate();
              if(data.reason === 'device_conflict') setTimeout(() => showAlert('Acesso Negado', data.message), 500);
            }
          } catch(e) {}
        }
      } else {
        showLicenseGate();
      }
    });
  })();

  // ===== SHIELD SYSTEM (Sidebar) =====
  let spShieldActive = false;

  function setupSpShield() {
    const btn = document.getElementById('sp-shield-btn');
    if (!btn) return;

    chrome.storage.local.get(['ql_shield_active'], (res) => {
      if (res.ql_shield_active === true) {
        spShieldActive = true;
        btn.classList.add('sp-shield-active');
        const label = document.getElementById('sp-shield-label');
        if (label) label.textContent = 'Desativar Escudo';
        injectSpShieldOverlay();
      }
    });

    btn.addEventListener('click', () => {
      spShieldActive = !spShieldActive;
      chrome.storage.local.set({ ql_shield_active: spShieldActive });

      const label = document.getElementById('sp-shield-label');
      if (spShieldActive) {
        btn.classList.add('sp-shield-active');
        if (label) label.textContent = 'Desativar Escudo';
        injectSpShieldOverlay();
        showAlert('Escudo Ativado 🛡️', 'O input do Lovable está bloqueado.');
      } else {
        btn.classList.remove('sp-shield-active');
        if (label) label.textContent = 'Ativar Escudo';
        removeSpShieldOverlay();
        showAlert('Escudo Desativado', 'O input do Lovable está liberado.');
      }
    });
  }

  function injectSpShieldOverlay() {
    // Send message to content script to inject shield
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function() {
            if (document.getElementById('ql-shield-overlay')) return;
            const chatForm = document.querySelector('form#chat-input');
            if (!chatForm) return;
            const existingPos = getComputedStyle(chatForm).position;
            if (existingPos === 'static') chatForm.style.position = 'relative';
            const overlay = document.createElement('div');
            overlay.id = 'ql-shield-overlay';
            overlay.style.cssText = 'position:absolute;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border-radius:24px;background:rgba(10,10,11,0.88);backdrop-filter:blur(8px);border:1.5px solid rgba(124,90,255,0.3);box-shadow:0 0 40px -8px rgba(124,90,255,0.25);cursor:not-allowed;pointer-events:all;';
            overlay.innerHTML = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#7c5aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 12px rgba(124,90,255,0.5))"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span style="color:#a78bfa;font-size:13px;font-weight:600;font-family:Inter,sans-serif">🛡️ Protegido pelo Main Lovable</span><span style="color:#71717a;font-size:10px;font-family:Inter,sans-serif">Use a extensão para enviar prompts</span>';
            ['click','mousedown','keydown'].forEach(ev => overlay.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }, true));
            chatForm.appendChild(overlay);
            chatForm.querySelectorAll('input,button,textarea,[contenteditable]').forEach(el => {
              if (el.id === 'ql-shield-overlay') return;
              el.dataset.qlShieldDisabled = el.disabled || '';
              el.setAttribute('tabindex', '-1');
              if (el.tagName !== 'DIV') el.disabled = true;
              if (el.contentEditable === 'true') { el.contentEditable = 'false'; el.dataset.qlShieldEditable = 'true'; }
            });
          }
        }).catch(() => {});
      }
    });
  }

  function removeSpShieldOverlay() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: function() {
            const overlay = document.getElementById('ql-shield-overlay');
            if (overlay) overlay.remove();
            const chatForm = document.querySelector('form#chat-input');
            if (!chatForm) return;
            chatForm.querySelectorAll('[data-ql-shield-disabled]').forEach(el => {
              const wasDis = el.dataset.qlShieldDisabled;
              if (wasDis === 'true') el.disabled = true;
              else el.disabled = false;
              delete el.dataset.qlShieldDisabled;
              el.removeAttribute('tabindex');
              if (el.dataset.qlShieldEditable === 'true') { el.contentEditable = 'true'; delete el.dataset.qlShieldEditable; }
            });
          }
        }).catch(() => {});
      }
    });
  }

})();
