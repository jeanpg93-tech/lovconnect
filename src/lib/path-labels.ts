const STATIC: Record<string, string> = {
  "/painel": "Painel",
  "/painel/conta": "Ajustes da conta",
  "/painel/gerente": "Dashboard (gerente)",
  "/painel/gerente/financeiro": "Financeiro geral",
  "/painel/gerente/vendas-loja": "Vendas da loja",
  "/painel/gerente/revendedores": "Revendedores",
  "/painel/gerente/affiliados": "Afiliados",
  "/painel/gerente/aprovacoes": "Aprovações",
  "/painel/gerente/ativacoes": "Ativações",
  "/painel/gerente/gateway": "Gateway",
  "/painel/gerente/api-provedor": "API Provedor",
  "/painel/gerente/api-recargas": "API Recargas",
  "/painel/gerente/acompanhar-recargas": "Acompanhar recargas",
  "/painel/gerente/recargas-dashboard": "Dashboard de recargas",
  "/painel/gerente/recargas": "Recargas",
  "/painel/gerente/geracao-manual": "Geração manual",
  "/painel/gerente/geracao-manual-creditos": "Geração manual (créditos)",
  "/painel/gerente/api-revendedor": "API Revendedor",
  "/painel/gerente/api-sistema": "API Sistema",
  "/painel/gerente/resetar-chave": "Resetar chave",
  "/painel/gerente/upload-extensao": "Upload de extensão",
  "/painel/gerente/precos-revendedor": "Preços por revendedor",
  "/painel/gerente/valores": "Valores",
  "/painel/gerente/valores-creditos": "Valores (créditos)",
  "/painel/gerente/niveis": "Níveis",
  "/painel/gerente/zona-risco": "Zona de risco",
  "/painel/gerente/avisos": "Avisos",
  "/painel/gerente/todas-licencas": "Todas as licenças",
  "/painel/gerente/ranking-prizes": "Prêmios do ranking",
  "/painel/gerente/personalizar-extensao": "Personalizar extensão",
  "/painel/gerente/acoes-especiais": "Ações especiais",
  "/painel/gerente/contas-demo": "Contas demo",
  "/painel/gerente/telegram": "Telegram",
  "/painel/gerente/pacotes": "Packs",
  "/painel/gerente/instalar-app": "Instalar app",
  "/painel/revendedor": "Dashboard",
  "/painel/revendedor/avisos": "Avisos",
  "/painel/revendedor/instalar-app": "Instalar app",
  "/painel/revendedor/recargas": "Recargas",
  "/painel/revendedor/clientes": "Clientes",
  "/painel/revendedor/licencas": "Licenças",
  "/painel/revendedor/pedidos": "Pedidos",
  "/painel/revendedor/gerar-chave": "Gerar chave",
  "/painel/revendedor/minhas-chaves": "Minhas chaves",
  "/painel/revendedor/cobrancas": "Cobranças",
  "/painel/revendedor/extensoes": "Extensões",
  "/painel/revendedor/precos": "Preços",
  "/painel/revendedor/creditos": "Créditos",
  "/painel/revendedor/comprar-creditos": "Comprar créditos",
  "/painel/revendedor/comprar-pacote": "Comprar Pack",
  "/painel/revendedor/historico-pacote": "Histórico Pack",
  "/painel/revendedor/adicionar-saldo": "Adicionar saldo",
  "/painel/revendedor/carteira": "Carteira",
  "/painel/revendedor/integracoes/misticpay": "Integração MisticPay",
  "/painel/revendedor/integracoes/whatsapp": "Integração WhatsApp",
  "/painel/revendedor/loja": "Minha loja",
  "/painel/revendedor/indicacoes": "Indicações",
  "/painel/revendedor/api": "API",
  "/painel/revendedor/api-recargas": "API Recargas",
  "/painel/revendedor/baixar-extensao": "Baixar extensão",
  "/painel/revendedor/niveis": "Níveis",
  "/painel/revendedor/ranking": "Ranking",
  "/painel/revendedor/personalizar-extensao": "Personalizar extensão",
  "/painel/revendedor/transacoes": "Transações",
  "/painel/revendedor/resetar-chave": "Resetar chave",
  "/painel/cliente": "Dashboard cliente",
  "/painel/cliente/extensoes": "Extensões",
};

export function labelForPath(path: string | null | undefined): string {
  if (!path) return "—";
  const clean = path.split("?")[0].replace(/\/$/, "") || "/";
  if (STATIC[clean]) return STATIC[clean];
  // dynamic: /painel/gerente/revendedores/:id/precos|mensalidade|pacote
  const m = clean.match(/^\/painel\/gerente\/revendedores\/[^/]+\/(precos|mensalidade|pacote)$/);
  if (m) {
    const sub = m[1];
    if (sub === "precos") return "Preços do revendedor";
    if (sub === "mensalidade") return "Mensalidade do revendedor";
    if (sub === "pacote") return "Pack do revendedor";
  }
  if (clean.startsWith("/painel/gerente/revendedores/")) return "Detalhes do revendedor";
  if (clean.startsWith("/loja/")) return "Loja pública";
  if (clean.startsWith("/recargas/")) return "Recarga pública";
  return clean;
}

export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const isOnline = (lastSeenAt: string | null | undefined): boolean => {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
};

export function formatLastSeenBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}