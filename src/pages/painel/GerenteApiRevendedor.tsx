import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { KeyRound, Copy, BookOpen, Shield, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";
import CopyAllDocsButton from "@/components/api/CopyAllDocsButton";

const BASE_URL = "https://lojinhalovable.com/api/v1/revenda";

function DocBlock({ title, body }: { title: string; body: string }) {
  const onCopy = () => {
    navigator.clipboard.writeText(body);
    toast.success("Copiado");
  };
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 px-2 text-xs">
          <Copy className="mr-1 h-3 w-3" /> Copiar
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre">
{body}
      </pre>
    </div>
  );
}

export default function GerenteApiRevendedor() {
  const docsRef = useRef<HTMLDivElement>(null);
  return (
    <PageContainer>
      <PageHeader
        title={
          <h1 className="font-display text-3xl font-black tracking-tighter sm:text-5xl">
            API <span className="text-primary italic">Revendedor</span>
          </h1>
        }
        description="Documentação oficial da API de recargas de recargas para revendedores."
        icon={KeyRound}
        actions={<CopyAllDocsButton containerRef={docsRef} fileName="api-revendedor.md" />}
      />

      <div ref={docsRef} className="space-y-4">
      {/* Onboarding */}
      <div className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-sm">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Comece em 3 passos
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { n: 1, t: "Crie uma chave", d: "Em 'Painel > Integrações', gere uma chave lov_live_…" },
            { n: 2, t: "Autentique", d: "Envie o header X-API-Key em todas as requisições." },
            { n: 3, t: "Compre recargas", d: "Consulte saldo, calcule orçamentos, crie e acompanhe pedidos." },
          ].map((s) => (
            <div key={s.n} className="rounded-lg border border-border bg-secondary/30 p-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {s.n}
              </div>
              <div className="mt-2 text-sm font-semibold">{s.t}</div>
              <p className="mt-1 text-xs text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Base URL */}
      <div className="grid gap-4 md:grid-cols-2">
        <DocBlock
          title="URL Base e exemplo"
          body={`# Base URL\n${BASE_URL}\n\n# Exemplo\ncurl -X GET "${BASE_URL}/saldo" \\\n  -H "X-API-Key: lov_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"`}
        />
        <div className="rounded-xl border border-border bg-card/60 p-4 text-xs leading-relaxed">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Regras e Limites
          </h4>
          <div className="mt-3 space-y-2">
            <div><strong>Quantidade:</strong> 10 a 5000 recargas, em múltiplos de 10.</div>
            <div className="border-t border-border pt-2">
              <strong>Preços:</strong> definidos pelo seu nível. Consulte sempre via{" "}
              <code className="font-mono bg-secondary/60 px-1 rounded">/orcamento</code>.
            </div>
            <div className="border-t border-border pt-2">
              <strong>Pagamento:</strong> os pedidos debitam automaticamente do seu{" "}
              <strong>saldo</strong>. Em caso de falha o valor é{" "}
              <strong>estornado integralmente</strong>.
            </div>
            <div className="border-t border-border pt-2">
              <strong>Autenticação:</strong> header{" "}
              <code className="font-mono bg-secondary/60 px-1 rounded">X-API-Key</code> obrigatório em todas as chamadas.
            </div>
          </div>
        </div>
      </div>

      <h3 className="mt-2 font-display text-base font-semibold flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-primary" /> Endpoints
      </h3>

      {/* SALDO */}
      <DocBlock
        title="GET /saldo — Consultar saldo"
        body={`curl -X GET "${BASE_URL}/saldo" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "saldoCentavos": 2240,
    "saldoReais": "22.40"
  }
}`}
      />

      {/* ORCAMENTO */}
      <DocBlock
        title="GET /orcamento?creditos={qtd} — Calcular orçamento"
        body={`# Calcula o preço para uma quantidade específica de recargas
# sem criar pedido. Verifica também se há saldo suficiente.

curl -X GET "${BASE_URL}/orcamento?creditos=100" \\
  -H "X-API-Key: SUA_API_KEY"

# Parâmetros
#   creditos*  number   10 a 5000, múltiplos de 10

# Resposta
{
  "success": true,
  "data": {
    "creditos": 100,
    "precoCentavos": 590,
    "precoReais": "5.90",
    "saldoAtualCentavos": 2240,
    "saldoAtualReais": "22.40",
    "saldoSuficiente": true,
    "precoUnitarioCentavos": 8.4
  }
}`}
      />

      {/* CRIAR PEDIDO */}
      <DocBlock
        title="POST /pedidos — Criar pedido (debita saldo)"
        body={`# Opcionalmente informe o tipo_entrega já na criação para evitar
# uma chamada extra a PUT /pedidos/{id}/tipo-entrega.

# Workspace próprio
curl -X POST "${BASE_URL}/pedidos" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creditos": 100,
    "tipo_entrega": "workspace_proprio"
  }'

# Entrega por link de convite
curl -X POST "${BASE_URL}/pedidos" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "creditos": 100,
    "tipo_entrega": "link",
    "link_convite": "https://lovable.dev/invite/..."
  }'

# Body
#   creditos*       number   10-5000, múltiplos de 10
#   tipo_entrega    string   "workspace_proprio" | "link"
#                            (se omitido, o cliente configura depois)
#   link_convite    string   Obrigatório quando tipo_entrega="link"
#                            Formato: https://lovable.dev/invite/...

# Resposta (workspace_proprio)
{
  "success": true,
  "data": {
    "pedidoId": "uuid-do-pedido",
    "creditos": 100,
    "valorCentavos": 590,
    "valorReais": "5.90",
    "status": "aguardando",
    "linkCliente": "https://pedido.lvbcredits.com/uuid-do-pedido",
    "novoSaldoCentavos": 1650,
    "novoSaldoReais": "16.50"
  }
}

# Resposta (tipo_entrega="link" com link_convite válido)
{
  "success": true,
  "data": {
    "pedidoId": "uuid-do-pedido",
    "creditos": 100,
    "status": "configurando",
    "linkCliente": "https://pedido.lvbcredits.com/uuid-do-pedido",
    "novoSaldoCentavos": 1650,
    "novoSaldoReais": "16.50"
  }
}`}
      />

      {/* LISTAR PEDIDOS */}
      <DocBlock
        title="GET /pedidos — Listar pedidos (paginado)"
        body={`curl -X GET "${BASE_URL}/pedidos?page=1&limit=20" \\
  -H "X-API-Key: SUA_API_KEY"

# Query params
#   page    number   Padrão 1
#   limit   number   Padrão 20, máximo 100
#   status  string   Filtro por status (separados por vírgula):
#                    novo, aguardando, configurando, recarregando,
#                    entregando, sucesso, falha, queimado,
#                    cancelado, reembolsado

# Resposta
{
  "success": true,
  "data": {
    "pedidos": [
      {
        "id": "uuid-do-pedido",
        "creditos": 100,
        "status": "sucesso",
        "valorCentavos": 590,
        "valorReais": "5.90",
        "tipoEntrega": "workspace_novo",
        "emailContaLovable": "cliente@email.com",
        "creditosEnviados": 100,
        "linkCliente": "https://pedido.lvbcredits.com/uuid-do-pedido",
        "criadoEm": "2026-01-22T12:00:00Z",
        "atualizadoEm": "2026-01-22T12:05:00Z"
      }
    ],
    "paginacao": {
      "paginaAtual": 1,
      "totalPaginas": 3,
      "totalPedidos": 45,
      "limite": 20
    }
  }
}`}
      />

      {/* DETALHE PEDIDO */}
      <DocBlock
        title="GET /pedidos/{id} — Consultar pedido"
        body={`curl -X GET "${BASE_URL}/pedidos/UUID_DO_PEDIDO" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "id": "uuid-do-pedido",
    "creditos": 100,
    "status": "configurando",
    "valorCentavos": 590,
    "valorReais": "5.90",
    "tipoEntrega": "workspace_proprio",
    "emailContaLovable": "cliente@email.com",
    "emailConviteBot": "bot-abc123@lovable.dev",
    "clienteConfirmouConvite": true,
    "statusVerificacaoConvite": "confirmado",
    "mensagemBot": null,
    "tentativasConvite": 1,
    "etapaProcessamento": 2,
    "workspaceId": "ws-12345",
    "workspaceName": "Meu Workspace",
    "permissaoWorkspaceAdmin": true,
    "creditsUsed": 10,
    "creditsGranted": 110,
    "creditsUsedEnd": null,
    "creditsGrantedEnd": null,
    "creditosEnviados": 50,
    "cancelar": false,
    "linkCliente": "https://pedido.lvbcredits.com/uuid-do-pedido",
    "criadoEm": "2026-01-22T12:00:00Z",
    "atualizadoEm": "2026-01-22T12:05:00Z"
  }
}`}
      />

      {/* TIPO ENTREGA */}
      <DocBlock
        title="PUT /pedidos/{id}/tipo-entrega — Definir tipo de entrega"
        body={`curl -X PUT "${BASE_URL}/pedidos/UUID_DO_PEDIDO/tipo-entrega" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tipo_entrega": "workspace_novo",
    "email_conta_lovable": "cliente@email.com"
  }'

# Body
#   tipo_entrega*         string  "workspace_novo" | "workspace_proprio" | "link"
#   email_conta_lovable   string  Email da conta Lovable do cliente (opcional)
#   link_convite          string  Obrigatório quando tipo_entrega="link"
#                                 Formato: https://lovable.dev/invite/...

# Resposta: o objeto completo do pedido (mesmo shape de GET /pedidos/{id})`}
      />

      {/* EMAIL LOVABLE */}
      <DocBlock
        title="PUT /pedidos/{id}/email-lovable — Atualizar email Lovable"
        body={`# Só pode ser alterado antes de enviar recargas.

curl -X PUT "${BASE_URL}/pedidos/UUID_DO_PEDIDO/email-lovable" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email_conta_lovable": "novoemail@email.com"
  }'

# Body
#   email_conta_lovable*  string  Novo email da conta Lovable

# Resposta: objeto completo do pedido (mesmo shape de GET /pedidos/{id})`}
      />

      {/* CONFIRMAR CONVITE */}
      <DocBlock
        title="POST /pedidos/{id}/confirmar-convite — Confirmar convite do bot"
        body={`# Apenas para tipo_entrega = "workspace_proprio".
# Após confirmar, consulte GET /pedidos/{id}/acoes para ver
# o resultado da verificação do bot.

curl -X POST "${BASE_URL}/pedidos/UUID_DO_PEDIDO/confirmar-convite" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "acaoId": "uuid-da-acao",
    "pedidoId": "uuid-do-pedido",
    "tipo": "confirmar_convite",
    "status": "aguardando",
    "criadoEm": "2026-01-22T12:00:00Z"
  }
}

# Retornos possíveis em statusVerificacaoConvite (via GET /pedidos/{id}):
#   confirmado          → Bot encontrou o convite com permissão de Owner.
#                         O farm de recargas inicia automaticamente.
#   permissao_incorreta → Bot recebeu o convite SEM permissão de Owner.
#                         Cliente deve promover o bot a Owner.
#   nao_encontrado      → Bot não encontrou nenhum convite.
#                         Cliente deve reenviar o convite para o
#                         emailConviteBot e chamar este endpoint de novo.`}
      />

      {/* AÇÕES BOT */}
      <DocBlock
        title="GET /pedidos/{id}/acoes — Listar ações do bot"
        body={`curl -X GET "${BASE_URL}/pedidos/UUID_DO_PEDIDO/acoes" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "pedidoId": "uuid-do-pedido",
    "total": 2,
    "acoes": [
      {
        "id": "uuid-da-acao",
        "tipo": "confirmar_convite",
        "status": "concluido",
        "mensagem": null,
        "resultado": { "verificado": true },
        "criadoEm": "2026-01-22T12:00:00Z",
        "atualizadoEm": "2026-01-22T12:01:00Z",
        "finalizadoEm": "2026-01-22T12:01:00Z"
      }
    ]
  }
}`}
      />

      <DocBlock
        title="GET /pedidos/{id}/acoes/{acaoId} — Consultar ação do bot"
        body={`curl -X GET "${BASE_URL}/pedidos/UUID_DO_PEDIDO/acoes/UUID_DA_ACAO" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "id": "uuid-da-acao",
    "pedidoId": "uuid-do-pedido",
    "tipo": "confirmar_convite",
    "status": "concluido",
    "mensagem": null,
    "resultado": { "verificado": true },
    "criadoEm": "2026-01-22T12:00:00Z",
    "atualizadoEm": "2026-01-22T12:01:00Z",
    "finalizadoEm": "2026-01-22T12:01:00Z"
  }
}`}
      />

      {/* CANCELAR */}
      <DocBlock
        title="POST /pedidos/{id}/cancelar — Cancelar pedido"
        body={`# Apenas pedidos com status "aguardando" ou "configurando"
# e SEM recargas enviados.

curl -X POST "${BASE_URL}/pedidos/UUID_DO_PEDIDO/cancelar" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "pedidoId": "uuid-do-pedido",
    "cancelar": true,
    "mensagem": "Solicitação de cancelamento registrada. O bot processará o cancelamento."
  }
}`}
      />

      {/* REEMBOLSO */}
      <DocBlock
        title="POST /pedidos/{id}/reembolso — Solicitar reembolso"
        body={`# Reembolso proporcional para pedidos cancelados.
# Cálculo: (valor_pago / creditos_totais) x creditos_nao_enviados

curl -X POST "${BASE_URL}/pedidos/UUID_DO_PEDIDO/reembolso" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "pedidoId": "uuid-do-pedido",
    "creditosTotal": 100,
    "creditosEnviados": 30,
    "creditosNaoEnviados": 70,
    "valorPagoCentavos": 590,
    "valorReembolsoCentavos": 413,
    "valorReembolsoReais": "4.13",
    "novoSaldoCentavos": 2240,
    "novoSaldoReais": "22.40"
  }
}`}
      />

      {/* ==================== PLANO 3K ==================== */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Plano 3K (assinatura de recarga)
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Endpoints para vender o <strong>Plano 3K</strong> (assinatura que entrega recargas
          diariamente por X dias). O fluxo gera um <strong>link de checkout</strong> único
          (<code className="font-mono">linkCliente</code>) que o seu cliente abre para confirmar
          os dados e iniciar a entrega. O custo é debitado do seu saldo no momento da venda.
        </p>
      </div>

      <DocBlock
        title="GET /planos/catalogo — Catálogo de planos disponíveis"
        body={`# Lista todos os planos ativos com SEU preço de venda configurado.
# Use para popular sua loja/checkout antes de criar uma venda.

curl -X GET "${BASE_URL}/planos/catalogo" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "planos": [
      {
        "planoId": "uuid-do-plano",
        "nome": "Plano 3K Créditos",
        "descricao": "...",
        "duracaoDias": 30,
        "creditosPorDia": 100,
        "capTotal": 3000,
        "horarioEntregaBRT": 9,
        "custoCentavos": 12000,
        "precoVendaCentavos": 19900,
        "disponivel": true
      }
    ]
  }
}

# disponivel = true somente quando você definiu sale_price_cents > 0
# em /painel/revendedor/plano-precos e ativou o plano.`}
      />

      <DocBlock
        title="POST /planos — Gerar venda (debita custo do saldo)"
        body={`# Cria a assinatura, debita o custo do seu saldo e devolve o
# link de checkout que você envia para o cliente.

curl -X POST "${BASE_URL}/planos" \\
  -H "X-API-Key: SUA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "x-app-origin: https://sualoja.com.br" \\
  -d '{
    "planoId": "uuid-do-plano",
    "cliente": {
      "nome": "João da Silva",
      "whatsapp": "+5511999998888"
    },
    "notas": "Venda realizada via site da loja"
  }'

# Body
#   planoId*           string  UUID retornado em /planos/catalogo
#   cliente.nome*      string  2-120 caracteres
#   cliente.whatsapp   string  Opcional, até 32 caracteres
#   notas              string  Opcional, até 500 caracteres

# Header opcional
#   x-app-origin       Domínio que será usado para montar o linkCliente
#                      (ex.: https://sualoja.com.br). Se omitido, é usado
#                      o domínio padrão da API.

# Resposta
{
  "success": true,
  "data": {
    "assinaturaId": "uuid-da-assinatura",
    "token": "token-de-32-chars",
    "status": "awaiting_owner",
    "linkCliente": "https://sualoja.com.br/plano/TOKEN",
    "custoCentavos": 12000,
    "precoVendaCentavos": 19900,
    "novoSaldoCentavos": 50000,
    "novoSaldoReais": "500.00"
  }
}

# Fluxo recomendado para integrar no site:
#   1. Cliente escolhe o Plano 3K na sua loja e paga você (Pix, cartão etc).
#   2. Após confirmar o pagamento, seu backend chama POST /planos.
#   3. Redirecione o cliente para o linkCliente — ele preenche o email
#      Lovable e o bot inicia as entregas diárias automaticamente.`}
      />

      <DocBlock
        title="GET /planos — Listar assinaturas (paginado)"
        body={`curl -X GET "${BASE_URL}/planos?limit=50&offset=0" \\
  -H "X-API-Key: SUA_API_KEY"

# Query params
#   limit   number   Padrão 50, máximo 200
#   offset  number   Padrão 0
#   status  string   awaiting_owner | awaiting_confirm | active |
#                    completed | cancelled | failed

# Resposta resumida — use GET /planos/{token} para detalhes + entregas.`}
      />

      <DocBlock
        title="GET /planos/{token} — Detalhes da assinatura + entregas"
        body={`curl -X GET "${BASE_URL}/planos/TOKEN_DE_32_CHARS" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": {
    "assinaturaId": "uuid",
    "token": "...",
    "status": "active",
    "cliente": { "nome": "João", "whatsapp": "+5511..." },
    "workspaceName": "Meu Workspace",
    "emailBotOwner": "bot-xyz@lovable.dev",
    "inicio": "2026-06-13T12:00:00Z",
    "fim": "2026-07-13T12:00:00Z",
    "duracaoDias": 30,
    "creditosPorDia": 100,
    "custoCentavos": 12000,
    "precoVendaCentavos": 19900,
    "entregas": [
      { "dia": 1, "dataAgendada": "2026-06-13", "creditos": 100,
        "status": "delivered", "entregueEm": "2026-06-13T09:02:11Z" }
    ]
  }
}`}
      />

      <DocBlock
        title="POST /planos/{token}/cancelar — Cancelar antes do início"
        body={`# Só funciona enquanto o cliente AINDA NÃO confirmou o início
# (status awaiting_owner ou awaiting_confirm). O custo debitado é
# integralmente estornado para o seu saldo.

curl -X POST "${BASE_URL}/planos/TOKEN_DE_32_CHARS/cancelar" \\
  -H "X-API-Key: SUA_API_KEY"

# Resposta
{
  "success": true,
  "data": { "cancelado": true }
}`}
      />

      <DocBlock
        title="Webhooks de Plano 3K (opcional)"
        body={`# Se sua API key tiver webhook_url configurado, eventos do Plano 3K
# são enviados automaticamente. Eventos padrão:
#   plan.sold       → venda criada com sucesso
#   plan.completed  → todas as entregas foram concluídas
#   plan.cancelled  → assinatura cancelada (manual ou falha)
#
# Opt-in (precisa estar listado em webhook_events da key):
#   plan.delivery.completed → cada entrega diária concluída

# Payload exemplo (plan.sold)
{
  "event": "plan.sold",
  "subscription_id": "uuid",
  "reseller_id": "uuid",
  "occurred_at": "2026-06-13T12:00:00Z",
  "plan_id": "uuid",
  "plan_name": "Plano 3K Créditos",
  "customer": { "name": "João", "whatsapp": "+5511..." },
  "duration_days": 30,
  "credits_per_day": 100,
  "total_credits": 3000,
  "cost_cents": 12000,
  "sale_price_cents": 19900,
  "order_token": "token-32-chars"
}`}
      />

      {/* STATUS */}
      <div className="rounded-xl border border-border bg-card/60 p-4 text-xs leading-relaxed">
        <h4 className="text-sm font-semibold">Estados (status) de um pedido</h4>
        <table className="mt-3 w-full text-xs">
          <thead className="border-b border-border text-left text-muted-foreground">
            <tr>
              <th className="pb-2 pr-4 font-mono">status</th>
              <th className="pb-2">Descrição</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              ["novo", "Pedido recém-criado, ainda sem configuração."],
              ["aguardando", "Aguardando o cliente configurar a entrega."],
              ["configurando", "Configuração em andamento (link/convite)."],
              ["recarregando", "Bot está recarregando os recargas no workspace."],
              ["entregando", "Entrega final em curso."],
              ["sucesso", "Recargas entregues com sucesso."],
              ["falha", "Erro no processamento — saldo estornado."],
              ["queimado", "Pedido invalidado por uso indevido."],
              ["cancelado", "Cancelado pelo revendedor/cliente."],
              ["reembolsado", "Reembolso processado (parcial ou total)."],
            ].map(([s, d]) => (
              <tr key={s}>
                <td className="py-2 pr-4 font-mono text-primary">{s}</td>
                <td className="py-2 text-muted-foreground">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WARNING */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-muted-foreground flex gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-600 dark:text-amber-400">Importante:</strong> nunca exponha
          sua <code className="font-mono">X-API-Key</code> no frontend. Todas as requisições devem partir
          do seu backend. A chave é mostrada apenas uma vez — em caso de comprometimento, revogue e crie outra.
        </div>
      </div>
      </div>
    </PageContainer>
  );
}
