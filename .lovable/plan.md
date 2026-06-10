## O que vou fazer

### 1. Investigar as chaves "fantasma" (TS-3BC11D…, TS-65E0…, TS-E77F…, TS-67745D…)

Confirmei que essas chaves **não existem** em `orders`, `storefront_orders` nem `trial_registrations` do seu banco. Porém aparecem na lista porque elas **vêm do endpoint `lovax-api?action=usage`** (consulta `list_licenses` no MétodoLovax/provedor). Ou seja, é o provedor MétodoLovax que está respondendo essas chaves no `list_licenses`, mesmo você dizendo que não existem.

Investigação proposta:
- Adicionar log temporário em `lovax-api` (action=usage) para registrar o raw payload do provedor por chave (especialmente os campos `owner`, `api_key_id`, `metadata`) e descobrir de onde elas vêm. Suspeitas:
  - O token do MétodoLovax está apontando para uma conta compartilhada que vê chaves de outros tenants.
  - Existe um cache no provedor que retorna chaves já deletadas.
  - As chaves foram geradas por algum job/teste que falhou antes de gravar no nosso `orders` (rollback do nosso lado, mas chamada ao provedor já tinha ido).
- Verificar `function_edge_logs` em `place-reseller-order`, `storefront-create-trial`, `pack-generate-key`, `subscription-generate-key`, `lovax-api?action=generate` nos timestamps das chaves para detectar geração órfã.
- Depois de identificar a origem, decidir: (a) corrigir token, (b) deletar/ocultar essas chaves no provedor, ou (c) filtrar chaves sem dono no painel.

Vou anexar o resultado da investigação na resposta após a execução — não vou alterar nada do provedor sem te avisar.

### 2. Coluna "Responsável" — melhorar quando vier vazia

- Para chaves geradas há poucos minutos, fazer 1 retry automático da carga (delay 1s) caso `reseller_id` venha nulo mas a chave esteja em `orders` (corrige race condition pós-geração).
- Quando a chave **não tem dono em lugar nenhum** (caso "fantasma"): em vez de mostrar `—`, mostrar etiqueta `Órfã (provedor)` com tooltip explicando "Esta chave foi retornada pelo MétodoLovax mas não existe nos nossos registros. Provavelmente criada fora do painel."
- Quando a chave tem `reseller_id` mas o email do perfil falhou: mostrar pelo menos o `display_name` do revendedor (hoje só mostra o email).

### 3. Etiquetas da coluna "Geração" — documentação visível

Adicionar ícone de info no cabeçalho da coluna com tooltip explicando cada etiqueta:

- **API** (azul): Chave gerada por integração externa usando uma chave de API do revendedor (`reseller_api_keys`). Origem típica: bot/site do revendedor consumindo nossa API pública.
- **Loja do Cliente** (rosa): Compra feita por um cliente final na storefront pública do revendedor (`/u/<slug>`). Registrada em `storefront_orders`.
- **Painel** (âmbar): Gerada manualmente pelo revendedor dentro do painel (botão "Gerar chave"). Registrada em `orders` sem `api_key_id`.
- **Provedor** (verde): Chave que existe no MétodoLovax mas **não tem registro nosso** — gerada fora do nosso sistema (direto no painel do provedor, ou pelas chaves "fantasma" que estamos investigando).

### 4. Layout da tabela — corrigir scroll lateral travado

Hoje a tabela está dentro de `overflow-hidden`, então conteúdos largos (chave + badge "marcar teste" + email longo) cortam sem permitir rolagem.

- Trocar wrapper `overflow-hidden` por `overflow-x-auto` com `min-width` na `<Table>` para garantir que cabeçalho/linhas acompanhem.
- Reduzir largura mínima das colunas com `whitespace-nowrap` controlado e truncamento explícito no email (já existe, mas a célula da chave também precisa de `max-width`).
- Garantir que o scroll horizontal apareça apenas quando necessário (sem barra dupla).

### 5. Performance da página

Hoje a página:
- Carrega TODAS as orders + TODAS storefront_orders + TODAS chaves do provedor + lovax sem limite.
- Renderiza tudo em uma única tabela (centenas de linhas + countdown atualizando a cada 1s re-renderiza tudo).

Otimizações:
- **Paginação cliente-side de 50 por página** (item 6 abaixo) — corta o custo de render.
- Mover o `now` (tick de 1s) para um componente filho `<Countdown />` que só re-renderiza a célula de validade, não a tabela inteira.
- Memoizar `getExpiry` / `computeStatus` por linha.
- Limitar consulta de `orders`/`storefront_orders` ao mesmo recorte que o provedor devolve (últimas 500), já que chaves muito antigas raramente aparecem no `usage` atual.

### 6. Paginação — 50 por página

Adicionar controle de paginação abaixo da tabela:
- 50 itens por página (configurável: 25/50/100).
- Indicador "Página X de Y · Z licenças".
- Botões anterior/próxima + saltos rápidos.
- Reset para página 1 ao mudar filtro/busca.

---

## Arquivos afetados

- `src/pages/painel/GerenteLicencasAcompanhar.tsx` — layout, paginação, performance, tooltip de geração, retry da coluna responsável, etiqueta "Órfã".
- `supabase/functions/lovax-api/index.ts` — log temporário do raw provider payload para investigação.
- (possivelmente) novo componente `src/components/painel/LicenseCountdown.tsx` para isolar o tick de 1s.

## O que NÃO vou fazer agora

- Não vou alterar/deletar chaves no provedor sem você confirmar após a investigação.
- Não vou mexer no fluxo de geração de chaves (não há indício de bug nele ainda).