// ============================================
// Main Lovable – Business Logic (content)
// Templates HTML estão em content-templates.js
// ============================================

console.log("[ContentScript] Main Lovable iniciado");

const VALIDATE_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/validate-license";
const OPTIMIZE_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/optimize-prompt";
const NOTIFICATIONS_URL = "https://ynvrijkuampxpsmshftm.supabase.co/rest/v1/notifications?select=*&order=created_at.desc&limit=20";
const PACKAGES_URL = "https://ynvrijkuampxpsmshftm.supabase.co/rest/v1/packages?select=*&is_active=eq.true&order=sort_order.asc";
const EXT_PAYMENT_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/process-extension-payment";
const PROXY_COMMAND_URL = "https://ynvrijkuampxpsmshftm.supabase.co/functions/v1/proxy-command";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InludnJpamt1YW1weHBzbXNoZnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDc1NjYsImV4cCI6MjA4OTc4MzU2Nn0.wFo3etz2hWmb8VCtadXRdqQAyCDaP2Li4Rs5kHLTdfM";


function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function sanitizeUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
    return '';
  } catch(e) { return ''; }
}

function decodeJwtPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '').trim();
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch(e) {
    return null;
  }
}

function bgFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: "proxyFetch",
      url,
      method: options.method || "POST",
      headers: options.headers || {},
      body: options.body || null,
    }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error("[bgFetch] runtime error:", chrome.runtime.lastError.message);
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!resp) {
        return reject(new Error("Sem resposta do background"));
      }
      if (resp.data && typeof resp.data === "object") {
        resolve(resp.data);
      } else if (!resp.ok) {
        reject(new Error("Fetch failed via background (status " + resp.status + ")"));
      } else {
        resolve(resp.data);
      }
    });
  });
}

(function injectHook(){
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("pageHook.js");
    s.onload = () => s.remove();
    (document.documentElement || document.head || document.body).appendChild(s);
  } catch (e) {
    console.warn("[ContentScript] falha ao injetar pageHook", e);
  }
})();

let qlSessionId = null;
let qlHeartbeatInterval = null;
let qlUserName = null;
let qlExpiresAt = null;
let qlActivatedAt = null;
let qlLicenseStatus = null;
let qlOnlineCount = 0;
let qlMinimized = false;
let qlHeight = 520;
let qlSpeechRecognition = null;
let qlIsRecording = false;
let qlDeviceId = null;
let qlShieldActive = false;
let qlActiveTab = 'prompt';
let qlChatHistory = [];
const QL_HISTORY_KEY = 'ql_chat_history';
const QL_MAX_HISTORY = 200;

function getDeviceId(){
  return getHardwareFingerprint();
}

function createUI(){
  if(document.getElementById("ql-floating")) return;
  chrome.storage.local.get(["ql_sidebar_mode", "ql_native_chat"], (res) => {
    if(res.ql_sidebar_mode === true) {
      console.log("[ContentScript] Sidebar mode active, skipping floating UI");
      return;
    }
    if(res.ql_native_chat === true) {
      console.log("[ContentScript] Native chat mode active, skipping floating UI");
      return;
    }
    _buildFloatingUI();
  });
}

function _buildFloatingUI(){
  if(document.getElementById("ql-floating")) return;

  const box = document.createElement("div");
  box.id = "ql-floating";
  const initialLeft = Math.max(10, window.innerWidth - 400);
  box.style.left = initialLeft + "px";
  box.style.top = "80px";

  chrome.storage.local.get(["ql_license_valid","ql_license_key","ql_minimized","ql_height","ql_dark_mode","ql_theme_user_choice","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status","ql_session_id"], async (res) => {
    qlMinimized = res.ql_minimized || false;
    qlHeight = res.ql_height || 520;
    qlDeviceId = await getDeviceId();

    if(res.ql_theme_user_choice === true && res.ql_dark_mode === false) {
      box.classList.add("ql-light");
    } else {
      box.classList.remove("ql-light");
      chrome.storage.local.set({ ql_dark_mode: true });
    }
    if(qlMinimized) {
      box.classList.add("ql-minimized");
    }

    document.body.appendChild(box);

    if(res.ql_license_valid){
      qlUserName = res.ql_user_name || null;
      qlExpiresAt = res.ql_expires_at || null;
      qlActivatedAt = res.ql_activated_at || null;
      qlLicenseStatus = res.ql_license_status || null;
      qlSessionId = res.ql_session_id || null;
      showMainUI(box);

      if(res.ql_license_key) {
        fetch(VALIDATE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ license_key: res.ql_license_key, session_id: res.ql_session_id, heartbeat: true, device_id: qlDeviceId })
        }).then(r => r.json()).then(data => {
          if(data.valid) {
            qlUserName = data.user_name || qlUserName;
            qlExpiresAt = data.expires_at || qlExpiresAt;
            qlActivatedAt = data.activated_at || qlActivatedAt;
            qlLicenseStatus = data.status || qlLicenseStatus;
            qlSessionId = data.session_id || qlSessionId;
            chrome.storage.local.set({ ql_user_name: qlUserName, ql_expires_at: qlExpiresAt, ql_activated_at: qlActivatedAt, ql_license_status: qlLicenseStatus, ql_session_id: qlSessionId });
            const nameEl = document.querySelector(".ql-profile-name");
            if(nameEl) nameEl.textContent = qlUserName || "User";
            updateTrialCountdown();
          } else if(data.reason === "device_conflict") {
            chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
            const b = document.getElementById("ql-floating");
            if(b) showLicenseGate(b);
            setTimeout(() => showCustomAlert("Acesso Negado", data.message), 500);
          } else {
            chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"]);
            const b = document.getElementById("ql-floating");
            if(b) showLicenseGate(b);
          }
        }).catch(() => {});
      }
    } else {
      showLicenseGate(box);
    }

    setupDrag();
    setupResize();
  });
}

function showLicenseGate(box){
  box.innerHTML = templateLicenseGate(qlMinimized);

  setTimeout(() => {
    const btn = document.getElementById("ql-validate-btn");
    if(btn) btn.addEventListener("click", validateLicense);
    const buyBtn = document.getElementById("ql-buy-license-btn");
    if(buyBtn) buyBtn.addEventListener("click", () => showPaymentUI(box));
    setupMinimize();
  }, 50);
}

async function validateLicense(){
  const input = document.getElementById("ql-license-input");
  const log = document.getElementById("ql-license-log");
  const key = input ? input.value.trim() : "";

  if(!key){
    if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Insira uma chave"; }
    return;
  }

  if(log){ log.className = "ql-log-info"; log.innerText = "⏳ Validando..."; }

  try{
    if(!qlDeviceId) qlDeviceId = await getDeviceId();

    const data = await bgFetch(VALIDATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: key, device_id: qlDeviceId })
    });

    if(data.valid){
      qlSessionId = data.session_id;
      qlUserName = data.user_name;
      qlExpiresAt = data.expires_at;
      qlActivatedAt = data.activated_at;
      qlLicenseStatus = data.status;
      qlOnlineCount = data.online_count || 0;

      chrome.storage.local.set({ ql_license_valid: true, ql_license_key: key, ql_session_id: data.session_id, ql_user_name: data.user_name || null, ql_expires_at: data.expires_at || null, ql_activated_at: data.activated_at || null, ql_license_status: data.status || null }, () => {
        if(log){ log.className = "ql-log-success"; log.innerText = "✓ " + data.message; }
        setTimeout(() => {
          const box = document.getElementById("ql-floating");
          if(box) showMainUI(box);
          startHeartbeat(key);
        }, 800);
      });
    } else {
      if(log){ log.className = "ql-log-error"; log.innerText = "✗ " + data.message; }
    }
  }catch(err){
    if(log){ log.className = "ql-log-error"; log.innerText = "✗ Erro de conexão"; }
  }
}

