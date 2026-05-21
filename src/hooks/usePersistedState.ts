import { useEffect, useState } from "react";

/**
 * useState que persiste o valor em um cache global em memória (por chave).
 * Quando o componente desmonta e remonta (navegação entre páginas),
 * o estado é restaurado imediatamente — evitando flash de loading.
 *
 * NÃO persiste em localStorage (apenas em memória durante a sessão).
 *
 * Uso:
 *   const [clients, setClients] = usePersistedState<Client[]>("rev:clientes", []);
 *   const [loading, setLoading] = usePersistedState<boolean>("rev:clientes:loading", true);
 */
const cache = new Map<string, unknown>();

export function usePersistedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (cache.has(key)) return cache.get(key) as T;
    return initial;
  });

  useEffect(() => {
    cache.set(key, value);
  }, [key, value]);

  return [value, (v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
      cache.set(key, next);
      return next;
    });
  }] as const;
}

export function clearPersistedState(prefix?: string) {
  if (!prefix) { cache.clear(); return; }
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
