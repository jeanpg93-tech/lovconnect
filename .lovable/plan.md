## Exportar lista completa de chaves Flow

Gerar um arquivo CSV em `/mnt/documents/chaves_flow.csv` contendo as **683 ordens** com método Flow encontradas no banco (período: 02/05/2026 a 09/06/2026 BRT).

### Colunas do CSV
- `criado_brt` — data/hora da criação (America/Sao_Paulo)
- `order_id`
- `revendedor` — nome do revendedor (`resellers.display_name`)
- `license_type` — ex.: flow_7d, flow_pro_30d, flow_trial, flow_lifetime…
- `license_key` — a chave gerada (vazia quando o pedido falhou antes da geração)
- `status` — completed / failed / pending
- `is_test` — true para chaves teste
- `price_cents`
- `cliente` / `cliente_whatsapp`

### Filtro aplicado
`license_type LIKE 'flow%' OR notes LIKE '%"method":"flow"%'` — pega tanto pedidos cujo tipo já carrega o prefixo flow quanto trials antigos cujo método foi registrado nas `notes`.

### Resumo do que será exportado
| license_type   | total | com chave | concluídos |
|----------------|------:|----------:|-----------:|
| flow_7d        |   147 |       101 |         96 |
| flow_1d        |   104 |        77 |         69 |
| flow_pro_7d    |    98 |        96 |         91 |
| flow_trial     |    98 |        98 |         98 |
| trial (Flow)   |    91 |        91 |         91 |
| flow_pro_1d    |    58 |        58 |         54 |
| flow_lifetime  |    45 |        45 |         42 |
| flow_30d       |    22 |        22 |         22 |
| flow_pro_30d   |    16 |        16 |         14 |
| flow_pro_15d   |     4 |         4 |          4 |
| **Total**      | **683** | **608** | **581** |

### Entrega
Após gerar o arquivo, será apresentado um bloco de download (`presentation-artifact`) com o CSV para você baixar.
