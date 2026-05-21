# Excluir "jeanpg.93" do ranking de vendas

## O que mudar

Filtrar o revendedor cujo `display_name` (ou `slug`) é `jeanpg.93` da lista exibida no ranking mensal, sem alterar nenhum dado no banco — apenas ocultação na UI.

## Arquivos

1. **`src/pages/painel/GerenteRevendedores.tsx`** (página atual `/painel/gerente/revendedores`)
   - Em `rankedResellers` (memo, linha ~251), após o `.map`, adicionar `.filter` removendo entradas cujo reseller correspondente tenha `display_name === "jeanpg.93"` ou `slug === "jeanpg.93"`.

2. **`src/pages/painel/RevendedorRanking.tsx`** (ranking público visto pelos revendedores — mesmo "Ranking Mensal" da imagem anexada)
   - Aplicar o mesmo filtro na lista retornada por `get_reseller_ranking_v2`, para que jeanpg.93 também não apareça em `#1` para os outros revendedores.

## Detalhes técnicos

- Criar uma constante compartilhada `HIDDEN_RANKING_SLUGS = ["jeanpg.93"]` (pode ficar em `src/lib/utils.ts` ou inline em cada arquivo — opto por inline simples para manter mudança mínima).
- O filtro é puramente visual; o RPC `get_reseller_ranking_v2` continua retornando o registro, mas a UI ignora.
- Sem mudanças em banco, edge functions, ou tipos.

## Confirmação necessária

A imagem anexada mostra o "Ranking Mensal" exibido aos revendedores (`RevendedorRanking`). Confirmar: aplicar o filtro nos **dois** lugares (painel do gerente + ranking visto pelos revendedores), correto?
