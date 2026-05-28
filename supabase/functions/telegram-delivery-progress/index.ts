// Live Telegram delivery progress notifier para recargas de créditos Lovable.
// Envia UMA mensagem por pedido e edita conforme o status muda.
// Acionado pelo trigger trg_telegram_delivery_progress_recharge.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

const fmtBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);

function shortId(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

async function tg(method: string, body: any, lovableKey: string, telegramKey: string) {
  const r = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

const STAGE: Record<string, string> = {
  aguardando: "🟡 Aguardando bot",
  processando: "🛠️ Processando",
  pendente: "🟡 Pendente",
  configurando: "📧 Aguardando cliente vincular bot ao workspace",
  recarregando: "⚡ Recarregando créditos",
  entregando: "⚡ Entregando",
  sucesso: "✅ Entregue",
  cancelado: "🚫 Cancelado",
  falha: "❌ Falha na entrega",
  erro: "❌ Erro na entrega",
  manual_pendente: "🟡 Manual — aguardando admin",
  manual_iniciado: "🛠️ Manual — iniciado",
  manual_aceito: "🛠️ Manual — aceito",
  manual_processando: "⚡ Manual — processando",
  manual_confirmado: "✅ Manual — confirmado",
  manual_entregue: "✅ Manual — entregue",
};

function buildMessage(opts: { p: any; reseller: any }) {
  const { p, reseller } = opts;
  const done = p.status === "sucesso" || p.status === "manual_entregue" || p.status === "manual_confirmado";
  const failed = p.status === "falha" || p.status === "erro" || p.status === "cancelado";
  const icon = done ? "✅" : failed ? "❌" : "🟡";
  const stage = STAGE[p.status] ?? `⚙️ ${p.status}`;

  const lines: string[] = [];
  lines.push(`${icon} <b>#REC-${shortId(p.id)}</b> • CRÉDITOS LOVABLE`);
  lines.push(`👨‍💼 Revendedor: <b>${reseller?.display_name ?? "—"}</b>`);
  if (p.customer_name || p.customer_whatsapp) {
    lines.push(`👤 Cliente: ${p.customer_name ?? "—"}${p.customer_whatsapp ? ` (${p.customer_whatsapp})` : ""}`);
  }
  lines.push(`📦 ${p.credits} créditos • ${fmtBRL(Number(p.price_cents || 0))}`);
  if (p.tipo_entrega) lines.push(`🚚 Entrega: ${p.tipo_entrega}`);
  if (p.email_conta_lovable) lines.push(`✉️ Conta: <code>${p.email_conta_lovable}</code>`);
  if (p.workspace_name) lines.push(`🗂️ Workspace: <b>${p.workspace_name}</b>`);
  if (p.provider_pedido_id) {
    lines.push(`🌐 Link do cliente: https://pedido.lvbcredits.com/${p.provider_pedido_id}`);
  }
  lines.push("");
  lines.push(stage);

  if (p.status === "configurando") {
    lines.push(`<i>Aguardando o cliente convidar o bot no workspace dele. Os créditos serão entregues automaticamente assim que ele finalizar a configuração.</i>`);
  }

  if (failed && p.error_message) {
    lines.push(`⚠️ <i>${String(p.error_message).slice(0, 240)}</i>`);
  }

  if (p.cancellation_status && p.cancellation_status !== "none") {
    lines.push(`↩️ Cancelamento: ${p.cancellation_status}`);
  }

  if (done && p.created_at && p.updated_at) {
    const elapsed = Math.max(0, new Date(p.updated_at).getTime() - new Date(p.created_at).getTime());
    const m = Math.floor(elapsed / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    lines.push(`🎉 Concluído em ${m}m ${s.toString().padStart(2, "0")}s`);
  }

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) throw new Error("Telegram não configurado");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { purchaseId } = body as { purchaseId: string };
    if (!purchaseId) throw new Error("purchaseId obrigatório");

    const { data: settings } = await admin
      .from("telegram_settings")
      .select("chat_id, notify_delivery_progress")
      .eq("id", 1)
      .maybeSingle();

    // Sempre usa o chat configurado no painel. Nenhum chat-id vindo do
    // request é aceito — evita redirecionamento de PII para chats arbitrários.
    const chatId = settings?.chat_id ? String(settings.chat_id) : null;
    if (!chatId) {
      return new Response(JSON.stringify({ skipped: "no chat" }), { status: 200, headers: corsHeaders });
    }
    if (settings && settings.notify_delivery_progress === false) {
      return new Response(JSON.stringify({ skipped: "disabled" }), { status: 200, headers: corsHeaders });
    }

    const { data: p } = await admin
      .from("reseller_credit_purchases")
      .select("*")
      .eq("id", purchaseId)
      .maybeSingle();
    if (!p) throw new Error("Pedido não encontrado");

    const { data: reseller } = await admin
      .from("resellers")
      .select("display_name")
      .eq("id", p.reseller_id)
      .maybeSingle();

    const text = buildMessage({ p, reseller });
    let messageId: number | null = p.telegram_message_id ?? null;
    const lastState: string | null = p.telegram_last_state ?? null;

    if (lastState === text) {
      return new Response(JSON.stringify({ skipped: "no change" }), { status: 200, headers: corsHeaders });
    }

    let result;
    if (messageId) {
      result = await tg("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      if (!result.ok) {
        const desc = String(result.data?.description ?? "");
        if (!/message is not modified/i.test(desc)) {
          result = await tg("sendMessage", {
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          if (result.ok) messageId = result.data?.result?.message_id ?? messageId;
        }
      }
    } else {
      result = await tg("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      if (result.ok) messageId = result.data?.result?.message_id ?? null;
    }

    await admin
      .from("reseller_credit_purchases")
      .update({ telegram_message_id: messageId, telegram_last_state: text })
      .eq("id", purchaseId);

    return new Response(JSON.stringify({ ok: true, messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("telegram-delivery-progress error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});