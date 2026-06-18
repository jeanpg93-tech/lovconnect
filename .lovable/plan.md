# Personalização da Extensão — Página do Revendedor

Vou implementar a personalização **na mesma página** `/painel/revendedor/baixar-extensao`, abaixo da lista de downloads, com escopo **essencial** (Opção A) e extração automática de cores da logo.

## Layout da página

```
┌─────────────────────────────────────────┐
│ Download das Extensões                  │
│ [lista de extensões com botão Baixar]   │
├─────────────────────────────────────────┤
│ Personalizar Minha Extensão             │
│ ┌──────────────┬────────────────────┐   │
│ │  Formulário  │   Preview ao vivo  │   │
│ │  (essencial) │                    │   │
│ └──────────────┴────────────────────┘   │
│ ▸ Configurações avançadas (recolhido)   │
│ [Salvar personalização]                 │
└─────────────────────────────────────────┘
```

No mobile: preview vira um botão "Ver preview" que abre Drawer.

## Campos essenciais (v1)

1. **Marca**: nome de exibição
2. **Logo** — campo único + toggle "usar separado":
   - Modo único: 1 upload usado como light + dark + ícone
   - Modo separado: 3 uploads (logo clara / logo escura / ícone)
3. **Cor primária** — extraída automaticamente da logo (Canvas API, sem custo) com 3-5 sugestões clicáveis; usuário pode sobrescrever via color picker
4. **WhatsApp / Suporte**: número (validação E.164)
5. **Saudação ao cliente**: texto curto (máx 80 caracteres)

## Configurações avançadas (collapsible, escondido por padrão)

Reusa os campos que já existem no `ExtensionCustomizer` atual:
- Cor secundária
- Atalhos customizados
- Tela de licença
- Banner promocional
- Toggle de histórico
- (e demais campos da tabela `extension_customizations`)

## Implementação técnica

### Frontend
- Nova seção dentro de `RevendedorBaixarExtensao.tsx` (não cria página nova — a `RevendedorPersonalizarExtensao.tsx` pode redirecionar/ficar como fallback)
- Novo componente `EssentialCustomizerForm.tsx` (formulário enxuto) que persiste em `extension_customizations` pelos mesmos campos do componente completo
- Bloco `<Collapsible>` que monta o `ExtensionCustomizer` existente em modo "advanced-only" (props nova `mode: "essential" | "advanced"`)
- Preview reaproveitando `ExtensionPreview`
- Extração de cor: `extractPaletteFromImage(file)` em `src/lib/color-extract.ts` — desenha em canvas, faz quantização simples (buckets de 32) e retorna top 5 cores

### Upload de logo
- Bucket `extension-logos` (criar se não existir, público) com policy: revendedor só escreve no próprio prefixo `{reseller_id}/{extension_id}/...`
- Validação: PNG/SVG/JPG, ≤ 500KB, mínimo 128×128

### Backend
- Edge function `extension-config` **já existe** e já entrega `display_name`, `primary/secondary_color`, `logo_url`, `favicon_url` por `license_key`. Sem mudanças necessárias para v1.

### Seleção da extensão a personalizar
- A página lista N extensões. Adicionar um seletor (`Select` ou tabs) acima do formulário: "Personalizando: [Extensão]". Default = primeira ativa.

## Arquivos

- **Editar** `src/pages/painel/RevendedorBaixarExtensao.tsx` — adiciona seção de personalização
- **Criar** `src/components/extension-customizer/EssentialCustomizerForm.tsx`
- **Criar** `src/lib/color-extract.ts`
- **Editar** `src/components/extension-customizer/ExtensionCustomizer.tsx` — aceitar prop `mode`
- **Migração**: criar bucket `extension-logos` + policies (via storage tools)

## Fora do escopo (v1)
- Gerar ZIP personalizado por revendedor (Opção A — descartada)
- Reescrever o `ExtensionCustomizer` de 769 linhas
- Mudar a função `extension-config`

Confirmando: sigo com esse plano?
