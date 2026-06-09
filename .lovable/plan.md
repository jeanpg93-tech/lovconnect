## Plano de correção urgente: Lovax definitivo

### Objetivo
Remover o Flow de todos os caminhos de geração de chave/licença/teste e garantir que painel, API e loja pública usem somente Lovax.

### Problema confirmado
- A configuração global já está em Lovax.
- O erro atual do teste no painel é real: o Lovax está retornando `customer_name obrigatório` porque alguns fluxos de trial enviam payload sem `customer_name`.
- Ainda existem vários fallback/branches Flow no backend; mesmo com Lovax ativo, qualquer tela/API antiga ou dado legado pode cair em erro ou bloquear com “método desativado”.

### Arquivos que serão corrigidos
1. `supabase/functions/subscription-generate-key/index.ts`
   - Painel revendedor mensalista.
   - Forçar Lovax sempre.
   - Trial deve chamar Lovax com `action: generate_trial` e `customer_name` padrão, mesmo quando o painel não pede nome.
   - Remover fallback Flow/provider antigo.

2. `supabase/functions/pack-generate-key/index.ts`
   - Painel revendedor Pack.
   - Forçar Lovax sempre.
   - Trial deve enviar `customer_name` padrão.
   - Remover fallback Flow/provider antigo.

3. `supabase/functions/place-reseller-order/index.ts`
   - Geração manual/legada de pedidos do revendedor.
   - Forçar Lovax para licenças pagas e testes.
   - Trial Lovax com `customer_name`.
   - Eliminar fallback Flow.

4. `supabase/functions/place-method-license-order/index.ts`
   - Endpoint por método/pacote.
   - Aceitar/normalizar método para Lovax, sem permitir Flow.
   - Eliminar branch Flow.

5. `supabase/functions/reseller-api/index.ts`
   - API pública do revendedor:
     - `generate`
     - `generate-trial`
     - `licencas`
     - `licencas-trial`
   - Forçar Lovax em todos.
   - Se cliente externo enviar `metodo: flow`, normalizar para Lovax ou retornar orientação clara sem tentar Flow.
   - Trial sempre com `customer_name`.
   - Manter autenticação, preço, débito, pacote, estorno, logs e webhooks existentes.

6. `supabase/functions/storefront-create-trial/index.ts`
   - Trial da loja pública.
   - Forçar Lovax.
   - Garantir `customer_name` no payload.
   - Remover leitura/uso de `extension_method` para escolher provedor.

7. `supabase/functions/misticpay-webhook/index.ts`
   - Entrega pós-pagamento da loja pública.
   - Forçar Lovax na geração da licença.
   - Remover branch Flow e URLs antigas.
   - Manter lógica de débito, pack, fallback saldo, estorno e notificações.

8. `supabase/functions/reseller-license-action/index.ts`
   - Ações de licença no painel: reset HWID, revogar, excluir.
   - Hoje ainda chama provider antigo/Flow.
   - Trocar para Lovax usando `lovax_api_token`/`lovax_base_url`.

9. Frontend/documentação do revendedor, se necessário
   - Ajustar tela/docs da API para não orientar uso de Flow/metodo antigo.
   - Garantir que a tela de gerar chave não dependa de método carregado como Flow.

### Validação depois da correção
- Testar edge functions diretamente:
  - Trial painel Pack/Mensalista.
  - Licença painel Pack/Mensalista.
  - API `generate-trial`.
  - API `generate`.
  - Loja pública trial.
- Conferir logs e últimos pedidos para confirmar:
  - sem chamadas para `ynvrijkuampxpsmshftm`;
  - sem `MétodoFlow`;
  - sem `customer_name obrigatório`;
  - chave retornada e pedido marcado como concluído.

### Resultado esperado
Depois da implementação, qualquer geração de chave/teste/licença no sistema inteiro usará Lovax definitivamente; Flow não será mais caminho de geração.