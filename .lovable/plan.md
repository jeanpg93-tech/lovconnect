# Modo Manutenção Global

Kill-switch único que **bloqueia toda emissão/venda** para revendedores, mas mantém **consultas** (saldo, licenças, clientes, histórico) 100% funcionais. Gerente continua com acesso total para poder desligar.

## Como funciona (visão do usuário)

**Gerente** (nova aba em `GerenteAcoesEspeciais` ou card no `GerenteDashboard`):
- Toggle "Ativar manutenção global"
- Campo de mensagem customizável (ex.: "Sistema em manutenção até 22h")
- Badge de status + preview de como o revendedor verá

**Revendedor** (quando ativo):
- Banner fixo no topo do `AppLayout` (vermelho/âmbar, com mensagem do gerente)
- Toast na transição off→on (realtime)
- Botões de emissão desabilitados com tooltip "Sistema em manutenção"
- Tentativas via API pública retornam `503` com JSON `{ error: "maintenance", message }`
- Consultas (dashboard, saldo, listagens, relatórios, clientes, extensões instaladas etc.) **continuam funcionando normal**

## O que é bloqueado vs. liberado

**Bloqueado (emissão / mutação de saldo do cliente final):**
- Gerar chave de extensão (`RevendedorGerarChave`)
- Vender plano (`GerarVendaPlanoDialog`)
- Emitir recarga manual (`RevendedorRecarga`)
- Compra via loja pública (`PublicStorefront`, `PublicRecharge`, `PublicExtension`, `PublicPlano`)
- Emissão de trial Claude / venda Claude
- API do Revendedor: endpoints de emissão (gerar chave, criar recarga, criar venda)

**Liberado:**
- Todo o painel de leitura (dashboards, listagens, filtros, relatórios)
- Consulta de saldo, licenças ativas, clientes, histórico, transações
- Ajustes de conta, personalização de loja (edição sem publicação de nova venda)
- Painel do gerente (inteiro)
- Fluxos do cliente-final que já têm licença ativa (portal Claude, etc.)

## Arquitetura técnica

### 1. Fonte da verdade (sem migration nova)
Usar `app_settings` (já existe) com chave `system.maintenance`:
```json
{
  "enabled": true,
  "message": "Sistema em manutenção...",
  "started_at": "2026-07-16T18:00:00Z",
  "started_by": "<uuid do gerente>"
}
```

### 2. RPC de checagem (security definer)
Nova função `public.is_system_in_maintenance() returns boolean` — usada tanto por RLS quanto por edge functions, evita ler `app_settings` em todo lugar.

### 3. Bloqueio no banco (defesa em profundidade)
Adicionar cláusula `AND NOT public.is_system_in_maintenance()` (ou trigger `BEFORE INSERT`) nas policies de INSERT das tabelas de emissão para role `revendedor`:
- `orders`, `direct_sales`, `storefront_orders`
- `client_extensions` (quando criado pelo revendedor)
- `recharge_intents`, `reseller_credit_purchases`
- `claude_orders`
- `pending_storefront_charges`

Gerente/service_role passam direto.

### 4. Bloqueio nas Edge Functions de emissão
As functions de emissão (gerar-chave, criar-venda, api-revendedor-*, storefront-order etc.) checam a flag no início e retornam 503 com a mensagem.

### 5. Frontend
- **Hook novo** `useSystemMaintenance()` — lê `app_settings` + subscreve realtime na chave `system.maintenance`. Reaproveita padrão do `LicenseMaintenanceBanner`.
- **Componente** `<SystemMaintenanceBanner />` montado no `AppLayout` (só aparece para role `revendedor` quando `enabled`).
- **HOC/helper** `disabledByMaintenance` para desabilitar botões de emissão com tooltip padronizado nos pontos citados acima.
- **Card do gerente** `<SystemMaintenanceCard />` — toggle + textarea + confirmação (AlertDialog) antes de ligar, igual ao padrão do `RechargeSettingsCard`.

### 6. Realtime
`app_settings` já tem realtime configurada nas outras chaves de manutenção (`LicenseMaintenanceBanner` já usa `postgres_changes`). Mesmo padrão aqui.

## Entregáveis

1. RPC `is_system_in_maintenance()` (migration)
2. Policies/triggers de bloqueio nas tabelas de emissão (migration)
3. `useSystemMaintenance` hook + `SystemMaintenanceBanner` no `AppLayout`
4. Guards visuais nos botões de emissão do painel do revendedor
5. Checagem 503 nas edge functions de emissão
6. Card de controle no painel do gerente (com log em `admin_audit_logs`)

## Fora do escopo

- Pausar manutenções específicas (licenças/recargas) — continuam existindo em paralelo
- Agendamento futuro ("ligar às 22h") — pode virar v2
- Mensagens diferentes por canal — mensagem única

Confirma o escopo e eu implemento?
