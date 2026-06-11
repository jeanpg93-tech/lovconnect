# 📦 Guia de Migração — LovConnect

> Documento gerado para apoiar a migração 100% do sistema para outra plataforma (VPS, Vercel + Supabase próprio, etc.).

## 1. Posso migrar 100%? — **Sim**

Toda a stack é padrão e portável:

| Camada | Tecnologia | Para onde migrar |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind + TS | Vercel, Netlify, Cloudflare Pages, VPS (Nginx) |
| Backend (DB + Auth + Storage + Edge Functions) | Supabase (open-source) | Supabase self-hosted, Supabase Cloud próprio, ou qualquer Postgres + Deno Deploy |
| Pagamentos | MisticPay (webhook) | mantém-se igual, só troca a URL do webhook |
| Notificações | Telegram Bot API + Evolution API (WhatsApp) | mantém-se igual |

### Passos macro
1. **Código** → conectar repo GitHub (menu **+** → GitHub → Connect).
2. **Banco** → criar projeto Supabase próprio e rodar todas as migrations de `supabase/migrations/`.
3. **Dados** → exportar tabelas como CSV (Cloud → Database → Tables → Export) e importar no novo banco. Usuários de `auth.users` migram via admin API do Supabase (hashes bcrypt são portáveis).
4. **Edge Functions** → `supabase functions deploy <nome>` para cada uma das 74 funções em `supabase/functions/`.
5. **Secrets** → recriar no novo projeto (MisticPay, Telegram, Evolution, etc.).
6. **Storage** → baixar buckets e re-upload no novo.
7. **Webhooks externos** → atualizar URLs (MisticPay, Telegram, Evolution).
8. **Frontend `.env`** → atualizar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

> ⚠️ Lovable Cloud não expõe `pg_dump` completo nem a `SERVICE_ROLE_KEY`. Para dump SQL completo, é preciso contatar o suporte do Lovable.

---

## 2. Arquivos prontos para migração

Até agora **não foi gerado nenhum script de migração automatizado**. O que existe pronto:

- ✅ `supabase/migrations/*.sql` — todo o schema do banco (executável em qualquer Postgres/Supabase).
- ✅ `supabase/functions/*` — código-fonte completo das 74 edge functions.
- ✅ `supabase/config.toml` — configuração de JWT por função.
- ✅ Este `MIGRATION.md`.

Posso gerar quando você pedir: script de export CSV em lote, script de import, checklist de secrets, script para redeploy de todas as functions.

---

## 3. Mapa completo de páginas do sistema

### 🌐 Páginas Públicas (sem login)
| Rota | Arquivo | Função |
|---|---|---|
| `/auth` | `pages/Auth.tsx` | Login / cadastro / esqueci senha |
| `/reset-password` | `pages/ResetPassword.tsx` | Definir nova senha via link de e-mail |
| `/banned` | `pages/Banned.tsx` | Tela bloqueio para conta banida |
| `/inactive` | `pages/Inactive.tsx` | Tela para conta inativa/sem ativação |
| `/instalar` | `pages/Install.tsx` | Tutorial de instalação da extensão Chrome |
| `/loja/:slug` | `pages/PublicStorefront.tsx` | Loja pública do revendedor (vitrine + checkout) |
| `/Extension-flow` | `pages/PublicExtension.tsx` | Página pública da extensão LovMain |
| `/Extension-lovax` | `pages/PublicExtension.tsx` | Página pública da extensão Lovax |
| `/recargas/:id` | `pages/PublicRecharge.tsx` | Tela pública de pagamento de recarga via PIX |
| `/plano/:token` | `pages/PublicPlano.tsx` | Página pública do plano assinado (cliente final) |

