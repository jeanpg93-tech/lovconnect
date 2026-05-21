import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { primeAudioOnFirstGesture } from "./lib/notify";

// Auto-recover from stale chunk errors after a new deploy.
// When the browser has an old index.html cached and tries to fetch a
// hashed chunk that no longer exists, it throws "Importing a module
// script failed" / "Failed to fetch dynamically imported module".
// We detect that and force a one-time hard reload.
const CHUNK_ERROR_PATTERNS = [
  "Importing a module script failed",
  "Failed to fetch dynamically imported module",
  "Loading chunk",
  "Loading CSS chunk",
  "error loading dynamically imported module",
];

const RELOAD_FLAG = "lov-chunk-reloaded-at";

const isChunkError = (msg: unknown) => {
  const s = typeof msg === "string" ? msg : (msg as any)?.message ?? "";
  return CHUNK_ERROR_PATTERNS.some((p) => s.includes(p));
};

const tryReload = () => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? "0");
    // Only reload once per minute to avoid infinite loops if the new
    // build is also broken.
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {}
  // Cache-bust the document so we definitely get fresh index.html
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
};

window.addEventListener("error", (event) => {
  if (isChunkError(event.message) || isChunkError(event.error)) tryReload();
});
window.addEventListener("unhandledrejection", (event) => {
  if (isChunkError(event.reason)) tryReload();
});

// Apply persisted theme before render to avoid flash
try {
  const saved = localStorage.getItem("lov-theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const isDark = saved ? saved === "dark" : prefersDark;
  document.documentElement.classList.toggle("dark", isDark);
} catch {}

primeAudioOnFirstGesture();

createRoot(document.getElementById("root")!).render(<App />);

