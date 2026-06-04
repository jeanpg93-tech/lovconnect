## Tour de boas-vindas para novos revendedores

Sim, é totalmente possível. A ideia é mostrar um passo a passo guiado pelo painel **apenas uma vez**, e **somente após o revendedor pagar e ter o PIX de adesão aprovado** (`activation_status = "active"`).

### Quando o tour aparece

- Só dispara quando `resellers.activation_status` virar `active` (ou seja, logo após o gerente aprovar o pagamento de adesão).
- Só aparece para a conta uma única vez: depois que o revendedor concluir ou pular, fica marcado como visto e nunca mais reaparece.
- Não aparece para contas antigas que já estavam ativas antes desse recurso — só para quem ativar de agora em diante (controlado por um marcador novo no banco, default "não viu mas é antigo").
- Não aparece para gerentes, clientes finais, contas demo, banidas ou inativas.

### Como funciona para o revendedor

1. Logo após o pagamento ser aprovado, ao entrar no painel pela primeira vez, abre um modal de boas-vindas:
   - "Bem-vindo(a)! Seu acesso foi liberado. Quer um tour rápido (≈ 1 min) pelos principais recursos?"
   - Botões: **Começar tour** / **Pular** (pular também marca como visto).
2. O tour é um overlay com balões/destaques posicionados sobre elementos reais do painel, navegando pelas páginas-chave:
   - **Dashboard** — visão geral, saldo, vendas do dia.
   - **Gerar chave** — como criar a primeira licença para um cliente.
   - **Minhas chaves / Clientes** — onde acompanha o que foi vendido.
   - **Comprar créditos / Adicionar saldo** — como manter saldo para gerar chaves.
   - **Minha loja** — link público para vender no automático.
   - **Preços** — onde define seus valores de venda.
   - **Integrações** (MisticPay, WhatsApp) — opcionais, mostradas como "configure depois".
   - **Indique e ganhe** — link de afiliado pronto pra divulgar.
   - **APIs & Extensão** — onde baixar/instalar.
3. Cada passo tem botões **Anterior / Próximo / Pular tour**. Ao concluir o último passo, mostra um card final tipo "Tudo pronto, bom faturamento!" com atalhos para Dashboard, Comprar créditos e Indicações.
4. Um pequeno botão "Refazer tour" fica disponível em **Ajustes da conta**, caso o revendedor queira rever depois.

### Detalhes técnicos (para a equipe)

**Banco**
- Nova coluna `resellers.onboarding_tour_status` enum: `pending` | `completed` | `skipped`.
  - Default para contas novas: `pending`.
  - Migração marca todos os revendedores já existentes como `completed` para não acionar o tour neles.
- Nova coluna `resellers.onboarding_tour_completed_at timestamptz`.
- Trigger ou ajuste no fluxo de aprovação de ativação: quando `activation_status` muda para `active` e a conta foi criada recentemente, garantir `onboarding_tour_status = 'pending'` (caso ainda não esteja).
- RLS: revendedor pode ler e atualizar essas duas colunas no próprio registro.

**Front-end**
- Novo hook `useOnboardingTour()` que retorna `{ shouldShow, status, markCompleted, markSkipped, restart }`. Combina `useActivation` (`status === "active"`) + `onboarding_tour_status === "pending"`.
- Novo componente `OnboardingTour` montado dentro de `AppLayout` (apenas para role `reseller`), usando uma lib de tour leve (ex.: `driver.js` ou `react-joyride`) — Joyride é a opção mais comum no stack React.
- Steps definidos como array com `target` (seletor CSS / `data-tour="..."`), `title`, `body`, `route` para navegar antes de exibir.
- Adicionar atributos `data-tour="dashboard-saldo"`, `data-tour="menu-gerar-chave"`, etc., nos elementos-alvo do sidebar/cards (sem mudar visual).
- Ao concluir/pular, chama RPC ou update direto para gravar o status.
- Botão "Refazer tour" em `AjustesConta` chamando `restart()` (volta `onboarding_tour_status` para `pending` na sessão local — sem alterar banco — e remonta o tour).

**Mobile**
- Tour adaptado: no mobile abre o menu lateral automaticamente nos passos que destacam itens do sidebar, e usa balões menores. Joyride suporta isso com `disableScrolling: false` e `scrollToFirstStep`.

**Edge cases tratados**
- Se o revendedor recarregar a página no meio do tour, ele retoma do passo onde parou (estado salvo em `localStorage` por user_id).
- Se o revendedor for banido/desativado durante o tour, o tour é encerrado.
- Se a rota destino do passo não existir (ex.: feature desabilitada para aquele tier), o passo é pulado silenciosamente.

### Fora do escopo deste plano
- Tradução para outros idiomas (mantém só pt-BR por enquanto, seguindo o restante do painel).
- Tour para gerentes ou clientes finais.
- Tour em vídeo / animações além dos balões.

Posso seguir com a implementação quando você aprovar.