console.log("[Background] Main Lovable service worker iniciado");

// Initialize sidebar mode preference
chrome.storage.local.get(["ql_sidebar_mode"], (res) => {
  const sidebarMode = res.ql_sidebar_mode || false;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: sidebarMode }).catch(() => {});
  console.log("[Background] Sidebar mode:", sidebarMode);
});

// Listen for storage changes to update panel behavior
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ql_sidebar_mode) {
    const sidebarMode = changes.ql_sidebar_mode.newValue || false;
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: sidebarMode }).catch(() => {});
    console.log("[Background] Sidebar mode updated:", sidebarMode);
  }
});

// Handle action click (icon click) — this IS a user gesture, so sidePanel.open() works here
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const res = await chrome.storage.local.get(["ql_sidebar_mode"]);
    if (res.ql_sidebar_mode) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch(err) {
    console.error("[Background] action.onClicked sidePanel error:", err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === "lovableSync") {
    const updates = {};
    if (msg.token) updates.lovable_token = msg.token;
    if (msg.projectId) updates.lovable_projectId = msg.projectId;
    if (Object.keys(updates).length) {
      chrome.storage.local.set(updates, () => {
        console.log("[Background] saved:", Object.keys(updates).join(", "));
      });
    }
  }

  if (msg && msg.action === "activateSidebar") {
    // Only set the preference and behavior — cannot open side panel without user gesture
    chrome.storage.local.set({ ql_sidebar_mode: true });
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    // Try to open if sender is a tab (content script click IS a user gesture propagated)
    if (sender.tab && sender.tab.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
        sendResponse({ ok: true });
      }).catch((err) => {
        console.warn("[Background] sidePanel.open deferred — user must click extension icon:", err.message);
        sendResponse({ ok: true, deferred: true, message: "Clique no ícone da extensão para abrir o painel lateral." });
      });
    } else {
      sendResponse({ ok: true, deferred: true, message: "Clique no ícone da extensão para abrir o painel lateral." });
    }
    return true;
  }

  if (msg && msg.action === "deactivateSidebar") {
    chrome.storage.local.set({ ql_sidebar_mode: false });
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  if (msg && msg.action === "openSidePanel") {
    // This can only work if triggered from a user gesture context
    if (sender.tab && sender.tab.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
        sendResponse({ ok: true });
      }).catch((err) => {
        console.warn("[Background] openSidePanel deferred:", err.message);
        sendResponse({ ok: false, error: err.message });
      });
    } else {
      sendResponse({ ok: false, error: "No tab context" });
    }
    return true;
  }

  if (msg && msg.action === "proxyFetch") {
    (async () => {
      try {
        console.log("[Background] proxyFetch ->", msg.url);
        const opts = {
          method: msg.method || "POST",
          headers: msg.headers || {},
        };
        if (msg.body) opts.body = msg.body;
        const resp = await fetch(msg.url, opts);
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
        sendResponse({ ok: resp.ok, status: resp.status, data });
      } catch(err) {
        console.error("[Background] proxyFetch error:", err);
        sendResponse({ ok: false, status: 0, data: { error: err.message || "Fetch failed in background" } });
      }
    })();
    return true;
  }

  if (msg && msg.action === "openUrl") {
    chrome.tabs.create({ url: msg.url });
    sendResponse({ ok: true });
    return false;
  }

});
