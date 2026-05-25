import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
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

// Apply persisted theme before render to avoid flash
try {
  const saved = localStorage.getItem("lov-theme");
  // Dark é o tema principal — só usa light se o usuário tiver escolhido explicitamente.
  const isDark = saved ? saved === "dark" : true;
  document.documentElement.classList.toggle("dark", isDark);
} catch {}

primeAudioOnFirstGesture();

window.setTimeout(resetChunkReloadAttempts, 10_000);

createRoot(document.getElementById("root")!).render(<App />);

