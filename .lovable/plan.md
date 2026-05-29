## Objetivo

Substituir a cor principal do site (atualmente vermelho) por azul, mantendo todo o resto do design (layout, tipografia, espaçamentos) intacto.

## Escopo

A cor primária é controlada por tokens semânticos no design system (`src/index.css`). Trocando os tokens, toda a UI que usa `bg-primary`, `text-primary`, `border-primary`, gradientes e sombras herda automaticamente o azul — sem precisar alterar componentes.

## Mudanças

**Arquivo: `src/index.css`**

Tema claro (`:root`):
- `--primary: 0 75% 35%` → `217 91% 50%` (azul vibrante)
- `--primary-glow: 0 70% 60%` → `217 95% 70%`
- `--sidebar-primary` igual ao primary
- `--gradient-mystic` / `--gradient-red`: trocar os HSL vermelhos por tons de azul (ex.: `hsl(217 91% 50%)` → `hsl(222 85% 30%)`)
- `--shadow-mystic` / `--shadow-red`: trocar o hue de `0` para `217`

Tema escuro (`.dark`):
- `--primary: 0 85% 45%` → `217 95% 58%` (azul mais luminoso para fundo escuro)
- `--primary-glow: 0 90% 65%` → `210 100% 75%`
- `--sidebar-primary` igual
- Mesmos ajustes em `--gradient-mystic`, `--gradient-red`, `--shadow-mystic`, `--shadow-red`

Os nomes de tokens (`--gradient-red`, `--shadow-red`) ficam como estão para não quebrar referências; só o valor muda para azul.

## O que NÃO muda

- Verde de sucesso (emerald), âmbar de alerta, vermelho de destrutivo/cancelado — continuam como estão.
- Tipografia, layouts, componentes, lógica.
- A palavra final destacada nos títulos (ex.: "Geral" no Dashboard) ficará azul automaticamente, pois usa `text-primary`.

## Verificação após implementar

Abrir o painel e conferir: botões primários, badges "ativo", título com palavra em itálico, sidebar ativa, gráficos e gradientes — todos devem aparecer em azul.
