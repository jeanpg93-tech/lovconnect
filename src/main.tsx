import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { primeAudioOnFirstGesture } from "./lib/notify";
import { isChunkLoadError, requestFreshChunkReload, resetChunkReloadAttempts } from "./lib/chunk-recovery";

// Auto-recover from stale chunk errors after a new deploy.
// When the browser has an old index.html cached and tries to fetch a
// hashed chunk that no longer exists, it throws "Importing a module
// script failed" / "Failed to fetch dynamically imported module".
// We detect that and force a one-time hard reload.
window.addEventListener("error", (event) => {
  if (isChunkLoadError(event.message) || isChunkLoadError(event.error)) requestFreshChunkReload();
});
window.addEventListener("unhandledrejection", (event) => {
  if (isChunkLoadError(event.reason)) requestFreshChunkReload();
});

// Apply theme before render to avoid flash
try {
  const themeChoiceKey = "lov-theme-user-choice-v2";
  const saved = localStorage.getItem("lov-theme");
  const hasUserChoice = localStorage.getItem(themeChoiceKey) === "true";
  // Dark é o padrão real. Valores antigos salvos como light são ignorados até o usuário trocar novamente.
  const theme = hasUserChoice && (saved === "light" || saved === "dark") ? saved : "dark";
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark", isDark);
  localStorage.setItem("lov-theme", theme);
} catch {}

primeAudioOnFirstGesture();

window.setTimeout(resetChunkReloadAttempts, 10_000);

createRoot(document.getElementById("root")!).render(<App />);