function showMainUI(box){
  const greeting = qlUserName || "User";
  const statusBadge = qlLicenseStatus === "trial" ? '<span class="ql-status-badge ql-badge-test">TEST</span>' : '<span class="ql-status-badge ql-badge-pro">PRO</span>';

  box.innerHTML = templateMainUI(greeting, statusBadge, qlMinimized);
  box.style.height = qlHeight + "px";

  setTimeout(() => {
    updateSyncStatus();
    setupSend();
    setupStorageWatch();
    setupMinimize();
    setupSuggestionChips();
    setupWatermarkButton();
    updateTrialCountdown();
    setupDrag();
    setupResize();
    setupDarkMode();
    setupOptimize();
    setupSpeech();
    setupNotifications();
    setupModoPlano();
    setupFileAttachment();
    setupShield();
    setupTabs();
    loadChatHistory();
    setupNativeChatButton();

    chrome.storage.local.get(["ql_license_key", "ql_session_id"], (res) => {
      if(res.ql_license_key) {
        qlSessionId = res.ql_session_id || qlSessionId;
        startHeartbeat(res.ql_license_key);
      }
    });

    const sidePanelBtn = document.getElementById("ql-sidepanel-btn");
    if(sidePanelBtn){
      sidePanelBtn.addEventListener("click", () => {
        const floatingBox = document.getElementById("ql-floating");
        if(floatingBox) {
          floatingBox.style.transition = "opacity 0.3s ease, transform 0.3s ease";
          floatingBox.style.opacity = "0";
          floatingBox.style.transform = "translateX(20px) scale(0.95)";
        }

        chrome.runtime.sendMessage({ action: "activateSidebar" }, (resp) => {
          if(resp && resp.ok){
            setTimeout(() => {
              if(floatingBox) floatingBox.remove();
              if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
              if(window.qlCountdownInterval) clearInterval(window.qlCountdownInterval);
            }, 350);
          } else {
            if(floatingBox) {
              floatingBox.style.opacity = "1";
              floatingBox.style.transform = "none";
            }
            showCustomAlert("Erro", "Não foi possível abrir o painel lateral. Verifique se seu navegador suporta esta funcionalidade.");
          }
        });
      });
    }

    const logoutBtn = document.getElementById("ql-logout-btn");
    if(logoutBtn){
      logoutBtn.addEventListener("click", () => {
        if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => {
          qlUserName = null; qlExpiresAt = null; qlActivatedAt = null; qlLicenseStatus = null; qlSessionId = null;
          showLicenseGate(box);
        });
      });
    }
  }, 30);
}

function showCustomAlert(title, message){
  const alert = document.getElementById("ql-custom-alert");
  if(!alert) return;
  const titleEl = alert.querySelector(".ql-alert-title");
  const msgEl = alert.querySelector(".ql-alert-message");
  const okBtn = alert.querySelector(".ql-alert-ok-btn");
  if(titleEl) titleEl.textContent = title;
  if(msgEl) msgEl.textContent = message;
  alert.style.display = "flex";
  if(okBtn) {
    okBtn.onclick = () => { alert.style.display = "none"; };
  }
  setTimeout(() => { alert.style.display = "none"; }, 4000);
}

function setupOptimize(){
  const btn = document.getElementById("ql-optimize-btn");
  if(!btn) return;
  btn.addEventListener("click", async () => {
    const textarea = document.getElementById("ql-msg");
    if(!textarea || !textarea.value.trim()) {
      showCustomAlert("Atenção", "Digite um prompt antes de otimizar.");
      return;
    }
    const original = textarea.value.trim();
    btn.classList.add("ql-tool-loading");
    btn.disabled = true;

    const storageData = await new Promise(r => chrome.storage.local.get(["ql_license_key"], r));
    const licenseKey = storageData.ql_license_key || "";

    try {
      const data = await bgFetch(OPTIMIZE_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "apikey": SUPABASE_ANON_KEY,
          "x-license-key": licenseKey
        },
        body: JSON.stringify({ prompt: original })
      });
      if(data.optimized_prompt) {
        textarea.value = data.optimized_prompt;
        showCustomAlert("Prompt Otimizado! ✨", "Seu prompt foi aprimorado com IA e está pronto para envio.");
      } else if(data.error) {
        showCustomAlert("Erro", data.error);
      }
    } catch(err) {
      console.error("[Optimize] erro:", err);
      showCustomAlert("Erro", "Falha ao conectar com o otimizador: " + (err.message || ""));
    } finally {
      btn.classList.remove("ql-tool-loading");
      btn.disabled = false;
    }
  });
}

function setupSpeech(){
  const btn = document.getElementById("ql-speech-btn");
  if(!btn) return;
  
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SpeechRecognition) {
    btn.title = "Speech não suportado neste navegador";
    btn.style.opacity = "0.4";
    btn.style.cursor = "not-allowed";
    return;
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if(qlIsRecording && qlSpeechRecognition) {
      qlSpeechRecognition.stop();
      return;
    }

    try {
      qlSpeechRecognition = new SpeechRecognition();
      qlSpeechRecognition.lang = "pt-BR";
      qlSpeechRecognition.continuous = true;
      qlSpeechRecognition.interimResults = true;
      qlSpeechRecognition.maxAlternatives = 1;

      let finalTranscript = "";
      const textarea = document.getElementById("ql-msg");

      qlSpeechRecognition.onstart = () => {
        qlIsRecording = true;
        btn.classList.add("ql-recording");
        finalTranscript = textarea ? textarea.value : "";
        console.log("[QL Speech] Gravação iniciada");
      };

      qlSpeechRecognition.onresult = (event) => {
        let interim = "";
        for(let i = event.resultIndex; i < event.results.length; i++){
          const transcript = event.results[i][0].transcript;
          if(event.results[i].isFinal){
            finalTranscript += transcript + " ";
          } else {
            interim += transcript;
          }
        }
        if(textarea) textarea.value = finalTranscript + interim;
      };

      qlSpeechRecognition.onerror = (event) => {
        console.warn("[QL Speech] Erro:", event.error);
        qlIsRecording = false;
        btn.classList.remove("ql-recording");
        
        if(event.error === "not-allowed") {
          showCustomAlert("Permissão Negada", "Permita o acesso ao microfone nas configurações do navegador.");
        } else if(event.error === "no-speech") {
          showCustomAlert("Sem Áudio", "Nenhuma fala detectada. Tente novamente.");
        } else if(event.error !== "aborted") {
          showCustomAlert("Erro de Voz", "Erro: " + event.error);
        }
      };

      qlSpeechRecognition.onend = () => {
        qlIsRecording = false;
        btn.classList.remove("ql-recording");
        if(textarea) textarea.value = finalTranscript.trim();
        console.log("[QL Speech] Gravação finalizada");
      };

      qlSpeechRecognition.start();
    } catch(err) {
      console.error("[QL Speech] Falha ao iniciar:", err);
      qlIsRecording = false;
      btn.classList.remove("ql-recording");
      showCustomAlert("Erro", "Não foi possível iniciar o reconhecimento de voz.");
    }
  });
}

function setupNotifications(){
  const bellBtn = document.querySelector(".ql-notif-btn");
  const panel = document.getElementById("ql-notif-panel");
  const closeBtn = document.getElementById("ql-notif-close");
  if(!bellBtn || !panel) return;

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.style.display !== "none";
    panel.style.display = isOpen ? "none" : "block";
    if(!isOpen) loadNotifications();
  });

  if(closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.style.display = "none";
    });
  }

  checkUnreadNotifications();
}

async function loadNotifications(){
  const list = document.getElementById("ql-notif-list");
  if(!list) return;
  list.innerHTML = '<p class="ql-notif-empty">Carregando...</p>';

  try {
    const data = await bgFetch(NOTIFICATIONS_URL, {
      method: "GET",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY }
    });
    
    if(!data || data.length === 0){
      list.innerHTML = '<p class="ql-notif-empty">Nenhuma notificação.</p>';
      return;
    }

    const ids = data.map(n => n.id);
    chrome.storage.local.set({ ql_read_notifs: ids });
    const badge = document.querySelector(".ql-notif-badge");
    if(badge) badge.style.display = "none";

    list.innerHTML = data.map(n => {
      const date = new Date(n.created_at).toLocaleDateString("pt-BR");
      const safeLink = sanitizeUrl(n.link);
      const linkHtml = safeLink ? '<a href="' + escapeHtml(safeLink) + '" target="_blank" rel="noopener noreferrer" class="ql-notif-link">Abrir link →</a>' : '';
      return '<div class="ql-notif-item"><div class="ql-notif-item-title">' + escapeHtml(n.title) + '</div><div class="ql-notif-item-msg">' + escapeHtml(n.message) + '</div>' + linkHtml + '<div class="ql-notif-item-date">' + date + '</div></div>';
    }).join('');
  } catch(err) {
    list.innerHTML = '<p class="ql-notif-empty">Erro ao carregar.</p>';
  }
}

