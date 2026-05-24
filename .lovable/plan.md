# Ativação do Painel — R$ 200,00

Fluxo completo: cadastro → aprovação manual do gerente → preview limitado → pagamento (PIX automático **ou** comprovante manual) → liberação total + bônus.

## 1. Estados do revendedor

Novo campo `activation_status` em `resellers`:

| status | significado |
|---|---|
| `awaiting_payment` | Aprovado pelo gerente, vendo preview, sem pagar |
| `payment_under_review` | Enviou comprovante manual, aguarda gerente |
| `active` | Painel totalmente liberado |
| `payment_rejected` | Comprovante recusado → volta para preview com aviso |

Migration marca **todos os revendedores atuais como `active`** (grandfathered). Só novos pagam.

## 2. Aprovação do gerente (mantida)

`approve_user()` continua existindo. Diferença: agora ele cria o reseller com `activation_status = 'awaiting_payment'` em vez de já liberar tudo. As 10 chaves trial bronze **não** são geradas aqui — vêm só após pagamento.

## 3. Preview — o que bloquear

**Permitido (somente leitura):**
- Dashboard, Preços, Níveis, Ranking, Docs API, Ajustes da conta, Indicações (visualizar código)

**Bloqueado (mostra modal "Ative seu painel R$ 200"):**
- Gerar chave / criar pedido (`place-reseller-order`, `place-method-license-order`)
- Storefront: criar/editar/publicar loja
- Comprar créditos Lovable, recargas de saldo
- API do revendedor (todas as keys ficam suspensas)
- Integrações WhatsApp / MisticPay
- Compra/uso de extensão personalizada

**Proteção em duas camadas:**
1. Frontend: hook `useActivation()` + componente `<ActivationGate>` envolve botões/páginas críticas.
2. Backend: cada edge function crítica chama helper `assertActive(user_id)` no início — retorna 403 se não estiver `active`. **Isso é o que de fato impede ações** (frontend é só UX).

## 4. Geração do PIX (R$ 200)

Reaproveita MisticPay. Nova tabela `activation_payments`:
- `reseller_id`, `amount_cents=20000`, `status` (`pending`/`paid`/`under_review`/`approved`/`rejected`)
- `provider`, `provider_transaction_id`, `qr_code_base64`, `copy_paste`, `expires_at`
- `proof_url` (upload manual), `reviewer_id`, `reviewer_note`, `reviewed_at`
- `paid_at`, `activated_at`

Edge function `activation-create-pix`: cria registro + PIX. Reutiliza intent ativo se ainda válido; regenera se expirou (>24h).

## 5. Webhook automático

`misticpay-webhook` ganha branch: se a transação for de `activation_payments`, ao confirmar pagamento:
- marca `status='paid'` + `paid_at`
- chama `activate_reseller(reseller_id)` (RPC SECURITY DEFINER)
- gera 10 trial bronze, registra log, dispara notificação in-app + Telegram

## 6. Comprovante manual

- Bucket privado novo: `activation-proofs` (RLS: dono escreve no próprio path; gerente lê tudo).
- Botão "Já realizei o pagamento" → upload de imagem/PDF + observação opcional.
- Marca `status='under_review'` → revendedor vê banner "Aguardando confirmação".

## 7. Painel do gerente — `/painel/gerente/ativacoes`

Nova página listando `activation_payments` em análise:
- Cliente, valor, data envio, link do comprovante (signed URL), observação do usuário
- Botões: **Aprovar** / **Recusar** (motivo obrigatório se recusar)
- Aprovar → mesma `activate_reseller(...)` do webhook
- Recusar → `status='rejected'` + notifica usuário com motivo (volta a poder pagar via PIX ou reenviar)

## 8. Tela de boas-vindas / ativação

Componente `ActivationWelcome` mostrado:
- Imediatamente após login se `awaiting_payment`
- Layout moderno: header com R$ 200, QR code grande, botão copiar PIX, lista de benefícios:

> **Plano de Revenda — R$ 200,00 (pagamento único)**
> Ao ativar, você recebe imediatamente:
> - Painel completo para gerar suas próprias chaves
> - Geração ilimitada de chaves de **teste** da extensão
> - **10 chaves Bronze** para começar a vender
> - Acesso à API, loja pública, integrações e ranking

Aba secundária: **"Já paguei → enviar comprovante"**.

## 9. Logs e auditoria

Tabela `activation_logs`: `reseller_id`, `event` (`approved_by_manager`, `pix_generated`, `proof_uploaded`, `payment_confirmed`, `proof_approved`, `proof_rejected`, `activated`), `actor_id`, `metadata`, `created_at`.

## 10. Notificações

- Revendedor: PIX gerado, pagamento confirmado, comprovante em análise, comprovante recusado, painel ativado
- Gerente: novo comprovante para analisar (in-app + Telegram)

## 11. Tickets técnicos (ordem de execução)

```text
1. Migration: activation_status, activation_payments, activation_logs, bucket, RPC activate_reseller
2. Migration de dados: marcar todos resellers atuais como 'active'
3. Edge fn: activation-create-pix, activation-submit-proof, activation-status
4. Backend gate: helper assertActive + integração em place-reseller-order, storefront-create-order, misticpay-create-recharge, lovable-credits-api, reseller-api etc.
5. Webhook: branch activation no misticpay-webhook
6. Frontend: hook useActivation, ActivationGate, ActivationWelcome (com tabs PIX | comprovante), banner persistente "Painel em preview"
7. Frontend gerente: /painel/gerente/ativacoes
8. Notificações + entradas Telegram
9. Atualizar PendingProfileGate / AppLayout para roteamento por activation_status
```

## Pontos extras decididos
- PIX expira em 24h, regenerado sob demanda
- Pagamento **não reembolsável** — aviso claro na tela de boas-vindas
- Faixa amarela persistente no topo enquanto não `active`
- Banimento (`is_banned`) continua tendo prioridade sobre tudo

## Pendente para você confirmar antes de eu começar
1. **Texto exato da mensagem de boas-vindas** acima — está bom ou quer ajustar tom/benefícios?
2. **Chave PIX manual de fallback** — exibir alguma no rodapé caso a pessoa prefira pagar fora do QR? Se sim, qual?
3. **Banner topo** — texto sugerido: *"Painel em modo preview. Ative por R$ 200 para liberar todas as funções."* — ok?
