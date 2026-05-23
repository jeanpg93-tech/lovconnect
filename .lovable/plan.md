## Integração WhatsApp via Evolution API

Boa notícia: **70% da infraestrutura já existe no banco**. A tabela `reseller_integrations` já tem todos os campos (`evolution_enabled`, `evolution_instance`, `evolution_message_template`, `evolution_confirmation_template`, `connection_status`, `profile_name/number/picture_url`, `messages_sent_count`). Falta UI, edge functions de conexão e ganchos nas vendas.

### Arquitetura

- **Servidor Evolution único** (usa os secrets `EVOLUTION_BASE_URL` e `EVOLUTION_API_KEY` já configurados)
- **Cada revendedor = 1 instância** dentro do servidor (nome gerado automaticamente: `rev_{reseller_id_curto}`)
- **Disparo automático em todas as vendas concluídas** (incluindo teste/trial)
- **Templates padrão do sistema + edição livre por revendedor**

### O que vou criar

**1. Migration** — adicionar templates padrão por tipo de venda em `app_settings`:
- `evolution_template_license` (licença normal/teste)
- `evolution_template_recharge` (recarga Lovable)
- `evolution_template_storefront` (venda da loja pública)

**2. Edge functions novas**
- `evolution-connect` — cria/conecta instância do revendedor e retorna QR code base64
- `evolution-status` — polling do estado da conexão; ao detectar `open`, salva `profile_name/number/picture_url` e `last_connected_at`
- `evolution-disconnect` — logout + opcionalmente deletar instância
- `evolution-send-test` — envia mensagem de teste pro próprio número
- `evolution-send-sale` — função interna chamada pelas outras edge functions ao concluir venda (renderiza template, dispara mensagem, incrementa contador)

**3. Hooks nas vendas existentes** — chamar `evolution-send-sale` em:
- `place-reseller-order` (licença manual / teste)
- `storefront-create-order` + `misticpay-webhook` (venda pública paga)
- Fluxo de créditos Lovable (quando entregue)

**4. UI nova: `RevendedorIntegracaoWhatsApp.tsx`**
- Card de status: foto/nome/número do WhatsApp conectado, contador de mensagens enviadas
- Botão **Conectar** → modal com QR code (auto-refresh, polling de status)
- Botão **Desconectar**
- Toggle **"Enviar mensagem automática nas vendas"** (`evolution_enabled`)
- 3 textareas editáveis com variáveis: `{nome}`, `{chave}`, `{tipo}`, `{link}`, `{valor}` + botão "Restaurar padrão"
- Campo de teste: WhatsApp de destino + botão "Enviar teste"

**5. Rota + sidebar**
- Rota `/painel/integracao-whatsapp`
- Item no menu lateral do revendedor (próximo ao "Integração MisticPay")

### Variáveis dos templates

| Variável | Significado |
|---|---|
| `{nome}` | Nome do comprador |
| `{chave}` | Chave da licença (vendas de licença) |
| `{tipo}` | Tipo da licença (PRO 7d, Vitalícia, etc.) |
| `{link}` | Link de entrega (recarga Lovable) |
| `{valor}` | Valor pago formatado |
| `{loja}` | Nome da loja do revendedor |

### Endpoints Evolution usados

- `POST /instance/create` — criar instância
- `GET /instance/connect/{instance}` — obter QR code
- `GET /instance/connectionState/{instance}` — status
- `GET /instance/fetchInstances` — buscar perfil
- `POST /instance/logout/{instance}` — desconectar
- `POST /message/sendText/{instance}` — enviar mensagem

### Detalhes técnicos

- QR code expira ~40s → frontend faz polling a cada 3s no `evolution-status` e, se ainda `connecting`, recarrega o QR via `evolution-connect`
- Mensagens usam markdown leve do WhatsApp (`*negrito*`)
- Envio é **fire-and-forget**: falha no WhatsApp não bloqueia a venda — apenas loga erro
- WhatsApp do comprador já é coletado em todos os fluxos de venda existentes (`reseller_customers.whatsapp`, `storefront_orders.buyer_whatsapp`, etc.)