async function checkUnreadNotifications(){
  try {
    const data = await bgFetch(NOTIFICATIONS_URL, {
      method: "GET",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY }
    });
    if(!data || data.length === 0) return;

    chrome.storage.local.get(["ql_read_notifs"], (res) => {
      const readIds = res.ql_read_notifs || [];
      const unread = data.filter(n => !readIds.includes(n.id)).length;
      const badge = document.querySelector(".ql-notif-badge");
      if(badge) {
        if(unread > 0) {
          badge.textContent = unread;
          badge.style.display = "flex";
        } else {
          badge.style.display = "none";
        }
      }
    });
  } catch(e) {}
}

function setupSuggestionChips(){
  const container = document.getElementById("ql-chips");
  if(!container) return;
  PROMPT_TEMPLATES.forEach((t) => {
    const chip = document.createElement("button");
    chip.className = "ql-chip";
    chip.innerHTML = t.icon + " " + t.label;
    chip.title = t.prompt;
    chip.addEventListener("click", () => {
      const textarea = document.getElementById("ql-msg");
      if(textarea) textarea.value = t.prompt;
    });
    container.appendChild(chip);
  });
}

var WATERMARK_REMOVAL_PROMPT = "Adicione isso ao arquivo index.css do projecto \n" +
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

function setupWatermarkButton(){
  var btn = document.getElementById("ql-remove-watermark");
  if(!btn) return;
  btn.addEventListener("click", async function(){
    var log = document.getElementById("ql-log");
    btn.disabled = true;
    btn.textContent = "\u23f3 Enviando...";

    await requestLatestTokenFromHook();

    var storageData = await new Promise(function(resolve){
      chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key","ql_session_id"], resolve);
    });
    var projectId = storageData.lovable_projectId || "";
    var token = storageData.lovable_token || "";
    var licenseKey = storageData.ql_license_key || "";

    if(!projectId || !token){
      if(log){ log.className = "ql-log-error"; log.innerText = "\u26a0 Projeto n\u00e3o sincronizado."; }
      btn.disabled = false;
      btn.textContent = "\ud83d\udeab Remover Marca de \u00c1gua";
      return;
    }

    if(token.startsWith("Bearer ")) token = token.slice(7);

    try {
      var payload = {
        license_key: licenseKey,
        session_id: qlSessionId,
        projeto_id: projectId,
        token_lovable: token,
        mensagem: WATERMARK_REMOVAL_PROMPT,
        modo_pensar: false
      };

      var result = await bgFetch(PROXY_COMMAND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify(payload)
      });

      if(result && result.success === false){
        throw new Error(result.error_display || result.message || "Erro no envio");
      }

      if(log){ log.className = "ql-log-success"; log.innerText = "\u2713 Marca de \u00e1gua removida com sucesso!"; }
    } catch(err) {
      if(log){ log.className = "ql-log-error"; log.innerText = "\u2717 " + (err.message || err); }
    } finally {
      btn.disabled = false;
      btn.textContent = "\ud83d\udeab Remover Marca de \u00c1gua";
    }
  });
}

function updateTrialCountdown(){
  if(!qlExpiresAt) return;
  const el = document.getElementById("ql-trial-countdown");
  if(!el) return;
  el.style.display = "block";

  const createdAt = Date.now();
  const expiresMs = new Date(qlExpiresAt).getTime();
  const totalDuration = Math.max(expiresMs - createdAt, 3600000);

  function update(){
    const remaining = expiresMs - Date.now();
    if(remaining <= 0){
      el.innerHTML = '<span class="ql-countdown-expired">⏰ Licença expirada</span><div class="ql-trial-bar"><div class="ql-trial-bar-fill ql-bar-expired" style="width:0%"></div></div>';
      handleLicenseExpired();
      return;
    }
    const days = Math.floor(remaining / 86400000);
    const hrs = Math.floor((remaining % 86400000) / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct = Math.max(0, Math.min(100, (remaining / totalDuration) * 100));

    let timeStr = '';
    if(days > 0) timeStr = days + 'd ' + hrs + 'h ' + mins + 'm';
    else if(hrs > 0) timeStr = hrs + 'h ' + mins + 'm ' + String(secs).padStart(2,'0') + 's';
    else timeStr = mins + ':' + String(secs).padStart(2,'0');

    const urgentClass = pct < 20 ? ' ql-bar-urgent' : '';
    const label = qlLicenseStatus === 'trial' ? 'Teste expira em' : 'Plano expira em';

    el.innerHTML = '<div class="ql-countdown-row"><span class="ql-countdown-icon">⏳</span><span class="ql-countdown-label">' + label + '</span><span class="ql-countdown-time">' + timeStr + '</span></div><div class="ql-trial-bar"><div class="ql-trial-bar-fill' + urgentClass + '" style="width:' + pct + '%"></div></div>';
  }
  update();
  if(window.qlCountdownInterval) clearInterval(window.qlCountdownInterval);
  window.qlCountdownInterval = setInterval(update, 1000);
}

function setupMinimize(){
  const btn = document.getElementById("ql-minimize");
  if(!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const box = document.getElementById("ql-floating");
    if(!box) return;
    qlMinimized = !qlMinimized;
    box.classList.toggle("ql-minimized", qlMinimized);
    btn.textContent = qlMinimized ? "□" : "−";
    chrome.storage.local.set({ ql_minimized: qlMinimized });
  });
}

function setupDarkMode(){
  const moonBtn = document.querySelector('.ql-icon-btn[title="Tema"]');
  if(!moonBtn) return;
  moonBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const box = document.getElementById("ql-floating");
    if(!box) return;
    const isLight = box.classList.toggle("ql-light");
    chrome.storage.local.set({ ql_dark_mode: !isLight, ql_theme_user_choice: true });
  });
}

function setupModoPlano(){
  const toggle = document.getElementById("ql-modo-plano");
  if(!toggle) return;

  chrome.storage.local.get(["ql_modo_plano"], (res) => {
    if(res.ql_modo_plano === true) toggle.checked = true;
  });

  toggle.addEventListener("change", () => {
    chrome.storage.local.set({ ql_modo_plano: toggle.checked });

    if(toggle.checked){
      showModoPlanoAlert();
    }
  });
}

function showModoPlanoAlert(){
  const existing = document.querySelector('.ql-modo-plano-overlay');
  if(existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'ql-modo-plano-overlay';
  overlay.innerHTML = '<div class="ql-modo-plano-modal">' +
    '<div class="ql-modo-plano-icon">\u26a0\ufe0f</div>' +
    '<div class="ql-modo-plano-title">Aten\u00e7\u00e3o \u2014 Modo Plano</div>' +
    '<div class="ql-modo-plano-body">' +
      'O <strong>Modo Plano/Pensar</strong> pode consumir cr\u00e9ditos, mas oferece um bom aux\u00edlio. Use com modera\u00e7\u00e3o!' +
    '</div>' +
    '<div class="ql-modo-plano-steps">' +
      '<div class="ql-modo-plano-step"><span class="ql-modo-plano-step-num">1</span><span class="ql-modo-plano-step-text">Ative o <strong>Modo Plano</strong> para gerar um plano.</span></div>' +
      '<div class="ql-modo-plano-step"><span class="ql-modo-plano-step-num">2</span><span class="ql-modo-plano-step-text">No Lovable, <strong>n\u00e3o clique no bot\u00e3o Aprovar</strong>; apenas copie o novo plano.</span></div>' +
      '<div class="ql-modo-plano-step"><span class="ql-modo-plano-step-num">3</span><span class="ql-modo-plano-step-text">Cole o plano copiado no prompt da extens\u00e3o.</span></div>' +
      '<div class="ql-modo-plano-step"><span class="ql-modo-plano-step-num">4</span><span class="ql-modo-plano-step-text"><strong>Desligue o Modo Plano</strong> e envie pela extens\u00e3o; assim nenhum cr\u00e9dito extra ser\u00e1 consumido.</span></div>' +
    '</div>' +
    '<div class="ql-modo-plano-check">' +
      '<input type="checkbox" id="ql-modo-plano-dismiss" />' +
      '<label for="ql-modo-plano-dismiss">N\u00e3o mostrar novamente</label>' +
    '</div>' +
    '<button class="ql-modo-plano-btn" id="ql-modo-plano-ok">Entendi!</button>' +
  '</div>';

  const box = document.getElementById('ql-floating');
  if(box) box.appendChild(overlay);
  else document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('ql-modo-plano-visible'));

  const close = () => {
    overlay.classList.remove('ql-modo-plano-visible');
    setTimeout(() => overlay.remove(), 180);
  };

  const okBtn = overlay.querySelector('#ql-modo-plano-ok');
  if(okBtn){
    okBtn.addEventListener('click', () => {
      const dismiss = overlay.querySelector('#ql-modo-plano-dismiss');
      if(dismiss && dismiss.checked){
        chrome.storage.local.set({ ql_modo_plano_alert_dismissed: true });
      }
      close();
    });
  }

  overlay.addEventListener('click', (e) => {
    if(e.target === overlay) close();
  });
}

