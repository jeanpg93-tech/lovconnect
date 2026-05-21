import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { primeAudioOnFirstGesture } from "./lib/notify";

// Apply persisted theme before render to avoid flash
try {
  const saved = localStorage.getItem("lov-theme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const isDark = saved ? saved === "dark" : prefersDark;
  document.documentElement.classList.toggle("dark", isDark);
} catch {}

primeAudioOnFirstGesture();

createRoot(document.getElementById("root")!).render(<App />);