### 🛠️ Painel — GERENTE (admin do sistema)
| Rota | Arquivo | Função |
|---|---|---|
| `/painel/gerente` | `GerenteDashboard` | Dashboard geral (KPIs, vendas, novos revendedores) |
| `/painel/gerente/financeiro` | `GerenteFinanceiroGeral` | Visão geral financeira, transações, mensalidades, lançamentos manuais |
| `/painel/gerente/vendas-loja` | `GerenteVendasLoja` | Histórico de vendas feitas via lojas dos revendedores |
| `/painel/gerente/revendedores` | `GerenteRevendedores` | CRUD de revendedores (ativar/banir/níveis) |
| `/painel/gerente/affiliados` | `GerenteAffiliados` | Gestão de códigos de afiliado |
| `/painel/gerente/aprovacoes` | `GerenteAprovacoes` | Fila de aprovações pendentes (saques, etc.) |
| `/painel/gerente/ativacoes` | `GerenteAtivacoes` | Pagamentos de ativação inicial de revendedor |
| `/painel/gerente/gateway` | `GerenteGateway` | Configuração do gateway de pagamento (MisticPay) |
| `/painel/gerente/api-provedor` | `GerenteApiProvedor` | API externa do provedor de licenças (Lovax) |
| `/painel/gerente/api-recargas` | `GerenteApiRecargas` | API externa do provedor de recargas (créditos Lovable) |
| `/painel/gerente/acompanhar-recargas` | `GerenteAcompanharRecargas` | Histórico de todas as recargas |
| `/painel/gerente/recargas-dashboard` | `GerenteRecargasDashboard` | KPIs de recargas |
| `/painel/gerente/recargas` | `GerenteRecargas` | **Hub** de recargas: Dashboard, Acompanhar, Estornos, Valores, Planos, Planos Ativos, Tutoriais, Agenda, API |
| `/painel/gerente/geracao-manual` | `GerenteGeracaoManual` | Gerar chave de licença manualmente |
| `/painel/gerente/geracao-manual-creditos` | `GerenteGeracaoManualCreditos` | Lançar créditos de recarga manualmente |
| `/painel/gerente/api-revendedor` | `GerenteApiRevendedor` | Documentação da API que os revendedores consomem |
| `/painel/gerente/api-sistema` | `GerenteApiSistema` | Documentação da API interna do sistema |
| `/painel/gerente/resetar-chave` | `GerenteResetarChave` | Resetar HWID de uma licença |
| `/painel/gerente/upload-extensao` | `GerenteUploadExtensao` | Upload de novas versões da extensão |
| `/painel/gerente/precos-revendedor` | `GerenteRevendedorPrecos` | Tabela de preços por revendedor |
| `/painel/gerente/valores` | `GerenteValores` | Preços base de licenças |
| `/painel/gerente/valores-creditos` | `GerenteValoresCreditos` | Preços base de pacotes de crédito |
| `/painel/gerente/niveis` | `GerenteNiveis` | Configuração de níveis de revendedor (tiers) |
| `/painel/gerente/zona-risco` | `GerenteZonaRisco` | Ações destrutivas (reset, purge, etc.) |
| `/painel/gerente/avisos` | `GerenteAvisos` | Publicar avisos/anúncios para revendedores |
| `/painel/gerente/todas-licencas` | `GerenteTodasLicencas` | **Hub** de licenças: Dashboard, Acompanhar, Chaves Teste, Valores, APIs |
| `/painel/gerente/ranking-prizes` | `GerenteRankingPrizes` | Prêmios do ranking mensal de revendedores |
| `/painel/gerente/personalizar-extensao` | `GerentePersonalizarExtensao` | Template global da extensão |
| `/painel/gerente/acoes-especiais` | `GerenteAcoesEspeciais` | Promoções e ações temporárias |
| `/painel/gerente/contas-demo` | `GerenteContasDemo` | Criar/resetar contas demo de revendedor |
| `/painel/gerente/telegram` | `GerenteTelegram` | Configuração do bot Telegram do sistema |
| `/painel/gerente/whatsapp-sistema` | `GerenteWhatsAppSistema` | Conexão Evolution API + histórico de mensagens |
| `/painel/gerente/pacotes` | `GerentePacotes` | Pacotes de licenças (vendidos a revendedores) |
| `/painel/gerente/instalar-app` | `Install` | Mesmo tutorial de instalação |