function setupShield(){
  const btn = document.getElementById("ql-shield-btn");
  if(!btn) return;

  chrome.storage.local.get(["ql_shield_active"], (res) => {
    if(res.ql_shield_active === true) {
      qlShieldActive = true;
      btn.classList.add("ql-shield-active");
      const label = document.getElementById("ql-shield-label");
      if(label) label.textContent = "Desativar Escudo";
      injectShieldOverlay();
    }
  });

  btn.addEventListener("click", () => {
    qlShieldActive = !qlShieldActive;
    chrome.storage.local.set({ ql_shield_active: qlShieldActive });

    const label = document.getElementById("ql-shield-label");
    if(qlShieldActive) {
      btn.classList.add("ql-shield-active");
      if(label) label.textContent = "Desativar Escudo";
      injectShieldOverlay();
      showCustomAlert("Escudo Ativado 🛡️", "O input do Lovable está bloqueado. Use a extensão para enviar prompts.");
    } else {
      btn.classList.remove("ql-shield-active");
      if(label) label.textContent = "Ativar Escudo";
      removeShieldOverlay();
      showCustomAlert("Escudo Desativado", "O input do Lovable está liberado novamente.");
    }
  });
}

function injectShieldOverlay(){
  if(document.getElementById("ql-shield-overlay")) return;

  const chatForm = document.querySelector('form#chat-input');
  if(!chatForm) {
    setTimeout(injectShieldOverlay, 1000);
    return;
  }

  const existingPos = getComputedStyle(chatForm).position;
  if(existingPos === 'static') {
    chatForm.style.position = 'relative';
  }

  const overlay = document.createElement('div');
  overlay.id = 'ql-shield-overlay';
  overlay.className = 'ql-shield-overlay';
  overlay.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
    '</svg>' +
    '<span class="ql-shield-overlay-text">\ud83d\udee1\ufe0f Protegido pelo Main Lovable</span>' +
    '<span class="ql-shield-overlay-sub">Use a extens\u00e3o para enviar prompts</span>';

  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);

  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);

  overlay.addEventListener('keydown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, true);

  chatForm.appendChild(overlay);

  const inputs = chatForm.querySelectorAll('input, button, textarea, [contenteditable]');
  inputs.forEach(el => {
    if(el.id !== 'ql-shield-overlay') {
      el.dataset.qlShieldDisabled = el.disabled || '';
      el.dataset.qlShieldTabindex = el.getAttribute('tabindex') || '';
      el.setAttribute('tabindex', '-1');
      if(el.tagName !== 'DIV') el.disabled = true;
      if(el.contentEditable === 'true') {
        el.contentEditable = 'false';
        el.dataset.qlShieldEditable = 'true';
      }
    }
  });
}

function removeShieldOverlay(){
  const overlay = document.getElementById('ql-shield-overlay');
  if(overlay) overlay.remove();

  const chatForm = document.querySelector('form#chat-input');
  if(!chatForm) return;

  const inputs = chatForm.querySelectorAll('[data-ql-shield-disabled]');
  inputs.forEach(el => {
    const wasDis = el.dataset.qlShieldDisabled;
    if(wasDis === 'true') el.disabled = true;
    else if(wasDis === '' || wasDis === 'false') el.disabled = false;
    delete el.dataset.qlShieldDisabled;

    const oldTab = el.dataset.qlShieldTabindex;
    if(oldTab) el.setAttribute('tabindex', oldTab);
    else el.removeAttribute('tabindex');
    delete el.dataset.qlShieldTabindex;

    if(el.dataset.qlShieldEditable === 'true') {
      el.contentEditable = 'true';
      delete el.dataset.qlShieldEditable;
    }
  });
}


function startHeartbeat(licenseKey){
  if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);

  qlHeartbeatInterval = setInterval(async () => {
    try {
      const data = await bgFetch(VALIDATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: licenseKey, session_id: qlSessionId, heartbeat: true, device_id: qlDeviceId })
      });

      if(!data.valid){
        clearInterval(qlHeartbeatInterval);
        const msg = data.reason === "device_conflict" ? data.message : null;
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_activated_at","ql_license_status"], () => {
          const box = document.getElementById("ql-floating");
          if(box) showLicenseGate(box);
          if(msg) setTimeout(() => showCustomAlert("Acesso Negado", msg), 500);
        });
        return;
      }

      qlOnlineCount = data.online_count || 0;
      const countEl = document.getElementById("ql-online-count");
      if(countEl) countEl.textContent = qlOnlineCount;

      if(data.user_name) {
        qlUserName = data.user_name;
        qlLicenseStatus = data.status || qlLicenseStatus;
        qlExpiresAt = data.expires_at || qlExpiresAt;
        qlActivatedAt = data.activated_at || qlActivatedAt;
        chrome.storage.local.set({ ql_user_name: qlUserName, ql_license_status: qlLicenseStatus, ql_expires_at: qlExpiresAt, ql_activated_at: qlActivatedAt });
        const nameEl = document.querySelector(".ql-profile-name");
        if(nameEl) nameEl.textContent = data.user_name;
      }

    } catch(err) {
      console.warn("[QL] Heartbeat error", err);
    }
  }, 60000);
}

let qlExpiredHandled = false;

function handleLicenseExpired(){
  if(qlExpiredHandled) return;
  qlExpiredHandled = true;
  if(qlHeartbeatInterval) clearInterval(qlHeartbeatInterval);
  if(window.qlCountdownInterval) clearInterval(window.qlCountdownInterval);

  const overlay = document.createElement("div");
  overlay.className = "ql-sweetalert-overlay";
  overlay.innerHTML = templateExpiredOverlay();

  const box = document.getElementById("ql-floating");
  if(box) box.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("ql-sweetalert-visible"));

  const renewBtn = overlay.querySelector("#ql-sweetalert-renew");
  if(renewBtn){
    renewBtn.addEventListener("click", () => {
      overlay.remove();
      if(box) showPaymentUI(box);
    });
  }

  const closeBtn = overlay.querySelector("#ql-sweetalert-close");
  if(closeBtn){
    closeBtn.addEventListener("click", () => {
      overlay.classList.remove("ql-sweetalert-visible");
      setTimeout(() => {
        overlay.remove();
        chrome.storage.local.remove(["ql_license_valid","ql_license_key","ql_session_id","ql_user_name","ql_expires_at","ql_license_status"], () => {
          if(box) showLicenseGate(box);
        });
      }, 300);
    });
  }
}

async function showPaymentUI(box, preselectedPkg){
  if(preselectedPkg){
    showCheckoutScreen(box, preselectedPkg);
    return;
  }

  box.innerHTML = templatePaymentUI(qlMinimized);

  setupMinimize();
  setupDrag();
  setupResize();

  const backBtn = document.getElementById("ql-pay-back");
  if(backBtn){
    backBtn.addEventListener("click", () => {
      chrome.storage.local.get(["ql_license_valid"], (res) => {
        if(res.ql_license_valid) showMainUI(box);
        else showLicenseGate(box);
      });
    });
  }

  try {
    const packages = await bgFetch(PACKAGES_URL, {
      method: "GET",
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY }
    });

    const list = document.getElementById("ql-packages-list");
    if(!list) return;
    if(!packages || !Array.isArray(packages) || packages.length === 0){
      list.innerHTML = '<div class="ql-pay-loading">Nenhum plano disponível.</div>';
      return;
    }

    list.innerHTML = packages.map(pkg => templatePackageCard(pkg)).join('');

    list.querySelectorAll(".ql-pkg-card").forEach(card => {
      card.querySelector(".ql-pkg-select-btn").addEventListener("click", () => {
        const pkg = {
          id: card.getAttribute("data-pkg-id"),
          name: card.getAttribute("data-pkg-name"),
          price: card.getAttribute("data-pkg-price")
        };
        showCheckoutScreen(box, pkg);
      });
    });

  } catch(err) {
    console.error("[QL] Package load error:", err);
    const list = document.getElementById("ql-packages-list");
    if(list) list.innerHTML = '<div class="ql-pay-loading">Erro ao carregar planos. Tente novamente.</div>';
  }
}

