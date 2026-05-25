const CHUNK_ERROR_PATTERNS = [
  "Importing a module script failed",
  "Failed to fetch dynamically imported module",
  "dynamically imported module",
  "Loading chunk",
  "Loading CSS chunk",
  "error loading dynamically imported module",
  "module script",
];

const RELOAD_COUNT_KEY = "lov-chunk-reload-count";
const RELOAD_WINDOW_KEY = "lov-chunk-reload-window";
const MAX_RELOADS = 3;
const WINDOW_MS = 2 * 60_000;

export const isChunkLoadError = (value: unknown) => {
  const message =
    typeof value === "string"
      ? value
      : (value as any)?.message ?? (value as any)?.reason?.message ?? "";

  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

export const requestFreshChunkReload = () => {
  try {
    const now = Date.now();
    const windowStartedAt = Number(sessionStorage.getItem(RELOAD_WINDOW_KEY) ?? "0");
    const isFreshWindow = now - windowStartedAt > WINDOW_MS;
    const currentCount = isFreshWindow ? 0 : Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? "0");

    if (currentCount >= MAX_RELOADS) return false;

    sessionStorage.setItem(RELOAD_WINDOW_KEY, String(isFreshWindow ? now : windowStartedAt));
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(currentCount + 1));
    void caches?.keys?.().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
  } catch {
    // If storage is unavailable, still try a single cache-busted reload.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  url.searchParams.set("_chunk", "fresh");
  window.location.replace(url.toString());
  return true;
};

export const resetChunkReloadAttempts = () => {
  try {
    sessionStorage.removeItem(RELOAD_COUNT_KEY);
    sessionStorage.removeItem(RELOAD_WINDOW_KEY);
  } catch {}
};