# Plano — Exportação segura das API Keys Claude

## Objetivo
Criar uma única edge function `claude-export-keys` que permita ao **gerente** exportar as licenças de `claude_orders` para outro projeto Supabase, com as `provider_api_key` **criptografadas** por RSA-OAEP usando a chave pública do projeto de destino. Nada em texto simples sai do backend.

## Fluxo

```
Gerente (painel)
   │  invoca claude-export-keys  (Authorization: Bearer <JWT>)
   │  body: { public_key_pem, confirm_token }
   ▼
Edge Function (verify_jwt padrão + checagem has_role('gerente'))
   │  1. Valida JWT + role gerente
   │  2. Valida one-shot token em claude_export_tokens (usado=false, não expirado)
   │  3. Importa chave pública RSA-OAEP (SPKI PEM)
   │  4. Gera AES-GCM 256 por linha, cifra provider_api_key
   │     e envelopa a chave AES com RSA-OAEP-SHA256
   │  5. Marca token como usado (single-use) + grava auditoria
   │  6. Retorna JSON com envelopes cifrados
   ▼
Frontend
   │  faz download do JSON e entrega ao projeto destino
```

Nenhum log imprime chave, envelope, IV, token ou PEM. Erros retornam apenas códigos genéricos.

## Componentes

### 1. Tabelas novas (migration)

- `claude_export_tokens` — token único de confirmação
  - `token_hash` (sha256 do token, nunca o token em claro)
  - `created_by` (uuid do gerente)
  - `expires_at` (default now() + 15 min)
  - `used_at`, `used_by`
  - RLS: apenas gerente vê seus próprios; INSERT/UPDATE só via edge function (service_role)

- `claude_export_audit` — auditoria sem segredos
  - `operation_id` (uuid)
  - `manager_id`, `manager_email`
  - `licenses_exported` (int)
  - `public_key_fingerprint` (sha256 do SPKI)
  - `created_at`
  - RLS: SELECT para gerente

Ambas com GRANTs (`authenticated` SELECT quando aplicável, `service_role` ALL).

### 2. Edge function `claude-export-keys` (nova)

- `verify_jwt = true` (padrão)
- Passos:
  1. `getClaims(token)` → `user_id`
  2. `has_role(user_id, 'gerente')` via SQL — se falso, 403 genérico
  3. Body validado com Zod: `public_key_pem` (string PEM SPKI), `confirm_token` (string)
  4. Verifica `claude_export_tokens` por `token_hash`, não usado, não expirado → marca usado (transação)
  5. `crypto.subtle.importKey('spki', der, {name:'RSA-OAEP', hash:'SHA-256'}, false, ['encrypt'])`
  6. Para cada linha (select em lotes): AES-GCM 256 aleatório + IV, cifra `provider_api_key`, envelopa a chave AES com RSA-OAEP
  7. Grava auditoria (sem chaves, sem envelopes)
  8. Retorna:
     ```json
     {
       "operation_id": "...",
       "algo": { "wrap": "RSA-OAEP-SHA256", "data": "AES-GCM-256" },
       "public_key_fingerprint": "sha256:...",
       "count": N,
       "items": [
         { "id","code","provider_key_id","provider_user_id",
           "customer_email","reseller_id","status",
           "encrypted_key": { "iv","ciphertext","wrapped_key" } }
       ]
     }
     ```

### 3. Edge function auxiliar `claude-export-token-issue` (nova)

- Gerente clica "Gerar token de exportação" → devolve o token em claro **uma vez** (não é secret, é nonce curto). Armazena apenas o hash.
- Sem esta função o gerente não conseguiria obter o `confirm_token` de forma segura.

### 4. Frontend — `GerenteClaudeExportar.tsx` (nova página)

- Rota `/painel/gerente/claude-exportar` (protegida por `RoleRoute gerente`).
- UI:
  1. Botão "Gerar token" → chama `claude-export-token-issue` e mostra o token uma vez.
  2. Textarea para colar a **chave pública RSA (PEM SPKI)** do projeto destino.
  3. Botão "Exportar" → chama `claude-export-keys` e faz download de `claude-export-<operation_id>.json`.
- Nunca guarda o token/pacote no `localStorage`, nunca faz `console.log` do conteúdo.
- Link no `AppSidebar` (grupo gerente).

### 5. Documentação no `MIGRATION.md`

Adicionar seção "Migração das API Keys Claude" explicando:
- Como gerar par RSA-OAEP no projeto destino (openssl)
- Passo a passo do gerente
- Como o destino desembrulha (AES-GCM + RSA-OAEP)

## Secrets necessários

**Nenhum secret novo.** A função usa:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (já disponíveis no runtime da edge function — service_role fica só no backend, jamais vai ao frontend).

A chave pública RSA vem no request body (não é secret — é pública). A chave privada correspondente fica **apenas no projeto de destino**; nós nunca a vemos.

## Garantias de segurança

- `provider_api_key` nunca é retornada em claro.
- Token de confirmação é single-use e expira em 15 min; armazenado como hash.
- `service_role` usado apenas dentro da edge function.
- Sem `console.log` de qualquer valor sensível; erros são mensagens genéricas.
- Auditoria registra só metadados (gerente, hora, quantidade, fingerprint da chave pública, operation_id).
- Zero mutação em `claude_orders`; nenhuma chave é revogada ou regenerada.
- Endpoint exige JWT válido + role gerente + token single-use → não é endpoint público nem permanente.

Confirma para eu implementar?