### 🏪 Painel — REVENDEDOR
| Rota | Arquivo | Função |
|---|---|---|
| `/painel/revendedor` | `RevendedorDashboard` | Dashboard pessoal (vendas, saldo, ranking) |
| `/painel/revendedor/avisos` | `RevendedorAvisos` | Avisos publicados pelo gerente |
| `/painel/revendedor/instalar-app` | `Install` | Tutorial da extensão |
| `/painel/revendedor/recargas` | `RevendedorRecarga` | Vender recargas de crédito Lovable |
| `/painel/revendedor/planos-vendidos` | `RevendedorPlanosVendidos` | Planos de assinatura vendidos a clientes |
| `/painel/revendedor/clientes` | `RevendedorClientes` | Lista de clientes do revendedor |
| `/painel/revendedor/licencas` / `/pedidos` | `RevendedorPedidos` | Histórico de licenças vendidas |
| `/painel/revendedor/gerar-chave` | `RevendedorGerarChave` | Gerar chave para um cliente |
| `/painel/revendedor/minhas-chaves` | `RevendedorMinhasChaves` | Chaves do próprio revendedor |
| `/painel/revendedor/cobrancas` | `RevendedorCobrancas` | Cobranças recorrentes (mensalidade do revendedor) |
| `/painel/revendedor/extensoes` | `RevendedorExtensoes` | Extensões disponíveis para revenda |
| `/painel/revendedor/precos` | `RevendedorPrecos` | Tabela de preços de venda do revendedor |
| `/painel/revendedor/creditos` | `RevendedorCreditos` | Saldo de créditos para gerar chaves |
| `/painel/revendedor/comprar-creditos` | `RevendedorComprarCreditos` | Comprar créditos avulsos |
| `/painel/revendedor/comprar-pacote` | `RevendedorComprarPacote` | Comprar pacote de licenças via PIX |
| `/painel/revendedor/historico-pacote` | `RevendedorHistoricoPacote` | Histórico de compras de pacote |
| `/painel/revendedor/adicionar-saldo` | `RevendedorAdicionarSaldo` | Adicionar saldo à carteira |
| `/painel/revendedor/carteira` | `RevendedorCarteira` | Extrato + saques |
| `/painel/revendedor/integracoes/misticpay` | `RevendedorIntegracaoMisticPay` | Conectar conta MisticPay própria |
| `/painel/revendedor/integracoes/whatsapp` | `RevendedorIntegracaoWhatsApp` | Conectar WhatsApp via Evolution |
| `/painel/revendedor/loja` | `RevendedorMinhaLoja` | Configurar vitrine pública (slug, branding, depoimentos) |
| `/painel/revendedor/indicacoes` | `RevendedorIndicacoes` | Indicações / programa de afiliados |
| `/painel/revendedor/api` | `RevendedorApi` | Chaves de API + docs (licenças) |
| `/painel/revendedor/api-recargas` | `RevendedorApiRecargas` | Docs da API de recargas |
| `/painel/revendedor/baixar-extensao` | `RevendedorBaixarExtensao` | Download do .zip da extensão personalizada |
| `/painel/revendedor/niveis` | `RevendedorNiveis` | Visualização do nível atual e benefícios |
| `/painel/revendedor/ranking` | `RevendedorRanking` | Ranking mensal de revendedores |
| `/painel/revendedor/personalizar-extensao` | `RevendedorPersonalizarExtensao` | Personalizar branding da própria extensão |
| `/painel/revendedor/transacoes` | `RevendedorTransacoes` | Extrato financeiro detalhado |
| `/painel/revendedor/resetar-chave` | `RevendedorResetarChave` | Reset de HWID por cliente |

