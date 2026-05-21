import { lazy, Suspense, useEffect } from "react";
import { useLocation, matchPath, Navigate } from "react-router-dom";
import { RoleRoute } from "./RoleRoute";
import { useRole } from "@/hooks/useRole";
import { Loader2 } from "lucide-react";

const GerenteDashboard = lazy(() => import("@/pages/painel/GerenteDashboard"));
const GerenteRevendedores = lazy(() => import("@/pages/painel/GerenteRevendedores"));
const GerenteAffiliados = lazy(() => import("@/pages/painel/GerenteAffiliados"));
const GerenteAprovacoes = lazy(() => import("@/pages/painel/GerenteAprovacoes"));
const GerenteGateway = lazy(() => import("@/pages/painel/GerenteGateway"));
const GerenteApiProvedor = lazy(() => import("@/pages/painel/GerenteApiProvedor"));
const GerenteApiRecargas = lazy(() => import("@/pages/painel/GerenteApiRecargas"));
const GerenteAcompanharRecargas = lazy(() => import("@/pages/painel/GerenteAcompanharRecargas"));
const GerenteRecargasDashboard = lazy(() => import("@/pages/painel/GerenteRecargasDashboard"));
const GerenteRecargas = lazy(() => import("@/pages/painel/GerenteRecargas"));
const GerenteGeracaoManual = lazy(() => import("@/pages/painel/GerenteGeracaoManual"));
const GerenteGeracaoManualCreditos = lazy(() => import("@/pages/painel/GerenteGeracaoManualCreditos"));
const GerenteApiRevendedor = lazy(() => import("@/pages/painel/GerenteApiRevendedor"));
const GerenteApiSistema = lazy(() => import("@/pages/painel/GerenteApiSistema"));
const GerenteResetarChave = lazy(() => import("@/pages/painel/GerenteResetarChave"));
const GerenteUploadExtensao = lazy(() => import("@/pages/painel/GerenteUploadExtensao"));
const GerenteRevendedorPrecos = lazy(() => import("@/pages/painel/GerenteRevendedorPrecos"));
const GerenteValores = lazy(() => import("@/pages/painel/GerenteValores"));
const GerenteValoresCreditos = lazy(() => import("@/pages/painel/GerenteValoresCreditos"));
const GerenteNiveis = lazy(() => import("@/pages/painel/GerenteNiveis"));
const GerenteRankingPrizes = lazy(() => import("@/pages/painel/GerenteRankingPrizes"));
const GerenteZonaRisco = lazy(() => import("@/pages/painel/GerenteZonaRisco"));
const GerenteWhatsappTemplate = lazy(() => import("@/pages/painel/GerenteWhatsappTemplate"));
const GerenteAvisos = lazy(() => import("@/pages/painel/GerenteAvisos"));
const GerenteTodasLicencas = lazy(() => import("@/pages/painel/GerenteTodasLicencas"));
const GerentePartners = lazy(() => import("@/pages/painel/GerentePartners"));
const GerenteFinanceiroGeral = lazy(() => import("@/pages/painel/GerenteFinanceiroGeral"));
const GerenteVendasLoja = lazy(() => import("@/pages/painel/GerenteVendasLoja"));
const RevendedorAvisos = lazy(() => import("@/pages/painel/RevendedorAvisos"));
const GerentePersonalizarExtensao = lazy(() => import("@/pages/painel/GerentePersonalizarExtensao"));
const GerenteAcoesEspeciais = lazy(() => import("@/pages/painel/GerenteAcoesEspeciais"));
const RevendedorPersonalizarExtensao = lazy(() => import("@/pages/painel/RevendedorPersonalizarExtensao"));
const RevendedorLanding = lazy(() => import("@/pages/painel/RevendedorLanding"));

const RevendedorRecarga = lazy(() => import("@/pages/painel/RevendedorRecarga"));

