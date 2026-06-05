I will update the WhatsApp notification templates as requested, specifically changing the Pack message header and removing the Pack name to focus on the remaining license count.

### 1. Update Notification Templates
*   Modify the "Venda via Pack" message:
    *   Change header to "📦 **Licença do Pack Vendida!**".
    *   Remove the "Pack: {pack_nome}" line.
    *   Ensure focus is on "Licenças restantes" and "Saldo".
*   Keep the other templates (Manual/API/Loja) as previously agreed.

### 2. Implementation Strategy
*   Update the `system-whatsapp-notify` Edge Function (or the caller logic in `place-reseller-order` and `misticpay-webhook`) to reflect these new templates.
*   The logic will determine which template to use based on the `sale_type`.

### Proposed Message for Pack Sale:

> 📦 **Licença do Pack Vendida!**
> 
> *   **Pedido:** #{pedido_id}
> *   **Cliente:** {cliente_nome} ({cliente_whatsapp})
> *   **Canal:** {canal}
> 
> 🔑 **Licença:** `{licenca}`
> 
> 📉 **Restantes no Pack:** {licencas_restantes}
> 💰 **Saldo no Painel:** R$ {saldo_atual}
> 
> {aviso_saldo}

### Technical Details
*   **Files involved:** 
    *   `supabase/functions/place-reseller-order/index.ts` (Logic for Manual/API/Pack sales).
    *   `supabase/functions/misticpay-webhook/index.ts` (Logic for Store sales).
    *   `supabase/functions/system-whatsapp-notify/index.ts` (The central notification utility).

I will now read the relevant files to prepare the implementation.