### 👤 Painel — CLIENTE FINAL
| Rota | Arquivo | Função |
|---|---|---|
| `/painel/cliente` | `ClienteDashboard` | Boas-vindas + status |
| `/painel/cliente/extensoes` | `ClienteExtensoes` | Lista de extensões liberadas para o cliente |

### ⚙️ Compartilhado
| Rota | Arquivo | Função |
|---|---|---|
| `/painel/conta` | `AjustesConta` | Editar perfil, senha, WhatsApp |
| `/painel` | `PainelRedirect` | Redireciona conforme o role |

---

## 4. Backend — Edge Functions (74 ao total)

Categorias principais:

- **Ativação:** `activation-create-pix`, `activation-review`, `activation-submit-proof`, `activation-waive`
- **Pagamento MisticPay:** `misticpay-create-recharge`, `misticpay-webhook`, `misticpay-list-transactions`, `check-misticpay-withdraw`, `test-misticpay-connection`, `get-my-misticpay-credentials`
- **Licenças:** `lovax-api`, `provider-api`, `place-method-license-order`, `place-reseller-order`, `license-reset-device`, `pack-generate-key`, `pack-create-purchase`, `pack-admin-adjust`, `list-available-packs`
- **Créditos / Recargas:** `lovable-credits-api`, `lovable-credits-public`, `reseller-credit-costs`, `reseller-credits-api`, `sync-credit-purchase-status`, `cancel-credit-purchase`, `cancel-credit-recharge`, `refund-credit-recharge-balance`, `apply-recharge-schedule`
- **Planos (assinatura):** `recharge-plan-public`, `recharge-plan-cron`, `recharge-plan-manual-sale`, `recharge-plan-cancel`, `subscription-create-charge`, `subscription-cancel-charge`, `subscription-cron-tick`, `subscription-generate-key`
- **Loja / Storefront:** `storefront-create-order`, `storefront-create-trial`, `storefront-order-status`, `expire-pending-storefront-orders`, `cancel-storefront-order`, `release-pending-order`
- **Vendas / Estornos:** `cancel-sale`, `refund-sale-balance`, `gerente-estornar-venda`, `mark-provider-refund-manual`, `retry-provider-refund`, `request-refund`, `audit-cancelled-purchases`
- **Extensão:** `extension-build-zip`, `extension-config`, `public-extension-download`
- **Telegram:** `telegram-webhook`, `telegram-dispatch`, `telegram-balance-check`, `telegram-delivery-progress`
- **WhatsApp (Evolution):** `evolution-api`, `evolution-send-sale`, `test-evolution-connection`, `system-whatsapp-api`, `system-whatsapp-notify`, `system-whatsapp-webhook`
- **Admin / Demo:** `admin-create-demo-account`, `admin-create-monthly-reseller`, `admin-delete-demo-account`, `reset-demo-account`
- **APIs revendedor:** `reseller-api`, `reseller-recharge-api`, `reseller-webhooks-dispatcher`, `reseller-license-action`
- **Outros:** `generate-testimonials-ai`, `apply-promotion-schedule`, `pricing-issues`

---

## 5. Variáveis de ambiente / Secrets necessárias

No novo projeto Supabase, configurar (Functions → Secrets):

- `MISTICPAY_*` (credenciais do gateway)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`
- `LOVAX_API_*` (provedor de licenças externo)
- `LOVABLE_CREDITS_API_*` (provedor de recargas externo)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (gerados automaticamente)

No frontend (`.env`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

---

## 6. Reverter para um backup

Use a **História** nativa do Lovable (não dá para reverter via código sem perda):

1. Clique no botão **revert** abaixo da mensagem do chat correspondente ao ponto que quer voltar; **ou**
2. Abra a aba **History** no topo do chat e selecione a versão.

Mensagens posteriores ficam arquivadas e podem ser re-aplicadas.