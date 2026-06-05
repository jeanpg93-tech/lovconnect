## Notificações WhatsApp do Sistema — Plano refinado

Confirmado:
- **API:** mesma Evolution já usada hoje, com **instância dedicada do sistema** (separada da `evolution-send-sale` dos revendedores).
- **Frequência alertas 5/6:** 1x por "cruzamento de limite" + cooldown 24h. Limites = os mesmos dos banners atuais.
- **Templates:** editáveis no painel, com modelos prontos.

---

## 1. Eventos (v1)

| # | Evento | Gatilho |
|---|---|---|
| 1 | Cadastro recebido | Após signup, status `pending` |
| 2 | Cadastro aprovado | Gerente aprova |
| 3 | Adesão liberada para pagamento | Ativação fica disponível |
| 4 | Painel liberado | Ativação confirmada |
| 5 | Saldo baixo (loja) | Mesma regra do `PendingBalanceBanner` |
| 6 | Poucas licenças (Pack) | Mesma regra do `PackLowBalanceBanner` |

---

## 2. Nova página: **Gerente → WhatsApp do Sistema**

Rota: `/painel/gerente/whatsapp-sistema`. Página única com **tabs** (responsivo mobile — tabs viram dropdown em <640px ou stack vertical):

### Tab 1 — Conexão
- Status da instância do sistema (conectado/desconectado, perfil, número, última conexão).
- Botão **Conectar** (QR modal, mesmo fluxo do `RevendedorIntegracaoWhatsApp`).
- Botão **Desconectar**.
- Mensagem de teste (input número + enviar).

### Tab 2 — Eventos & Templates
- Lista dos 6 eventos. Cada card:
  - Switch ligar/desligar.
  - Textarea com template editável + botão "Restaurar padrão".
  - Lista de variáveis disponíveis para aquele evento.
- Botão "Salvar tudo" sticky no rodapé.

### Tab 3 — Enviar mensagem manual
- Form: destinatário (busca por revendedor OU número livre), texto da mensagem, botão enviar.
- Suporta envio em massa: selecionar grupo (todos aprovados / aguardando ativação / aguardando aprovação / pack X).
- Confirma antes de disparar quando >5 destinatários.

### Tab 4 — Histórico/Log
- Tabela paginada com filtros (evento, status, período, destinatário).
- Colunas: data, evento, destinatário (nome + número), status (enviado / entregue / erro), motivo do erro, ações.
- Ação **Reenviar** em qualquer linha (erro ou sucesso).
- Card de resumo no topo: enviadas hoje / entregues / com erro.

**Responsividade mobile:** tabela vira lista de cards empilhados; filtros num drawer; tabs no topo viram `select`.

---

## 3. Backend

### Tabelas novas
- `system_whatsapp_settings` (singleton): `instance_name`, `connection_status`, `profile_name`, `profile_number`, `last_connected_at`.
- `system_whatsapp_events`: `event_key` (PK enum), `enabled`, `template`, `cooldown_hours`, `updated_at`. Seed dos 6 eventos com templates default.
- `system_whatsapp_log`: `id`, `event_key` (nullable p/ envios manuais), `reseller_id` (nullable), `to_number`, `message`, `status` (queued/sent/delivered/error), `error_message`, `evolution_message_id`, `sent_at`, `delivered_at`, `created_at`. Index por `(event_key, reseller_id, created_at)` p/ cooldown.

RLS: somente `manager` lê/escreve. Service role full.

### Edge functions
- `system-whatsapp-api` — conectar, status, desconectar, enviar (manual e teste). Reutiliza padrão do `evolution-api`.
- `system-whatsapp-notify` — recebe `{event_key, reseller_id, vars}`, valida cooldown, renderiza template, envia, grava log. Usado pelos triggers e por dispatcher.
- `system-whatsapp-webhook` — recebe callbacks da Evolution (status `DELIVERY_ACK`, `READ`, falhas) e atualiza `system_whatsapp_log`.

### Disparos
- **Eventos 1, 2, 3, 4:** chamadas explícitas no fluxo existente (signup, aprovação, geração de ativação, confirmação de ativação).
- **Eventos 5, 6:** cron `subscription-cron-tick` (já existente) checa condições + cooldown e chama notify.
- Todos os disparos passam por `system-whatsapp-notify` (centralizado).

### Cooldown
Antes de enviar 5/6: `SELECT 1 FROM system_whatsapp_log WHERE event_key=? AND reseller_id=? AND created_at > now() - interval '24h' AND status != 'error'`.

---

## 4. Templates padrão

```
1. Cadastro recebido
Olá *{nome}*! 👋 Recebemos seu cadastro em {loja}.
Em breve nossa equipe vai analisar e te aviso por aqui. ⏳

2. Cadastro aprovado
Boa notícia, *{nome}*! ✅ Seu cadastro foi aprovado.
Acesse o painel: {link}

3. Adesão liberada
*{nome}*, a adesão do painel já está liberada 💳
Valor: *{valor}*  ·  Pague aqui: {link}

4. Painel liberado
Tudo certo, *{nome}*! 🚀 Seu painel está liberado.
Bora vender? {link}

5. Saldo baixo
⚠️ *{nome}*, há {qtd} venda(s) da loja aguardando saldo.
Recarregue para liberar a entrega: {link}

6. Poucas licenças (Pack)
📦 *{nome}*, restam apenas *{restantes}* licenças no pack "{pack}".
Renove para continuar vendendo: {link}
```

---

## 5. Navegação
Item novo no menu Gerente: **WhatsApp do Sistema** (ícone `MessageSquare`), próximo ao **Avisos**.

---

## Dúvidas finais antes de eu implementar

1. **Webhook de entrega:** a Evolution de vocês envia callbacks de `DELIVERY_ACK`/`READ`? Se sim, eu já configuro o webhook pra status real "entregue". Se não, fico só com `enviado` + `erro`.
2. **Envio manual em massa:** quer mesmo agora ou deixo só envio 1-a-1 nesta v1 e a aba "massa" fica para depois?
3. **Número do revendedor:** uso o WhatsApp cadastrado em `resellers.whatsapp` (o mesmo que você está exigindo no gate de perfil), certo?