function showCheckoutScreen(box, pkg){
  box.innerHTML = templateCheckoutScreen(pkg, qlMinimized);

  setupMinimize();
  setupDrag();
  setupResize();

  let selectedMethod = "mpesa";

  const backBtn = document.getElementById("ql-checkout-back");
  if(backBtn){
    backBtn.addEventListener("click", () => showPaymentUI(box));
  }

  document.querySelectorAll(".ql-method-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ql-method-btn").forEach(b => b.classList.remove("ql-method-active"));
      btn.classList.add("ql-method-active");
      selectedMethod = btn.getAttribute("data-method");
      const hint = document.getElementById("ql-phone-hint");
      if(hint) hint.textContent = selectedMethod === "mpesa" ? "M-Pesa: 84 ou 85" : "e-Mola: 86 ou 87";
    });
  });

  const confirmBtn = document.getElementById("ql-confirm-pay");
  if(confirmBtn){
    confirmBtn.addEventListener("click", async () => {
      const phone = (document.getElementById("ql-pay-phone") || {}).value ? (document.getElementById("ql-pay-phone") || {}).value.replace(/\D/g,"") : "";
      const log = document.getElementById("ql-pay-log");

      if(phone.length !== 9){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "Número deve ter 9 dígitos."; }
        return;
      }
      const prefix = phone.substring(0,2);
      if(selectedMethod === "mpesa" && !["84","85"].includes(prefix)){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "M-Pesa: use 84 ou 85."; }
        return;
      }
      if(selectedMethod === "emola" && !["86","87"].includes(prefix)){
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "e-Mola: use 86 ou 87."; }
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = "⏳ Processando...";
      if(log){ log.className = "ql-pay-log ql-pay-info"; log.textContent = "Enviando solicitação de pagamento..."; }

      try {
        const storageData = await new Promise(r => chrome.storage.local.get(["ql_license_key"], r));
        const licenseKey = storageData.ql_license_key || "";

        const result = await bgFetch(EXT_PAYMENT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
          body: JSON.stringify({
            packageId: pkg.id,
            numero: phone,
            metodo: selectedMethod,
            license_key: licenseKey || undefined
          })
        });

        if(result && result.status === "sucesso"){
          const bodyEl = document.getElementById("ql-body");
          if(bodyEl){
            bodyEl.innerHTML = templatePaymentSuccess(result.license_key);

            const copyBtn = document.getElementById("ql-copy-key");
            if(copyBtn){
              copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(result.license_key).then(() => {
                  copyBtn.textContent = "✅ Copiado!";
                  setTimeout(() => { copyBtn.textContent = "📋 Copiar Chave"; }, 2000);
                }).catch(() => {
                  const keyEl = document.getElementById("ql-new-key");
                  if(keyEl){ const r = document.createRange(); r.selectNodeContents(keyEl); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); }
                  copyBtn.textContent = "Seleccionado — Ctrl+C";
                });
              });
            }

            const activateBtn = document.getElementById("ql-activate-key");
            if(activateBtn){
              activateBtn.addEventListener("click", () => {
                chrome.storage.local.set({
                  ql_license_valid: true,
                  ql_license_key: result.license_key,
                  ql_expires_at: result.expires_at || null,
                  ql_license_status: "active",
                  ql_session_id: null
                }, () => {
                  qlExpiresAt = result.expires_at || null;
                  qlLicenseStatus = "active";
                  qlExpiredHandled = false;
                  showMainUI(box);
                  startHeartbeat(result.license_key);
                });
              });
            }
          }
        } else {
          const errMsg = (result && result.error) ? result.error : "Pagamento falhou. Tente novamente.";
          if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "✗ " + errMsg; }
          confirmBtn.disabled = false;
          confirmBtn.textContent = "💰 Pagar " + pkg.price + " MZN";
        }
      } catch(err) {
        if(log){ log.className = "ql-pay-log ql-pay-error"; log.textContent = "✗ " + (err.message || "Erro de conexão."); }
        confirmBtn.disabled = false;
        confirmBtn.textContent = "💰 Pagar " + pkg.price + " MZN";
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ()=> setTimeout(createUI, 120));
} else {
  setTimeout(createUI, 120);
}

let tries = 0;
const retryInterval = setInterval(()=>{
  if(document.getElementById("ql-floating") || tries >= 8){ clearInterval(retryInterval); return; }
  tries++;
  createUI();
}, 800);

chrome.storage.onChanged.addListener((changes, area) => {
  if(area !== "local") return;
  if(changes.ql_sidebar_mode) {
    if(changes.ql_sidebar_mode.newValue === true) {
      const floatingBox = document.getElementById("ql-floating");
      if(floatingBox) {
        floatingBox.style.transition = "opacity 0.3s ease, transform 0.3s ease";
        floatingBox.style.opacity = "0";
        floatingBox.style.transform = "scale(0.95)";
        setTimeout(() => floatingBox.remove(), 350);
      }
    } else if(changes.ql_sidebar_mode.newValue === false) {
      setTimeout(() => {
        _buildFloatingUI();
        setTimeout(() => {
          const floatingBox = document.getElementById("ql-floating");
          if(floatingBox) {
            floatingBox.style.opacity = "0";
            floatingBox.style.transform = "scale(0.95) translateX(20px)";
            requestAnimationFrame(() => {
              floatingBox.style.transition = "opacity 0.4s ease, transform 0.4s ease";
              floatingBox.style.opacity = "1";
              floatingBox.style.transform = "scale(1) translateX(0)";
            });
          }
        }, 50);
      }, 100);
    }
  }
});

function updateSyncStatus(){
  chrome.storage.local.get(["lovable_projectId","lovable_token"], (res)=>{
    const status = document.getElementById("ql-sync-status");
    if(!status) return;
    if(res.lovable_projectId && res.lovable_token){
      status.className = "ql-sync-status ql-sync-ok";
      const pid = res.lovable_projectId.substring(0, 6);
      status.innerHTML = '<span class="ql-sync-text">✅ Sincronizado! Projeto: ' + pid + '...</span>';
    } else {
      status.className = "ql-sync-status ql-sync-waiting";
      status.innerHTML = '<span class="ql-sync-text">⏳ Aguardando sincronização...</span>';
    }
  });
}

function setupStorageWatch(){
  chrome.storage.onChanged.addListener((changes)=>{
    if(changes.lovable_projectId || changes.lovable_token){
      updateSyncStatus();
    }
  });
}

function requestLatestTokenFromHook(timeoutMs = 1200){
  return new Promise((resolve)=>{
    let finished = false;

    function finish(updated){
      if(finished) return;
      finished = true;
      clearTimeout(timer);
      chrome.storage.onChanged.removeListener(onStorageChange);
      resolve(updated);
    }

    function onStorageChange(changes, area){
      if(area !== "local") return;
      if(changes.lovable_token && changes.lovable_token.newValue){
        finish(true);
      }
    }

    const timer = setTimeout(()=> finish(false), Math.max(300, timeoutMs));
    chrome.storage.onChanged.addListener(onStorageChange);

    try {
      window.postMessage({ type: "lovableRequestToken" }, "*");
      setTimeout(()=> window.postMessage({ type: "lovableRequestToken" }, "*"), 120);
    } catch(e) {
      finish(false);
    }
  });
}

// ===== CHAT HISTORY SYSTEM (Floating Popup) =====
function loadChatHistory(cb) {
  chrome.storage.local.get([QL_HISTORY_KEY], (res) => {
    qlChatHistory = res[QL_HISTORY_KEY] || [];
    updateHistoryBadge();
    if(cb) cb();
  });
}

function saveChatHistory() {
  if(qlChatHistory.length > QL_MAX_HISTORY) qlChatHistory = qlChatHistory.slice(-QL_MAX_HISTORY);
  chrome.storage.local.set({ [QL_HISTORY_KEY]: qlChatHistory });
}

function addToChatHistory(text, status) {
  qlChatHistory.push({ text: text, timestamp: new Date().toISOString(), status: status || 'ok' });
  saveChatHistory();
  updateHistoryBadge();
}