const RevendedorDashboard = lazy(() => import("@/pages/painel/RevendedorDashboard"));
const RevendedorClientes = lazy(() => import("@/pages/painel/RevendedorClientes"));
const RevendedorLicencas = lazy(() => import("@/pages/painel/RevendedorLicencas"));
const RevendedorExtensoes = lazy(() => import("@/pages/painel/RevendedorExtensoes"));
const RevendedorPedidos = lazy(() => import("@/pages/painel/RevendedorPedidos"));
const RevendedorAdicionarSaldo = lazy(() => import("@/pages/painel/RevendedorAdicionarSaldo"));
const RevendedorCarteira = lazy(() => import("@/pages/painel/RevendedorCarteira"));
const RevendedorIntegracaoMisticPay = lazy(() => import("@/pages/painel/RevendedorIntegracaoMisticPay"));
const RevendedorIntegracaoEvolution = lazy(() => import("@/pages/painel/RevendedorIntegracaoEvolution"));
const RevendedorMinhaLoja = lazy(() => import("@/pages/painel/RevendedorMinhaLoja"));
const RevendedorIndicacoes = lazy(() => import("@/pages/painel/RevendedorIndicacoes"));
const RevendedorApi = lazy(() => import("@/pages/painel/RevendedorApi"));
const RevendedorApiRecargas = lazy(() => import("@/pages/painel/RevendedorApiRecargas"));
const RevendedorBaixarExtensao = lazy(() => import("@/pages/painel/RevendedorBaixarExtensao"));
const RevendedorNiveis = lazy(() => import("@/pages/painel/RevendedorNiveis"));
const RevendedorRanking = lazy(() => import("@/pages/painel/RevendedorRanking"));
const RevendedorTransacoes = lazy(() => import("@/pages/painel/RevendedorTransacoes"));
const RevendedorCreditos = lazy(() => import("@/pages/painel/RevendedorCreditos"));
const RevendedorComprarCreditos = lazy(() => import("@/pages/painel/RevendedorComprarCreditos"));
const RevendedorResetarChave = lazy(() => import("@/pages/painel/RevendedorResetarChave"));

const ClienteDashboard = lazy(() => import("@/pages/painel/ClienteDashboard"));
const ClienteExtensoes = lazy(() => import("@/pages/painel/ClienteExtensoes"));

const AjustesConta = lazy(() => import("@/pages/painel/AjustesConta"));
const PainelRedirect = lazy(() => import("@/pages/painel/PainelRedirect"));
const InstallApp = lazy(() => import("@/pages/Install"));

const exact = (p: string) => (path: string) => path === p || path === p + "/";

type PanelRoute = {
  match: (pathname: string) => boolean;
  key: string;
  render: () => React.ReactNode;
};

