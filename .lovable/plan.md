
# Plano: Conta Demo + Tradução PT/EN

Entrega em **4 fases independentes** — cada fase fica funcional ao final, dá pra testar e validar antes da próxima. Tudo 100% responsivo (mobile-first, testado nos breakpoints já usados no projeto).

---

## Fase 1 — Infra de conta demo (backend)

**Objetivo:** marcar contas como "demo" e ter como criar/excluir sob demanda.

- Migration: adicionar `is_demo boolean default false` em `resellers` + índice
- Edge function `admin-create-demo-account` (só gerente):
  - Recebe: `email`, `password`, `display_name`, `company_name`
  - Cria user no Auth (email já confirmado) + profile + reseller com `is_demo=true` + role `revendedor`
  - Marca `is_active=true`, `subscription_onboarding_completed=true`, `activation` como `active` (pula todos os gates)
  - Retorna credenciais pra você copiar e enviar ao cliente
- Edge function `admin-delete-demo-account` (só gerente):
  - Recebe `reseller_id`, valida que `is_demo=true` (proteção: nunca apaga conta real)
  - Apaga em cascata: chaves, vendas, transações, profile, auth user
- Página nova em `/painel/gerente/contas-demo`:
  - Card com formulário (email, senha, nome do cliente, empresa) + botão "Criar"
  - Lista das demos ativas com botão "Excluir" e botão "Copiar credenciais"
  - Item no menu lateral do gerente (seção "Ações especiais")

**Critério de pronto:** você cria uma demo pelo painel, faz login com ela, navega normalmente, depois exclui.

---

## Fase 2 — Guards e isolamento de métricas

**Objetivo:** demo navega à vontade sem afetar nada real nem gastar dinheiro.

- **Filtros nas queries do gerente** (`is_demo=false`):
  - `GerenteDashboard`, `GerenteRevendedores`, `GerenteFinanceiroGeral`, `GerenteVendasLoja`, `GerenteRanking*`, `GerenteAcompanharRecargas`, `GerenteTodasLicencas`, `GerenteAtivacoes`
- **Guards em edge functions sensíveis** (se `reseller.is_demo` → retorna sucesso fake, não toca em provedor/gateway):
  - `place-reseller-order`, `place-method-license-order` → gera chave fake local
  - `misticpay-create-recharge`, `subscription-create-charge` → retorna PIX fake
  - `evolution-send-sale`, `telegram-dispatch` → no-op
  - `provider-api` (qualquer chamada externa) → mock
- **Banner fixo no topo da demo**: "🎭 Você está em uma conta de demonstração. Dados fictícios, ações simuladas."
- Botão "🔄 Resetar demo" no banner (limpa chaves/vendas/transações geradas pelo visitante, mantém dados-seed)

**Critério de pronto:** logar na demo, gerar uma chave, fazer uma "venda", recarregar saldo — nada aparece no painel real do gerente, nada chama provedor de verdade.

---

## Fase 3 — Dados-seed fictícios

**Objetivo:** demo já abre "cheia" de exemplos pro cliente ver o produto funcionando.

Quando `admin-create-demo-account` rodar, popular automaticamente:
- ~15 chaves geradas (status variados: ativa, expirada, revogada)
- ~10 vendas na loja (clientes fictícios brasileiros, valores variados, últimas 30 dias)
- ~5 transações de carteira (recargas + descontos)
- Saldo inicial de R$ 250,00
- 1 loja configurada com slug `demo-<id>`, produtos de exemplo
- 2-3 clientes cadastrados

Tudo com nomes claramente fictícios (`João Demo`, `Maria Exemplo`) pra ninguém confundir.

**Critério de pronto:** abrir uma demo recém-criada e ver dashboard com gráficos populados, vendas, chaves — não vazio.

---

## Fase 4 — Internacionalização PT/EN

**Objetivo:** toggle 🇧🇷/🇺🇸 funcional, com escopo controlado.

**Setup técnico:**
- Instalar `react-i18next` + `i18next` + `i18next-browser-languagedetector`
- Estrutura:
  ```text
  src/i18n/
    index.ts
    locales/
      pt/{common,demo,dashboard,keys,store,wallet}.json
      en/{common,demo,dashboard,keys,store,wallet}.json
  ```
- Hook `useTranslation()` disponível globalmente
- Persistência da escolha em `localStorage` (`i18n_lang`)
- Detecção inicial: idioma do browser → fallback PT

**Toggle visual:**
- Componente `<LanguageSwitcher />` (bandeira + sigla, compacto)
- Posição desktop: header/sidebar (próximo ao notification center)
- Posição mobile: dentro do menu mobile, item dedicado
- **Visível só na conta demo nesta fase** (flag `isDemo` do `useRole`)

**Páginas traduzidas nesta fase (as que a demo acessa):**
1. `RevendedorDashboard`
2. `RevendedorMinhasChaves`
3. `RevendedorGerarChave`
4. `RevendedorMinhaLoja`
5. `RevendedorCarteira`
6. `RevendedorClientes`
7. Sidebar + MobileNav (labels do menu)
8. Banner da demo + componentes de layout compartilhados

Demais páginas continuam em PT — quando você quiser expandir, é só pedir "traduz a página X" e eu sigo o padrão já estabelecido.

**Critério de pronto:** logar na demo, clicar no toggle 🇺🇸, todas as 6 páginas + menu trocam pra inglês instantaneamente, recarregar mantém o idioma.

---

## Responsividade (regra geral, vale pras 4 fases)

- Todo componente novo testado em 3 breakpoints: **375px (mobile)**, **768px (tablet)**, **1280px+ (desktop)**
- Formulário de criar demo: stack vertical no mobile, 2 colunas no desktop
- Lista de demos: cards empilhados no mobile, tabela no desktop (padrão já usado em `GerenteRevendedores`)
- Banner da demo: texto reduzido + ícone no mobile, completo no desktop
- Toggle de idioma: ícone-only no mobile (40x40), ícone+label no desktop
- Modal "Resetar demo": full-screen no mobile, dialog centralizado no desktop

---

## Detalhes técnicos (resumo)

- **Auth da demo:** conta normal do Supabase Auth com email confirmado, sem nenhuma flag especial no `auth.users`. Diferenciação 100% via `resellers.is_demo`.
- **Segurança das edge functions admin:** validar `has_role(auth.uid(), 'gerente')` no início de cada uma, retornar 403 se falhar.
- **i18n bundle:** lazy-load por namespace (só carrega `keys.json` quando entra na página de chaves) → impacto mínimo no bundle inicial.
- **Tipagem:** declaração `declare module 'react-i18next'` com recursos tipados → autocomplete das chaves de tradução, evita typo.
- **Rollback fácil:** se algo der errado em qualquer fase, é só excluir a demo afetada — zero impacto em prod.

---

## Ordem sugerida de execução

Faço **Fase 1 → você testa → Fase 2 → testa → Fase 3 → testa → Fase 4 → testa**. Cada fase é uma entrega isolada, dá pra pausar entre elas se você quiser priorizar outra coisa.

Posso começar pela Fase 1?