function updateHistoryBadge() {
  const badge = document.getElementById('ql-history-badge');
  if(!badge) return;
  if(qlChatHistory.length > 0) {
    badge.textContent = qlChatHistory.length;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

function formatChatDate(dateStr) {
  var d = new Date(dateStr);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = (today - msgDay) / 86400000;
  if(diff === 0) return 'Hoje';
  if(diff === 1) return 'Ontem';
  if(diff < 7) return ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()];
  return d.toLocaleDateString('pt-BR');
}

function formatChatTime(dateStr) {
  var d = new Date(dateStr);
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

function renderHistoryView() {
  const container = document.getElementById('ql-tab-content');
  if(!container) return;

  if(!qlChatHistory.length) {
    container.innerHTML = '<div class="ql-chat-empty"><div style="font-size:28px;margin-bottom:8px">💬</div><div style="font-size:13px;font-weight:600;color:var(--ql-text-primary,#f4f4f5)">Nenhuma mensagem</div><div style="font-size:11px;color:var(--ql-text-muted,#71717a);margin-top:4px">Seus prompts enviados aparecerão aqui.</div></div>';
    return;
  }

  let html = '<div class="ql-chat-messages">';
  let lastDate = '';
  for(let i = 0; i < qlChatHistory.length; i++) {
    const m = qlChatHistory[i];
    const dateLabel = formatChatDate(m.timestamp);
    if(dateLabel !== lastDate) {
      html += '<div class="ql-chat-date-divider"><span class="ql-chat-date-label">' + dateLabel + '</span></div>';
      lastDate = dateLabel;
    }
    const statusClass = m.status === 'error' ? 'ql-chat-status-err' : 'ql-chat-status-ok';
    const statusText = m.status === 'error' ? '✗ Erro' : '✓ Enviado';
    const truncated = m.text.length > 300 ? escapeHtml(m.text.substring(0, 300)) + '…' : escapeHtml(m.text);
    html += '<div class="ql-chat-bubble" title="' + escapeHtml(m.text) + '">' + truncated +
      '<div class="ql-chat-meta"><span class="' + statusClass + '">' + statusText + '</span><span class="ql-chat-time">' + formatChatTime(m.timestamp) + '</span></div></div>';
  }
  html += '</div>';
  html += '<div class="ql-chat-actions"><span class="ql-chat-count">' + qlChatHistory.length + ' mensagen' + (qlChatHistory.length === 1 ? '' : 's') + '</span><button class="ql-chat-clear" id="ql-chat-clear">🗑 Limpar</button></div>';
  container.innerHTML = html;

  const msgs = container.querySelector('.ql-chat-messages');
  if(msgs) msgs.scrollTop = msgs.scrollHeight;

  const clearBtn = document.getElementById('ql-chat-clear');
  if(clearBtn) {
    clearBtn.addEventListener('click', () => {
      qlChatHistory = [];
      saveChatHistory();
      updateHistoryBadge();
      renderHistoryView();
    });
  }
}

function renderPromptView() {
  const container = document.getElementById('ql-tab-content');
  if(!container) return;
  // Restore prompt tab content
  container.innerHTML =
    '<textarea id="ql-msg" rows="3" placeholder="Digite seu comando..." spellcheck="false"></textarea>' +
    '<div id="ql-attach-preview" class="ql-attach-preview" style="display:none"></div>' +
    '<div class="ql-action-bar">' +
      '<div class="ql-action-left">' +
        '<label class="ql-toggle"><input type="checkbox" id="ql-modo-plano"><span class="ql-toggle-slider"></span></label>' +
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
    '</button>';
  // Re-setup all prompt tab features
  setupSend();
  setupSuggestionChips();
  setupWatermarkButton();
  setupOptimize();
  setupSpeech();
  setupModoPlano();
  setupFileAttachment();
  setupShield();
  setupNativeChatButton();
}

function setupTabs() {
  const tabs = document.querySelectorAll('.ql-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      qlActiveTab = target;
      document.querySelectorAll('.ql-tab').forEach(t => t.classList.toggle('ql-tab-active', t.getAttribute('data-tab') === target));
      if(target === 'history') {
        loadChatHistory(() => renderHistoryView());
      } else if(target === 'downloads') {
        renderDownloadsView();
      } else {
        renderPromptView();
      }
    });
  });
}

function renderDownloadsView() {
  const container = document.getElementById('ql-tab-content');
  if(!container) return;
  container.innerHTML = templateDownloadsView();

  // Setup download button clicks
  container.querySelectorAll('.ql-download-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-dl-url');
      chrome.runtime.sendMessage({ action: "openUrl", url });
    });
  });
}




// ===== FILE ATTACHMENT SYSTEM =====
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
let qlAttachedFiles = [];

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function isImageType(type) {
  return ['image/png', 'image/jpeg', 'image/webp'].includes(type);
}

async function compressImage(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_DIM = 1280;
      let w = img.width, h = img.height;
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = file.type === 'image/png' ? undefined : 0.8;
      canvas.toBlob((blob) => {
        if (!blob) return resolve({ file, previewUrl: null });
        const compressed = new File([blob], file.name, { type: outputType });
        const previewUrl = URL.createObjectURL(blob);
        resolve({ file: compressed, previewUrl });
      }, outputType, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ file, previewUrl: null }); };
    img.src = url;
  });
}

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

function decodeJwtUserId(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload !== 'object') return null;
  return payload.sub || payload.user_id || null;
}

async function uploadFileDirect(file, token) {
  const fileId = crypto.randomUUID();
  const userId = decodeJwtUserId(token);
  if (!userId) throw new Error('Não foi possível extrair userId do token');

  const inferContentType = (f) => {
    if (f && typeof f.type === 'string' && f.type.trim()) return f.type;
    const name = (f && f.name ? f.name : '').toLowerCase();
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
  };

  const buildUploadFileName = (id, f) => {
    const rawName = f && f.name ? String(f.name) : '';
    const ext = rawName.includes('.') ? rawName.split('.').pop().toLowerCase() : '';
    const safeExt = ext && /^[a-z0-9]{1,10}$/.test(ext) ? ext : 'bin';
    return id + '.' + safeExt;
  };

  const contentType = inferContentType(file);
  const uploadFileName = buildUploadFileName(fileId, file);

  const uploadUrlResp = await bgFetch('https://api.lovable.dev/files/generate-upload-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({
      file_name: uploadFileName,
      content_type: contentType,
      status: 'uploading'
    })
  });

  var signedUrl = (uploadUrlResp && uploadUrlResp.url) || (uploadUrlResp && uploadUrlResp.signed_url) || (uploadUrlResp && uploadUrlResp.signedUrl) || (uploadUrlResp && uploadUrlResp.data && uploadUrlResp.data.url) || null;
  if (!signedUrl) throw new Error('URL assinada não retornada');

  await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
        else reject(new Error('Upload PUT falhou: ' + xhr.status));
      };
      xhr.onerror = () => reject(new Error('Erro de rede no upload'));
      xhr.send(file);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });

  try {
    await bgFetch('https://api.lovable.dev/files/generate-download-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        dir_name: userId,
        file_name: uploadFileName
      })
    });
  } catch (e) {
    console.warn('[QL Upload] download-url confirmation failed (non-critical):', e);
  }

  return { file_id: uploadFileName, file_name: file.name || 'file' };
}

function renderAttachPreview() {
  const container = document.getElementById('ql-attach-preview');
  if (!container) return;
  if (qlAttachedFiles.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  container.style.display = 'flex';
  container.innerHTML = qlAttachedFiles.map((f, i) => {
    const thumbHtml = f.previewUrl
      ? '<img class="ql-attach-thumb" src="' + f.previewUrl + '" alt="">'
      : '<div class="ql-attach-icon">📄</div>';
    const uploadingClass = f.uploading ? ' ql-attach-uploading' : '';
    return '<div class="ql-attach-item' + uploadingClass + '" data-idx="' + i + '">' +
      thumbHtml +
      '<div class="ql-attach-info"><span class="ql-attach-name" title="' + escapeHtml(f.file_name) + '">' + escapeHtml(f.file_name) + '</span><span class="ql-attach-size">' + escapeHtml(f.sizeLabel) + '</span></div>' +
      '<button class="ql-attach-remove" data-idx="' + i + '">✕</button>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.ql-attach-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'));
      if (qlAttachedFiles[idx] && qlAttachedFiles[idx].previewUrl) {
        URL.revokeObjectURL(qlAttachedFiles[idx].previewUrl);
      }
      qlAttachedFiles.splice(idx, 1);
      renderAttachPreview();
    });
  });
}

