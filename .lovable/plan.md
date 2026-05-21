
# Redesign global "MisticPay vibe"

## 1. Direção visual

- **Paleta**: branco/lavanda muito clara como fundo, **roxo vibrante** (`#7C3AED` / `262 83% 58%`) como cor principal, com gradientes roxo→violeta para destaques. Dark mode mantém o mesmo roxo sobre fundo `#0B0B12`.
- **Tipografia**: `Plus Jakarta Sans` (UI) + `Space Grotesk` (display), trocar headings serifa-like por títulos pesados e arredondados.
- **Forma**: cantos bem arredondados (`--radius: 0.875rem`), botões pílula nos CTAs, cards macios com sombra difusa roxa (`0 20px 60px -20px hsl(262 83% 58% / .25)`).
- **Atmosfera**: blobs roxos desfocados no fundo (no lugar do grid/scanlines do tema atual), pequenos badges "místicos" em vez de bordas marcantes.
- Remover paleta vermelha/grid/scanlines do tema atual. `--gradient-red`, `text-gradient-red`, `glow-red` viram aliases roxos para não quebrar componentes existentes.

## 2. O que muda em código (tokens)

- **`src/index.css`**: redefinir todas as variáveis HSL (light + dark) para o novo sistema roxo, trocar `font-family` para Plus Jakarta Sans, substituir o background grid por blobs animados sutis. Manter os utilitários `bg-grid`, `text-gradient-red`, `glow-red`, `animate-pulse-red` (com aparência roxa) para evitar regressão.
- **`tailwind.config.ts`**: adicionar `font-display: ['Sora']` ou `Plus Jakarta`, novos gradientes (`bg-gradient-mystic`), sombras (`shadow-mystic`), keyframes para o blob.
- **`index.html`**: trocar import de fontes (Space Grotesk → Plus Jakarta Sans + Sora).

## 3. Landing pública (`src/pages/Index.tsx`)

Reescrever no estilo MisticPay:
- Header simples (logo à esquerda, links centrais, "Entrar"/"Painel" à direita, toggle dark/light).
- Hero dividido: **esquerda** título grande "Plataforma de revendas com a menor fricção do mercado" + parágrafo + CTA pílula roxo + chip "convite". **Direita** ilustração / cartões flutuantes com badges (saldo, vendas, recargas).
- Faixa "A escolha de quem escala" com 4–6 chips de partners/níveis.
- 3 seções curtas: "Para revendedores", "Para clientes", "Integrações".
- Footer minimal.
- Mantém o `useAuth` para alternar CTA "Acessar painel" vs "Login".

## 4. Painel: simplificação da sidebar

Reescrever `groupsByRole` em `src/components/layout/AppSidebar.tsx` com **menos seções** e nomes claros. **Nenhuma rota é deletada** — só re-agrupada, e algumas viram sub-tabs dentro de páginas existentes (sem nova navegação).

### Gerente — antes: 5 grupos, ~22 itens. Depois: 4 grupos, foco no que é diário

- **Visão geral**: Dashboard, Financeiro, Vendas da Loja
- **Operação**: Aprovações, Avisos, Usuários, Performance
- **Rede**: Revendedores, Níveis, Afiliados, Partners, Premiação Ranking
- **Produtos & Recargas**: Geração Manual, Valores Extensões, Valores Recargas, Acompanhar Recargas, Licenças, Resetar chave, Upload Extensão, Dashboard Recargas
- **Configurações** (collapsible no rodapé): Conta, Gateway, API Método, API Recargas, API Revendedor, Ações Especiais, Instalar App, Zona de Risco

### Revendedor — antes: 6 grupos. Depois: 3 grupos diretos

- **Painel**: Dashboard, Transações, Indique e ganhe, Ranking, Níveis
- **Vender**: Comprar Recarga, Comprar Créditos, Meus Clientes, Minhas Vendas, Minha Loja
- **Configurar**: Preços (extensões + créditos numa só página com tabs), API (chaves + recargas), Integrações (MisticPay + Evolution), Baixar/Instalar, Resetar chave, Conta

### Cliente — segue 2 itens (Dashboard, Extensões), só restilizado.

A sidebar ganha: cabeçalho com avatar maior, busca rápida (`⌘K`), grupos colapsáveis com chevron suave, tema alternável no rodapé, e estado ativo com fundo roxo claro + barra lateral.

## 5. Páginas que ganham consolidação leve (sem perder funcionalidade)

Para "ter menos páginas" sem deletar features, vou **agrupar dois pares relacionados em tabs** dentro de uma única página:

- `RevendedorExtensoes` + `RevendedorCreditos` → ambos sob `/painel/revendedor/precos` com `<Tabs>` (rotas antigas continuam funcionando via redirect).
- `RevendedorApi` + `RevendedorApiRecargas` → `/painel/revendedor/integracoes/api` com tabs (idem).
- `RevendedorIntegracaoMisticPay` + `RevendedorIntegracaoEvolution` já viram tabs sob `/painel/revendedor/integracoes`.

Resultado prático: a sidebar mostra 3 itens em vez de 6, mas todo o código existente continua acessível.

## 6. Padronização de páginas

- `PageHeader` redesenhado: título grande, subtítulo cinza, ações à direita com botão pílula primário roxo.
- `StatCard` redesenhado: card com ícone em "pílula" roxa, número em destaque, variação em badge.
- Botões shadcn já consomem tokens — variantes ganham um `mystic` (gradiente roxo).
- `MobileNav` recolore para o novo tema.

## 7. Toggle dark/light

- Adicionar contexto simples `ThemeProvider` (`localStorage` + classe `dark` no `html`).
- Botão no rodapé da sidebar e no header da landing.
- Já existe `ThemeToggle.tsx` — reaproveitar.

## 8. Não-mudanças

- Nenhuma lógica de negócio é tocada (auth, edge functions, queries).
- Nenhuma rota é removida — apenas re-agrupada e/ou redirecionada.
- `src/integrations/supabase/*` permanece intacto.

## 9. Ordem de execução

1. Tokens (`index.css`, `tailwind.config.ts`, `index.html`).
2. Landing nova (`Index.tsx`).
3. Sidebar nova + tema toggle no rodapé.
4. `PageHeader` / `StatCard` / shells.
5. Páginas combinadas em tabs (Preços, API, Integrações).
6. Pass visual rápido em `Auth.tsx`, `PublicStorefront.tsx`, `PublicRecharge.tsx`.

## 10. Riscos

- 80+ páginas usam classes existentes; muitas usam `text-gradient-red`/`glow-red` etc. — mantenho os nomes e só troco a cor por trás, então nada quebra visualmente em massa.
- A reorganização de `groupsByRole` é puramente cosmética — todas as URLs continuam válidas.

```text
Landing  Sidebar  Tokens
   │        │        │
   └────────┴────────┘
        Painel restilizado (1 passada por shell)
                │
        Tabs de consolidação (3 grupos)
```
