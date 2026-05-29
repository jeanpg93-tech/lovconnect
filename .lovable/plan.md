## Diagnóstico encontrado

- O envio em si está funcionando: a fila `telegram_outbox` não tem pendências agora e as últimas mensagens foram enviadas.
- O problema está antes do envio: nem toda movimentação gera uma linha confiável na fila.
- Há tipos de movimentação que aparecem no painel e não são tratados como venda/recarga/estorno no gatilho atual, principalmente variações de créditos via API/manual e alguns estornos.
- O gatilho atual captura erros internamente e apenas emite warning; isso impede a transação de quebrar, mas também dificulta descobrir quando uma notificação deixou de ser enfileirada.
- Também há casos em que o débito é criado antes do pedido relacionado existir; nesses casos a notificação cai no texto genérico e pode perder detalhes, ou depender de atualização posterior.

## Plano de correção

1. **Atualizar o gatilho de movimentações**
   - Cobrir explicitamente todos os tipos reais de `balance_transactions` encontrados:
     - vendas de licença: `license_purchase`, `api_debit`
     - vendas de créditos: `credit_purchase`, `credit_purchase_api`, `credit_purchase_api_manual`, `credit_recharge_api`
     - recargas: `recharge`, `deposit`
     - estornos/reembolsos: `refund`, `order_refund`, `license_purchase_refund`, `credit_purchase_refund`, `credit_purchase_api_refund`, `credit_purchase_api_manual_refund`, `credit_recharge_refund`, `api_refund`, `estorno`, `reembolso`
     - manuais/ajustes: `manual_credit`, `manual_debit`, `adjustment`, `adjustment_debit`, `referral_commission`, `promotion_bonus`
   - Manter os filtros do painel Telegram: vendas, recargas, estornos e outras movimentações.

2. **Criar mensagem garantida mesmo sem registro relacionado**
   - Quando `reference_id` ainda estiver vazio ou o pedido relacionado ainda não existir, enviar uma notificação completa usando os dados da própria movimentação.
   - Isso evita que vendas via API/manual deixem de ser notificadas por dependerem de um registro criado depois.

3. **Adicionar rastreabilidade anti-silêncio**
   - Criar uma tabela simples de auditoria de falhas do Telegram, com permissões adequadas.
   - Alterar o gatilho para registrar qualquer erro nessa auditoria, em vez de apenas “engolir” a falha sem histórico.
   - Assim, se uma futura notificação falhar no enfileiramento, fica visível exatamente qual movimentação falhou e por quê.

4. **Revisar o dispatcher do Telegram**
   - Melhorar logs do `telegram-dispatch` para registrar quantas mensagens pendentes foram buscadas, enviadas e falharam.
   - Preservar o retry em texto puro quando o Telegram rejeitar HTML.

5. **Verificação final**
   - Consultar a base após a migração para confirmar:
     - gatilho ativo em `balance_transactions`
     - configurações do Telegram ligadas
     - fila sem pendências antigas
     - novos tipos mapeados corretamente
   - Testar com uma chamada controlada/consulta de consistência sem criar venda real indevida.

## Arquivos/áreas afetadas

- Banco de dados: função `public.trg_telegram_balance_tx`, possível tabela de auditoria e permissões.
- Backend function: `supabase/functions/telegram-dispatch/index.ts` para logs e robustez.