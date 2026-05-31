# Plano completo — Pagamentos Pack/Mensalista + Reserva de Licenças

## Fase 1 — Feed e Financeiro (Pack + Mensalista)

### 1.1 Feed do Dashboard do Gerente
Em `src/pages/painel/GerenteDashboard.tsx`:
- Adicionar duas queries paralelas:
  - `reseller_pack_purchases` (todos os status: `paid`, `pending`, `expired`, `failed`, `cancelled`)
  - `reseller_subscription_charges` (todos os status)
- Mesclar em `creditMovements` com `kind: "pack_payment"` e `kind: "subscription_payment"`
- Mostrar valor real, nome do revendedor, e badge colorido por status:
  - 🟢 Pago / 🟡 Pendente / ⚪ Expirado/Cancelado / 🔴 Falha

### 1.2 Painel Financeiro
- `useFinancialOverview.ts`: incluir somatórios de Pack e Mensalista (somente status `paid`) na receita.
- `FinanceiroVisaoGeral.tsx`: exibir as duas novas linhas/cards.

---

## Fase 2 — Reserva de Licenças (compromisso de Packs)

### Conceito
- **Comprometido** = `SUM(reseller_pack_balances.credits)` (créditos comprados ainda não consumidos por nenhum revendedor).
- **Disponível real (global)** = `SUM(estoque_provedor por método)` − **Comprometido**.
- Como créditos de pack podem ser usados em qualquer método de geração, usamos o **estoque global** (soma) para validar packs.

### 2.1 Função SQL `get_pack_commitments()`
- SECURITY DEFINER, retorna `{ committed_credits: int }`.
- Lê `SELECT COALESCE(SUM(credits),0) FROM reseller_pack_balances`.

### 2.2 Hook `useProviderCommitments.ts` (novo)
- Combina `provider-api?action=usage-all` (estoque por método) + RPC `get_pack_commitments()`.
- Retorna `{ totalAvailable, committed, realAvailable, perMethod[] }`.

### 2.3 UI — Sidebar / Dashboard
- `AppSidebar.tsx` (gerente): card "Estoque" com:
  - Disponível total / Comprometido em Packs / Disponível real
  - Badge vermelho se `comprometido > disponível`
- Dashboard do gerente: KPI "Comprometidas com Packs" com alerta visual.

### 2.4 Validação em `pack-create-purchase/index.ts`
- Antes de criar PIX: checar `disponivel_real >= pack.credits`.
- Se não: retornar erro genérico `"Pacote temporariamente indisponível"`.

### 2.5 Aviso na geração manual
- Em `place-method-license-order` / `pack-generate-key`: se `comprometido > disponível` no método, logar warning (sem bloquear gerente).

---

## Fase 3 — Auto-desabilitar planos de Pack por estoque (silencioso)

### Regra
Para cada plano de `license_packs`:
- `disponivel_real = estoque_global − comprometido`
- Se `pack.credits > disponivel_real` → **ocultar** do revendedor (sem mensagem, sem badge "esgotado", simplesmente não aparece).
- Painel do gerente continua vendo todos os planos com indicador "Indisponível agora" (apenas para o gerente).

### 3.1 Função SQL `list_available_packs_for_reseller()`
- SECURITY DEFINER.
- Calcula `disponivel_real` (chamando lógica interna ou via parâmetro vindo do edge).
- Como o estoque do provedor não vive no banco (vem da API externa), a alternativa é:
  - **Opção A (escolhida):** criar edge function `list-available-packs` que:
    1. Busca `license_packs` ativos.
    2. Chama `provider-api?action=usage-all` para obter estoque global.
    3. Chama RPC `get_pack_commitments()`.
    4. Filtra/marca cada pack como `available: pack.credits <= (estoque − comprometido)`.
    5. Retorna só os disponíveis para o revendedor.

### 3.2 Frontend revendedor — `RevendedorComprarPacote.tsx`
- Trocar query direta em `license_packs` por chamada à nova edge `list-available-packs`.
- Se lista vier vazia: manter mensagem atual ("Nenhum pacote disponível no momento.").
- **Sem nenhuma indicação** de "por que" um pack sumiu.

### 3.3 Frontend gerente — `GerentePacotes.tsx`
- Continuar listando todos via `license_packs` direto.
- Adicionar coluna/badge "Disponível agora" / "Indisponível (estoque)" usando o mesmo hook `useProviderCommitments`.

### 3.4 Validação cruzada em `pack-create-purchase`
- Mantém a validação de 2.4 como **dupla checagem** (caso o usuário tenha aberto a tela há tempo).

---

## Fase 4 — Responsividade Web + Mobile

Garantir em todas as telas tocadas:

### Mobile (< 640px)
- **GerenteDashboard feed**: cards empilhados, badges em linha abaixo do título, fontes reduzidas.
- **AppSidebar card "Estoque"**: stack vertical das 3 métricas; em telas pequenas, esconde o card no menu colapsado.
- **RevendedorComprarPacote**: grid `grid-cols-1` em mobile (já tinha `sm:grid-cols-2 lg:grid-cols-4`, mantém).
- **GerentePacotes badge "Indisponível"**: usa `truncate` e `flex-wrap`.
- **FinanceiroVisaoGeral cards Pack/Mensalista**: respeitar grid existente; em mobile, full-width.

### Tablet/Desktop
- Manter grids existentes; novos KPIs entram como cards adicionais no grid responsivo.
- Sidebar card "Estoque" só aparece no estado expandido.

### Padrões usados
- Tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`) — sem cores hardcoded.
- Breakpoints Tailwind: `sm:`, `md:`, `lg:` apenas.
- Testar em 360px, 768px, 1280px.

---

## Arquivos afetados

| Arquivo | Ação |
|---------|------|
| `src/pages/painel/GerenteDashboard.tsx` | Feed Pack/Mensalista + KPI comprometido |
| `src/hooks/useFinancialOverview.ts` | Receita Pack/Mensalista |
| `src/components/painel/financeiro/FinanceiroVisaoGeral.tsx` | UI receita Pack/Mensalista |
| `src/components/painel/AppSidebar.tsx` | Card estoque/comprometido |
| `src/hooks/useProviderCommitments.ts` | **Novo** hook |
| `src/pages/painel/RevendedorComprarPacote.tsx` | Trocar query por edge `list-available-packs` |
| `src/pages/painel/GerentePacotes.tsx` | Badge "Disponível/Indisponível" |
| `supabase/functions/pack-create-purchase/index.ts` | Validação estoque vs comprometido |
| `supabase/functions/list-available-packs/index.ts` | **Nova** edge function |
| **Migration** | Função SQL `get_pack_commitments()` |

---

## Ordem de execução
1. Migration `get_pack_commitments()` (rápido, sem breaking).
2. Edge `list-available-packs` + validação em `pack-create-purchase`.
3. Hook + UI sidebar/dashboard (Fase 2).
4. Trocar tela do revendedor para usar nova edge (Fase 3).
5. Feed + financeiro (Fase 1) — independente, pode ir junto.
6. Ajustes finais de responsividade.