function setupFileAttachment() {
  const attachBtn = document.getElementById('ql-attach-btn');
  const fileInput = document.getElementById('ql-file-input');
  if (!attachBtn || !fileInput) return;

  attachBtn.addEventListener('click', () => {
    if (qlAttachedFiles.length >= MAX_FILES) {
      showCustomAlert('Limite', 'Máximo de ' + MAX_FILES + ' arquivos.');
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!files.length) return;

    const storageData = await new Promise(r => chrome.storage.local.get(['lovable_token'], r));
    let token = storageData.lovable_token || '';
    if (!token) {
      showCustomAlert('Erro', 'Token não capturado. Navegue no Lovable para sincronizar.');
      return;
    }
    if (token.startsWith('Bearer ')) token = token.slice(7);

    for (const file of files) {
      if (qlAttachedFiles.length >= MAX_FILES) {
        showCustomAlert('Limite', 'Máximo de ' + MAX_FILES + ' arquivos atingido.');
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        showCustomAlert('Arquivo grande', file.name + ' excede 20MB.');
        continue;
      }

      let processedFile = file;
      let previewUrl = null;

      if (isImageType(file.type)) {
        const result = await compressImage(file);
        processedFile = result.file;
        previewUrl = result.previewUrl;
      }

      const isImage = isImageType(processedFile.type);
      const placeholderIdx = qlAttachedFiles.length;
      qlAttachedFiles.push({
        file_id: null,
        file_name: file.name,
        previewUrl: previewUrl,
        file_type: processedFile.type,
        sizeLabel: formatFileSize(processedFile.size),
        uploading: true,
        rawFile: processedFile
      });
      renderAttachPreview();

      try {
        const result = await uploadFileDirect(processedFile, token);
        qlAttachedFiles[placeholderIdx].file_id = result.file_id;
        qlAttachedFiles[placeholderIdx].uploading = false;
        renderAttachPreview();
      } catch (err) {
        console.warn('[QL Upload] Signed URL failed, keeping file for direct FormData send:', err.message);
        qlAttachedFiles[placeholderIdx].uploading = false;
        qlAttachedFiles[placeholderIdx].file_id = 'local_direct_' + crypto.randomUUID();
        qlAttachedFiles[placeholderIdx].uploadFailed = true;
        renderAttachPreview();
      }
    }
  });
}

function setupSend(){
  const btn = document.getElementById("ql-send");
  if(!btn) return;
  btn.addEventListener("click", async ()=>{
    var msgEl = document.getElementById("ql-msg");
    const mensagem = msgEl ? (msgEl.value || "").trim() : "";
    var modoPlanoEl = document.getElementById("ql-modo-plano");
    const modoPlano = modoPlanoEl ? modoPlanoEl.checked : false;
    const log = document.getElementById("ql-log");

    if(!mensagem){
      if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Prompt vazio"; }
      return;
    }

    await requestLatestTokenFromHook();

    const storageData = await new Promise((resolve) => {
      chrome.storage.local.get(["lovable_projectId","lovable_token","ql_license_key","ql_session_id"], resolve);
    });
    const projectId = storageData.lovable_projectId || "";
    let token = storageData.lovable_token || "";
    const licenseKey = storageData.ql_license_key || "";

    if(!projectId || !token){
      if(log){ log.className = "ql-log-error"; log.innerText = "⚠ Projeto não sincronizado. Navegue no Lovable para capturar o token."; }
      return;
    }

    if (token.startsWith("Bearer ")) token = token.slice(7);

    const filesPayload = qlAttachedFiles
      .filter(f => f.file_id && !f.uploading && !f.uploadFailed)
      .map(f => ({ file_id: f.file_id, file_name: f.file_name }));

    // Find any file with rawFile available for direct FormData send
    const directFiles = qlAttachedFiles.filter(f => !f.uploading && f.rawFile);
    const directFile = directFiles.length > 0 ? directFiles[0] : null;
    const isImage = directFile && isImageType(directFile.file_type);

    try{
      if(directFile) {
        if(log){ log.className = "ql-log-info"; log.innerText = "📎 Preparando arquivo para envio..."; }
      } else {
        if(log){ log.className = "ql-log-info"; log.innerText = "⏳ Enviando prompt..."; }
      }
      btn.classList.add("ql-sending");
      btn.disabled = true;

      // Build payload for proxy-command (handles everything server-side)
      const payload = {
        license_key: licenseKey,
        session_id: qlSessionId,
        projeto_id: projectId,
        token_lovable: token,
        mensagem: mensagem,
        modo_pensar: modoPlano,
        files: filesPayload
      };

      // If there's a file, encode and include in payload
      if (directFile && directFile.rawFile) {
        if(log){ log.className = "ql-log-info"; log.innerText = "📤 Codificando arquivo..."; }
        const base64Data = await fileToBase64(directFile.rawFile);
        payload.file_data = base64Data;
        payload.file_name = directFile.file_name || 'file';
        payload.file_type = directFile.file_type || 'application/octet-stream';
        if(log){ log.className = "ql-log-info"; log.innerText = "📡 Enviando via servidor seguro..."; }
      }

      var result = await bgFetch(PROXY_COMMAND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
        body: JSON.stringify(payload)
      });

      if(result && result.success === false){
        throw new Error(result.error_display || result.message || "Erro no envio");
      }

      var apiData = result.data || result;
      var msgId = apiData.ai_message_id_usado || '';
      if(log){
        if (directFile) {
          log.className = "ql-log-success";
          log.innerText = isImage ? "✓ Prompt enviado! imagem válida 😁" : "✓ Prompt enviado com arquivo!";
        } else {
          log.className = "ql-log-success";
          log.innerText = "✓ Prompt enviado!";
        }
      }
      if (msgId) console.log('[QL] API message ID:', msgId);

      // Save to chat history
      addToChatHistory(mensagem, 'ok');

      var msgEl = document.getElementById("ql-msg");
      if(msgEl) msgEl.value = "";

      qlAttachedFiles.forEach(f => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
      qlAttachedFiles = [];
      renderAttachPreview();
    }catch(err){
      if(log){ log.className = "ql-log-error"; log.innerText = "✗ " + (err.message || err); }
      addToChatHistory(mensagem, 'error');
    } finally {
      btn.classList.remove("ql-sending");
      btn.disabled = false;
    }
  });
}

// Store references to avoid stacking listeners
let _dragCleanup = null;
let _resizeCleanup = null;

function setupDrag(){
  if(_dragCleanup) { _dragCleanup(); _dragCleanup = null; }

  const box = document.getElementById("ql-floating");
  const header = document.getElementById("ql-header");
  if(!box || !header) return;

  let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

  function onPointerDown(e){
    if(e.target.closest(".ql-minimize-btn") || e.target.closest(".ql-icon-btn") || e.target.closest("button")) return;
    if(e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = rect.left; startTop = rect.top;
    dragging = true;
    try { header.setPointerCapture(e.pointerId); } catch(ex){}
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.body.style.userSelect = "none";
  }

  function onPointerMove(e){
    if(!dragging) return;
    let newLeft = startLeft + (e.clientX - startX);
    let newTop = startTop + (e.clientY - startY);
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - box.offsetWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - box.offsetHeight));
    box.style.left = newLeft + "px";
    box.style.top = newTop + "px";
  }

  function onPointerUp(e){
    if(!dragging) return;
    dragging = false;
    try { header.releasePointerCapture(e.pointerId); } catch(ex){}
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.body.style.userSelect = "";
  }

  header.addEventListener("pointerdown", onPointerDown, {passive:false});

  _dragCleanup = function(){
    header.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  };
}

function setupResize(){
  if(_resizeCleanup) { _resizeCleanup(); _resizeCleanup = null; }

  const box = document.getElementById("ql-floating");
  const handle = document.getElementById("ql-resize-handle");
  if(!box || !handle) return;

  let resizing = false, startY = 0, startH = 0;

  function onDown(e){
    e.preventDefault();
    e.stopPropagation();
    resizing = true;
    startY = e.clientY;
    startH = box.offsetHeight;
    try { handle.setPointerCapture(e.pointerId); } catch(ex){}
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.body.style.userSelect = "none";
  }

  function onMove(e){
    if(!resizing) return;
    let newH = startH + (e.clientY - startY);
    newH = Math.max(200, Math.min(newH, window.innerHeight * 0.8));
    box.style.height = newH + "px";
  }

  function onUp(e){
    if(!resizing) return;
    resizing = false;
    qlHeight = box.offsetHeight;
    chrome.storage.local.set({ ql_height: qlHeight });
    try { handle.releasePointerCapture(e.pointerId); } catch(ex){}
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.style.userSelect = "";
  }

  handle.addEventListener("pointerdown", onDown, {passive:false});

  _resizeCleanup = function(){
    handle.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
  };
}

