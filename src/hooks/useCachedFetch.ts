import { useEffect, useRef, useState } from "react";

/**
 * Cache em memória global por chave.
 * Mantém os dados entre montagens do mesmo componente (ao trocar de página e voltar),
 * para que ao retornar a página mostre o conteúdo imediatamente sem flash de loading,
 * enquanto revalida em background.
 *
 * Uso:
 *   const { data, loading, refetch } = useCachedFetch("clientes:" + userId, async () => {
 *     const { data } = await supabase.from("...").select("*");
 *     return data ?? [];
 *   }, [userId]);
 */

const memoryCache = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return memoryCache.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T) {
  memoryCache.set(key, value);
}

export function invalidateCached(keyOrPrefix: string, isPrefix = false) {
  if (!isPrefix) {
    memoryCache.delete(keyOrPrefix);
    return;
  }
  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(keyOrPrefix)) memoryCache.delete(k);
  }
}

export function useCachedFetch<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
) {
  const cached = key ? (memoryCache.get(key) as T | undefined) : undefined;
  const [data, setData] = useState<T | undefined>(cached);
  // Só mostra loading se realmente não temos nada em cache.
  const [loading, setLoading] = useState<boolean>(cached === undefined);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = async () => {
    if (!key) return;
    const has = memoryCache.has(key);
    if (!has) setLoading(true);
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;
      memoryCache.set(key, result);
      setData(result);
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!key) return;
    // Sempre revalida em background ao montar; loading fica false se já há cache.
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  return {
    data,
    setData: (v: T) => {
      if (key) memoryCache.set(key, v);
      setData(v);
    },
    loading,
    error,
    refetch: run,
  };
}