const ROUTES: PanelRoute[] = [
  { key: "/painel/", match: exact("/painel"), render: () => <PainelRedirect /> },
  { key: "/painel/conta", match: exact("/painel/conta"), render: () => <AjustesConta /> },

  { key: "/painel/gerente", match: exact("/painel/gerente"), render: () => <RoleRoute allow={["gerente"]}><GerenteDashboard /></RoleRoute> },
  { key: "/painel/gerente/financeiro", match: exact("/painel/gerente/financeiro"), render: () => <RoleRoute allow={["gerente"]}><GerenteFinanceiroGeral /></RoleRoute> },
  { key: "/painel/gerente/vendas-loja", match: exact("/painel/gerente/vendas-loja"), render: () => <RoleRoute allow={["gerente"]}><GerenteVendasLoja /></RoleRoute> },
  { key: "/painel/gerente/revendedores", match: exact("/painel/gerente/revendedores"), render: () => <RoleRoute allow={["gerente"]}><GerenteRevendedores /></RoleRoute> },
  { key: "/painel/gerente/affiliados", match: exact("/painel/gerente/affiliados"), render: () => <RoleRoute allow={["gerente"]}><GerenteAffiliados /></RoleRoute> },
  { key: "/painel/gerente/aprovacoes", match: exact("/painel/gerente/aprovacoes"), render: () => <RoleRoute allow={["gerente"]}><GerenteAprovacoes /></RoleRoute> },
  { key: "/painel/gerente/gateway", match: exact("/painel/gerente/gateway"), render: () => <RoleRoute allow={["gerente"]}><GerenteGateway /></RoleRoute> },
  { key: "/painel/gerente/api-provedor", match: exact("/painel/gerente/api-provedor"), render: () => <RoleRoute allow={["gerente"]}><GerenteApiProvedor /></RoleRoute> },
  { key: "/painel/gerente/api-recargas", match: exact("/painel/gerente/api-recargas"), render: () => <RoleRoute allow={["gerente"]}><GerenteApiRecargas /></RoleRoute> },
  { key: "/painel/gerente/acompanhar-recargas", match: exact("/painel/gerente/acompanhar-recargas"), render: () => <RoleRoute allow={["gerente"]}><GerenteAcompanharRecargas /></RoleRoute> },
  { key: "/painel/gerente/recargas-dashboard", match: exact("/painel/gerente/recargas-dashboard"), render: () => <RoleRoute allow={["gerente"]}><GerenteRecargasDashboard /></RoleRoute> },
  { key: "/painel/gerente/recargas", match: exact("/painel/gerente/recargas"), render: () => <RoleRoute allow={["gerente"]}><GerenteRecargas /></RoleRoute> },
  { key: "/painel/gerente/geracao-manual", match: exact("/painel/gerente/geracao-manual"), render: () => <RoleRoute allow={["gerente"]}><GerenteGeracaoManual /></RoleRoute> },
  { key: "/painel/gerente/geracao-manual-creditos", match: exact("/painel/gerente/geracao-manual-creditos"), render: () => <RoleRoute allow={["gerente"]}><GerenteGeracaoManualCreditos /></RoleRoute> },
  { key: "/painel/gerente/api-revendedor", match: exact("/painel/gerente/api-revendedor"), render: () => <RoleRoute allow={["gerente"]}><GerenteApiRevendedor /></RoleRoute> },
  { key: "/painel/gerente/api-sistema", match: exact("/painel/gerente/api-sistema"), render: () => <RoleRoute allow={["gerente"]}><GerenteApiSistema /></RoleRoute> },
  { key: "/painel/gerente/resetar-chave", match: exact("/painel/gerente/resetar-chave"), render: () => <RoleRoute allow={["gerente"]}><GerenteResetarChave /></RoleRoute> },
  { key: "/painel/gerente/upload-extensao", match: exact("/painel/gerente/upload-extensao"), render: () => <RoleRoute allow={["gerente"]}><GerenteUploadExtensao /></RoleRoute> },
  { key: "/painel/gerente/precos-revendedor", match: exact("/painel/gerente/precos-revendedor"), render: () => <RoleRoute allow={["gerente"]}><GerenteRevendedorPrecos /></RoleRoute> },
  { key: "/painel/gerente/valores", match: exact("/painel/gerente/valores"), render: () => <RoleRoute allow={["gerente"]}><GerenteValores /></RoleRoute> },
  { key: "/painel/gerente/valores-creditos", match: exact("/painel/gerente/valores-creditos"), render: () => <RoleRoute allow={["gerente"]}><GerenteValoresCreditos /></RoleRoute> },
  { key: "/painel/gerente/niveis", match: exact("/painel/gerente/niveis"), render: () => <RoleRoute allow={["gerente"]}><GerenteNiveis /></RoleRoute> },
  { key: "/painel/gerente/zona-risco", match: exact("/painel/gerente/zona-risco"), render: () => <RoleRoute allow={["gerente"]}><GerenteZonaRisco /></RoleRoute> },
  { key: "/painel/gerente/whatsapp-template", match: exact("/painel/gerente/whatsapp-template"), render: () => <RoleRoute allow={["gerente"]}><GerenteWhatsappTemplate /></RoleRoute> },
  { key: "/painel/gerente/avisos", match: exact("/painel/gerente/avisos"), render: () => <RoleRoute allow={["gerente"]}><GerenteAvisos /></RoleRoute> },
  { key: "/painel/gerente/todas-licencas", match: exact("/painel/gerente/todas-licencas"), render: () => <RoleRoute allow={["gerente"]}><GerenteTodasLicencas /></RoleRoute> },
  { key: "/painel/gerente/partners", match: exact("/painel/gerente/partners"), render: () => <RoleRoute allow={["gerente"]}><GerentePartners /></RoleRoute> },
  { key: "/painel/gerente/ranking-prizes", match: exact("/painel/gerente/ranking-prizes"), render: () => <RoleRoute allow={["gerente"]}><GerenteRankingPrizes /></RoleRoute> },
  { key: "/painel/gerente/personalizar-extensao", match: exact("/painel/gerente/personalizar-extensao"), render: () => <RoleRoute allow={["gerente"]}><GerentePersonalizarExtensao /></RoleRoute> },
  { key: "/painel/gerente/acoes-especiais", match: exact("/painel/gerente/acoes-especiais"), render: () => <RoleRoute allow={["gerente"]}><GerenteAcoesEspeciais /></RoleRoute> },
  { key: "/painel/gerente/instalar-app", match: exact("/painel/gerente/instalar-app"), render: () => <RoleRoute allow={["gerente"]}><InstallApp /></RoleRoute> },
  { key: "/painel/revendedor/avisos", match: exact("/painel/revendedor/avisos"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorAvisos /></RoleRoute> },
  { key: "/painel/revendedor/instalar-app", match: exact("/painel/revendedor/instalar-app"), render: () => <RoleRoute allow={["revendedor"]}><InstallApp /></RoleRoute> },

  { key: "/painel/revendedor", match: exact("/painel/revendedor"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorDashboard /></RoleRoute> },
  { key: "/painel/revendedor/recargas", match: exact("/painel/revendedor/recargas"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorRecarga /></RoleRoute> },
  { key: "/painel/revendedor/clientes", match: exact("/painel/revendedor/clientes"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorClientes /></RoleRoute> },
  { key: "/painel/revendedor/licencas", match: exact("/painel/revendedor/licencas"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorLicencas /></RoleRoute> },
  { key: "/painel/revendedor/extensoes", match: exact("/painel/revendedor/extensoes"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorExtensoes /></RoleRoute> },
  { key: "/painel/revendedor/creditos", match: exact("/painel/revendedor/creditos"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorCreditos /></RoleRoute> },
  { key: "/painel/revendedor/pedidos", match: exact("/painel/revendedor/pedidos"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorPedidos /></RoleRoute> },
  { key: "/painel/revendedor/comprar-creditos", match: exact("/painel/revendedor/comprar-creditos"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorComprarCreditos /></RoleRoute> },
  { key: "/painel/revendedor/adicionar-saldo", match: exact("/painel/revendedor/adicionar-saldo"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorAdicionarSaldo /></RoleRoute> },
  { key: "/painel/revendedor/carteira", match: exact("/painel/revendedor/carteira"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorCarteira /></RoleRoute> },
  { key: "/painel/revendedor/integracoes/misticpay", match: exact("/painel/revendedor/integracoes/misticpay"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorIntegracaoMisticPay /></RoleRoute> },
  { key: "/painel/revendedor/integracoes/evolution", match: exact("/painel/revendedor/integracoes/evolution"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorIntegracaoEvolution /></RoleRoute> },
  { key: "/painel/revendedor/loja", match: exact("/painel/revendedor/loja"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorMinhaLoja /></RoleRoute> },
  { key: "/painel/revendedor/indicacoes", match: exact("/painel/revendedor/indicacoes"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorIndicacoes /></RoleRoute> },
  { key: "/painel/revendedor/api", match: exact("/painel/revendedor/api"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorApi /></RoleRoute> },
  { key: "/painel/revendedor/api-recargas", match: exact("/painel/revendedor/api-recargas"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorApiRecargas /></RoleRoute> },
  { key: "/painel/revendedor/baixar-extensao", match: exact("/painel/revendedor/baixar-extensao"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorBaixarExtensao /></RoleRoute> },
  { key: "/painel/revendedor/niveis", match: exact("/painel/revendedor/niveis"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorNiveis /></RoleRoute> },
  { key: "/painel/revendedor/ranking", match: exact("/painel/revendedor/ranking"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorRanking /></RoleRoute> },
  { key: "/painel/revendedor/personalizar-extensao", match: exact("/painel/revendedor/personalizar-extensao"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorPersonalizarExtensao /></RoleRoute> },
  { key: "/painel/revendedor/transacoes", match: exact("/painel/revendedor/transacoes"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorTransacoes /></RoleRoute> },
  { key: "/painel/revendedor/resetar-chave", match: exact("/painel/revendedor/resetar-chave"), render: () => <RoleRoute allow={["revendedor"]}><RevendedorResetarChave /></RoleRoute> },

  { key: "/painel/cliente", match: exact("/painel/cliente"), render: () => <RoleRoute allow={["cliente"]}><ClienteDashboard /></RoleRoute> },
  { key: "/painel/cliente/extensoes", match: exact("/painel/cliente/extensoes"), render: () => <RoleRoute allow={["cliente"]}><ClienteExtensoes /></RoleRoute> },
];

const PageFallback = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <div className="relative flex h-16 w-16 items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    </div>
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">Carregando página</p>
      <p className="text-xs text-muted-foreground">Preparando tudo para você…</p>
    </div>
  </div>
);

export function PanelRoutes() {
  const { pathname } = useLocation();
  const { loading, hasData } = useRole();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  const dyn = matchPath({ path: "/painel/gerente/revendedores/:id/precos", end: true }, pathname);
  if (dyn) {
    return (
      <Suspense fallback={<PageFallback />}>
        <RoleRoute allow={["gerente"]}><GerenteRevendedorPrecos /></RoleRoute>
      </Suspense>
    );
  }

  const integrationRedirect = pathname === "/painel/revendedor/integracoes" || pathname === "/painel/revendedor/integracoes/";
  if (integrationRedirect) {
    return <Navigate to="/painel/revendedor/integracoes/misticpay" replace />;
  }

  const matched = ROUTES.find((r) => r.match(pathname));

  if (loading && !hasData) {
    return null;
  }

  if (!matched) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Página não encontrada.</div>;
  }

  return (
    <div key={matched.key}>
      <Suspense fallback={<PageFallback />}>{matched.render()}</Suspense>
    </div>
  );
}