// ===== NATIVE CHAT MODE ("Chat Padrão") =====
let qlNativeChatActive = false;
let qlNativeChatCleanup = null;

function activateNativeChat() {
  qlNativeChatActive = true;
  chrome.storage.local.set({ ql_native_chat: true });

  // Hide the extension
  const floatingBox = document.getElementById("ql-floating");
  if (floatingBox) {
    floatingBox.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    floatingBox.style.opacity = "0";
    floatingBox.style.transform = "scale(0.95) translateX(20px)";
    setTimeout(() => { floatingBox.style.display = "none"; }, 350);
  }

  injectNativeChatOverlay();
}

function deactivateNativeChat() {
  qlNativeChatActive = false;
  chrome.storage.local.set({ ql_native_chat: false });

  // Clean up injected elements
  if (qlNativeChatCleanup) { qlNativeChatCleanup(); qlNativeChatCleanup = null; }

  const badge = document.getElementById("ql-native-badge");
  if (badge) badge.remove();
  const returnBtn = document.getElementById("ql-native-return-btn");
  if (returnBtn) returnBtn.remove();

  // Restore send button
  const sendBtn = document.getElementById("chatinput-send-message-button");
  if (sendBtn) {
    sendBtn.classList.remove("ql-native-send-active");
    sendBtn.style.animation = "";
  }

  // Show the extension again
  const floatingBox = document.getElementById("ql-floating");
  if (floatingBox) {
    floatingBox.style.display = "";
    floatingBox.style.opacity = "0";
    floatingBox.style.transform = "scale(0.95)";
    requestAnimationFrame(() => {
      floatingBox.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      floatingBox.style.opacity = "1";
      floatingBox.style.transform = "scale(1) translateX(0)";
    });
  } else {
    // Rebuild if removed
    _buildFloatingUI();
  }
}

function injectNativeChatOverlay() {
  // Wait for chat form to exist
  const chatForm = document.querySelector("form#chat-input");
  if (!chatForm) {
    setTimeout(injectNativeChatOverlay, 500);
    return;
  }

  // Add QL badge on top-right of chat form
  if (!document.getElementById("ql-native-badge")) {
    const existingPos = getComputedStyle(chatForm).position;
    if (existingPos === "static") chatForm.style.position = "relative";

    const badge = document.createElement("div");
    badge.id = "ql-native-badge";
    badge.className = "ql-native-badge";
    badge.innerHTML = "\u26a1 <span>QuantumLovable</span>";
    chatForm.appendChild(badge);
  }

  // Add return button below chat form
  if (!document.getElementById("ql-native-return-btn")) {
    const returnBtn = document.createElement("button");
    returnBtn.id = "ql-native-return-btn";
    returnBtn.className = "ql-native-return-btn";
    returnBtn.innerHTML = "\u2190 Voltar \u00e0 Extens\u00e3o";
    returnBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deactivateNativeChat();
    });
    chatForm.parentElement.insertBefore(returnBtn, chatForm.nextSibling);
  }

  // Style the send button with blink animation
  const sendBtn = document.getElementById("chatinput-send-message-button");
  if (sendBtn) {
    sendBtn.classList.add("ql-native-send-active");
  }

  // Intercept send button click
  function interceptSend(e) {
    if (!qlNativeChatActive) return;

    // Get text from contenteditable
    const editor = chatForm.querySelector('[contenteditable="true"]');
    const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";

    if (!text) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    sendViaNativeChat(text, editor);
  }

  // Intercept form submit
  function interceptSubmit(e) {
    if (!qlNativeChatActive) return;

    const editor = chatForm.querySelector('[contenteditable="true"]');
    const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";

    if (!text) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    sendViaNativeChat(text, editor);
  }

  // Intercept Enter key
  function interceptKeydown(e) {
    if (!qlNativeChatActive) return;
    if (e.key === "Enter" && !e.shiftKey) {
      const editor = chatForm.querySelector('[contenteditable="true"]');
      const text = editor ? (editor.innerText || editor.textContent || "").trim() : "";
      if (!text) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      sendViaNativeChat(text, editor);
    }
  }

  if (sendBtn) sendBtn.addEventListener("click", interceptSend, true);
  chatForm.addEventListener("submit", interceptSubmit, true);
  chatForm.addEventListener("keydown", interceptKeydown, true);

  qlNativeChatCleanup = function() {
    if (sendBtn) sendBtn.removeEventListener("click", interceptSend, true);
    chatForm.removeEventListener("submit", interceptSubmit, true);
    chatForm.removeEventListener("keydown", interceptKeydown, true);
  };
}

async function sendViaNativeChat(text, editor) {
  const sendBtn = document.getElementById("chatinput-send-message-button");

  // Show sending overlay
  showNativeSendingOverlay(true);

  // Visual feedback
  if (sendBtn) {
    sendBtn.style.animation = "none";
    sendBtn.classList.add("ql-native-sending");
    sendBtn.disabled = true;
  }

  await requestLatestTokenFromHook();

  const storageData = await new Promise((resolve) => {
    chrome.storage.local.get(["lovable_projectId", "lovable_token", "ql_license_key", "ql_session_id"], resolve);
  });
  const projectId = storageData.lovable_projectId || "";
  let token = storageData.lovable_token || "";
  const licenseKey = storageData.ql_license_key || "";

  if (!projectId || !token) {
    showNativeChatToast("\u26a0 Projeto n\u00e3o sincronizado. Navegue no Lovable primeiro.", "error");
    if (sendBtn) {
      sendBtn.classList.remove("ql-native-sending");
      sendBtn.classList.add("ql-native-send-active");
    }
    return;
  }

  if (token.startsWith("Bearer ")) token = token.slice(7);

  try {
    const payload = {
      license_key: licenseKey,
      session_id: qlSessionId,
      projeto_id: projectId,
      token_lovable: token,
      mensagem: text,
      modo_pensar: false
    };

    var result = await bgFetch(PROXY_COMMAND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify(payload)
    });

    if (result && result.success === false) {
      throw new Error(result.error_display || result.message || "Erro no envio");
    }

    // Clear the editor
    if (editor) {
      editor.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    addToChatHistory(text, "ok");
    showNativeChatToast("\u2713 Prompt enviado com sucesso!", "success");

  } catch (err) {
    addToChatHistory(text, "error");
    showNativeChatToast("\u2717 " + (err.message || "Erro no envio"), "error");
  } finally {
    showNativeSendingOverlay(false);
    if (sendBtn) {
      sendBtn.classList.remove("ql-native-sending");
      sendBtn.classList.add("ql-native-send-active");
      sendBtn.disabled = false;
      // Re-apply blink animation since it may have been cleared
      sendBtn.style.animation = "";
      requestAnimationFrame(() => {
        sendBtn.style.animation = "ql-send-blink 1.5s infinite";
      });
    }
  }
}

function showNativeSendingOverlay(show) {
  const id = "ql-native-sending-overlay";
  const existing = document.getElementById(id);
  if (!show) { if (existing) existing.remove(); return; }
  if (existing) return;
  const el = document.createElement("div");
  el.id = id;
  el.className = "ql-native-sending-overlay";
  el.innerHTML = '<div class="ql-spinner"></div> Enviando prompt...';
  document.body.appendChild(el);
}

function showNativeChatToast(msg, type) {
  const existing = document.getElementById("ql-native-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "ql-native-toast";
  toast.className = "ql-native-toast ql-native-toast-" + type;
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("ql-native-toast-visible"));
  setTimeout(() => {
    toast.classList.remove("ql-native-toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function setupNativeChatButton() {
  const btn = document.getElementById("ql-native-chat-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    activateNativeChat();
  });
}

// Check if native chat was active on page load
chrome.storage.local.get(["ql_native_chat"], (res) => {
  if (res.ql_native_chat === true) {
    qlNativeChatActive = true;
    setTimeout(() => {
      const floatingBox = document.getElementById("ql-floating");
      if (floatingBox) floatingBox.style.display = "none";
      injectNativeChatOverlay();
    }, 500);
  }
});

window.addEventListener("message", (event)=>{
  if(!event.data || event.data.type !== "lovableTokenFound") return;
  const updates = {};
  if(event.data.token && typeof event.data.token === "string"){
    updates.lovable_token = event.data.token.replace(/^Bearer\s+/i, "").trim();
  }
  if(event.data.projectId && typeof event.data.projectId === "string"){
    updates.lovable_projectId = event.data.projectId;
  }
  if(!Object.keys(updates).length) return;
  chrome.storage.local.set(updates, ()=>{
    updateSyncStatus();
  });
});
