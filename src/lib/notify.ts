// Helper de notificações nativas com som (Web Audio).
// Mantém um único AudioContext e desbloqueia no primeiro gesto.

let audioCtx: AudioContext | null = null;

const getCtx = () => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
};

// Toca um chime curto (2 notas) — sem precisar de arquivo de áudio.
export function playChime() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [880, 1320];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "default") {
    try { return await Notification.requestPermission(); } catch { return "denied"; }
  }
  return Notification.permission;
}

export function notify(title: string, body?: string, opts?: { silent?: boolean; tag?: string }) {
  try {
    if (!opts?.silent) playChime();
  } catch {}
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: opts?.tag,
    });
  } catch {}
}

// Desbloqueia áudio no primeiro gesto do usuário (necessário em iOS).
export function primeAudioOnFirstGesture() {
  if (typeof window === "undefined") return;
  const handler = () => {
    getCtx();
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("pointerdown", handler, { once: true });
  window.addEventListener("keydown", handler, { once: true });
}
