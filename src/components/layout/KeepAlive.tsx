import { ReactNode, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * KeepAlive: mantém componentes de rota montados em memória após a primeira visita,
 * apenas escondendo via display:none ao trocar de rota. Resultado:
 *  - ao voltar para uma página já visitada, não há flash de loading e o estado é preservado
 *  - scroll, formulários e timers continuam vivos
 *
 * Uso:
 *  <KeepAlive
 *    activeKey={location.pathname}
 *    routes={[
 *      { match: (p) => p === "/painel/revendedor", render: () => <RevendedorDashboard /> },
 *      ...
 *    ]}
 *    fallback={<NotFound />}
 *  />
 */
export type KeepAliveRoute = {
  /** Função que decide se a rota atende ao path atual. */
  match: (pathname: string) => boolean;
  /** Chave estável (geralmente o path-base da rota). Usada como cache id. */
  key: string;
  /** Renderiza o conteúdo. Chamado apenas na primeira visita. */
  render: () => ReactNode;
};

type Props = {
  pathname: string;
  routes: KeepAliveRoute[];
  fallback?: ReactNode;
};

export function KeepAlive({ pathname, routes, fallback = null }: Props) {
  const matched = routes.find((r) => r.match(pathname));
  const mountedRef = useRef<Map<string, ReactNode>>(new Map());

  // Monta a rota encontrada de forma síncrona no render (sem flash).
  if (matched && !mountedRef.current.has(matched.key)) {
    mountedRef.current.set(matched.key, matched.render());
  }

  if (!matched && mountedRef.current.size === 0) return <>{fallback}</>;

  return (
    <>
      {Array.from(mountedRef.current.entries()).map(([key, node]) => {
        const isActive = matched?.key === key;
        return (
          <div
            key={key}
            style={{ display: isActive ? "block" : "none" }}
            aria-hidden={!isActive}
          >
            {node}
          </div>
        );
      })}
      {!matched && fallback}
    </>
  );
}

/** Hook utilitário para pegar o pathname normalizado. */
export function useKeepAlivePathname() {
  return useLocation().pathname;
}
