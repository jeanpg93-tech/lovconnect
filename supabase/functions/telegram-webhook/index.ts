import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram'

async function deriveSecret(key: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${key}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function safeEq(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

async function tg(method: string, body: any) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY')!
  const r = await fetch(`${GATEWAY_URL}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TELEGRAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  return r.json()
}

function brl(cents: number) {
  return `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function gatherPanelContext(supabase: any) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()
  const [prov, gw, vendas, recargas, pendentes, resellers] = await Promise.all([
    fetchProviderBalanceCents(supabase),
    fetchGatewayBalanceCents(supabase),
    supabase.from('balance_transactions').select('amount_cents').eq('kind', 'order_debit').gte('created_at', todayIso),
    supabase.from('balance_transactions').select('amount_cents').eq('kind', 'deposit').gte('created_at', todayIso),
    supabase.from('profiles').select('display_name,email').eq('approval_status', 'pending'),
    supabase.from('resellers').select('id', { count: 'exact', head: true }),
  ])
  const vTotal = (vendas.data ?? []).reduce((s: number, r: any) => s + Math.abs(r.amount_cents || 0), 0)
  const rTotal = (recargas.data ?? []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0)
  return {
    saldo_lojinha: prov != null ? brl(prov) : 'indisponível',
    saldo_misticpay: gw != null ? brl(gw) : 'indisponível',
    vendas_hoje_qtd: (vendas.data ?? []).length,
    vendas_hoje_total: brl(vTotal),
    recargas_hoje_qtd: (recargas.data ?? []).length,
    recargas_hoje_total: brl(rTotal),
    cadastros_pendentes: (pendentes.data ?? []).length,
    pendentes_lista: (pendentes.data ?? []).slice(0, 10).map((p: any) => `${p.display_name ?? '—'} (${p.email})`),
    total_revendedores: resellers.count ?? 0,
    data_hora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  }
}

async function askAI(userText: string, context: any): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  if (!LOVABLE_API_KEY) return 'IA não configurada.'
  const system = `Você é o assistente pessoal do gerente do painel LovConnect, conversando pelo Telegram.

PERSONALIDADE:
- Fale como um sócio/braço-direito do gerente: humano, descontraído, espontâneo, com humor leve quando couber.
- Português brasileiro natural, gírias suaves ok ("beleza", "bora", "tranquilo"). Nada de tom corporativo.
- Pode usar emojis com naturalidade, sem exagero.
- Se o gerente só quiser papo (oi, tudo bem, piada, opinião, desabafo), responda como um humano responderia. Não force assunto de painel.

SOBRE OS DADOS DO PAINEL:
- Você tem acesso a um snapshot atual com saldos, vendas e recargas do dia, cadastros pendentes e total de revendedores.
- Use esses dados QUANDO a pergunta tiver a ver com o negócio. Não fique citando número à toa.
- Nomenclatura: "saldo_lojinha" = saldo da LOJINHA (provedor de créditos/licenças). "saldo_misticpay" = saldo da MisticPay (gateway PIX). Sempre chame de "Lojinha" e "MisticPay".
- Se pedirem algo do negócio que NÃO está no snapshot, diga numa boa que não tem aquele dado em mãos e sugira o comando certo (/saldo, /vendas, /recargas, /pendentes).
- Se a pergunta NÃO for sobre o painel, ignore o snapshot e só converse normalmente.

FORMATO:
- Telegram aceita HTML simples: <b>, <i>, <code>. NUNCA use markdown (* _ #).
- Tamanho livre: curto pra conversa, mais detalhado quando o gerente pedir análise.
- Não invente dados que não estão no snapshot.

SNAPSHOT ATUAL DO PAINEL (use só se for relevante):
${JSON.stringify(context, null, 2)}`
  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
      }),
    })
    if (r.status === 429) return '⏳ Muitas mensagens. Tente de novo em alguns segundos.'
    if (r.status === 402) return '💳 Créditos da IA esgotados. Adicione saldo em Settings → Workspace → Usage.'
    if (!r.ok) return `Erro IA (${r.status}).`
    const d = await r.json()
    return d?.choices?.[0]?.message?.content?.trim() || 'Sem resposta.'
  } catch (e: any) {
    return `Erro ao consultar IA: ${e?.message ?? e}`
  }
}

const PROVIDER_BASE = 'https://lojinhalovable.com/api/v1/revenda'
const MISTIC_BASE = 'https://api.misticpay.com/api'

async function fetchProviderBalanceCents(client: any): Promise<number | null> {
  try {
    const { data: master } = await client
      .from('app_settings').select('value').eq('key', 'lovable_credits_master').maybeSingle()
    const apiKey: string | undefined = master?.value?.api_key
    if (!apiKey) return null
    const r = await fetch(`${PROVIDER_BASE}/saldo`, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    })
    if (!r.ok) return null
    const d = await r.json()
    const reais = d?.data?.saldoReais ?? d?.saldoReais
    const cents = d?.data?.saldoCentavos ?? d?.saldoCentavos
    if (cents != null) return Math.round(Number(cents))
    if (reais != null) return Math.round(Number(reais) * 100)
    return null
  } catch { return null }
}

async function fetchGatewayBalanceCents(client: any): Promise<number | null> {
  try {
    const { data: keys } = await client
      .from('app_settings').select('key, value')
      .in('key', ['misticpay_client_id', 'misticpay_client_secret'])
    const ci = keys?.find((k: any) => k.key === 'misticpay_client_id')?.value
      ?? Deno.env.get('MISTICPAY_CLIENT_ID')
    const cs = keys?.find((k: any) => k.key === 'misticpay_client_secret')?.value
      ?? Deno.env.get('MISTICPAY_CLIENT_SECRET')
    if (!ci || !cs) return null
    for (const p of ['/users/balance', '/users/info']) {
      const r = await fetch(`${MISTIC_BASE}${p}`, {
        headers: { ci, cs, 'Content-Type': 'application/json' },
      })
      if (!r.ok) continue
      const d = await r.json()
      const bal = d?.data?.balance ?? d?.data?.availableBalance ?? d?.balance
      if (bal != null) return Math.round(Number(bal) * 100)
    }
    return null
  } catch { return null }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok')

  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY')
  if (!TELEGRAM_API_KEY) return new Response('no key', { status: 500 })

  const expected = await deriveSecret(TELEGRAM_API_KEY)
  if (!safeEq(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), expected)) {
    return new Response('unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const update = await req.json().catch(() => null)
  const message = update?.message ?? update?.edited_message
  const chatId = message?.chat?.id as number | undefined
  const text = (message?.text ?? '').trim() as string
  if (!chatId || !text) return new Response(JSON.stringify({ ok: true }))

  const { data: settings } = await supabase.from('telegram_settings').select('*').eq('id', 1).maybeSingle()

  // /start <code> — pareamento
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/)
    const code = parts[1]?.trim()
    if (!code) {
      await tg('sendMessage', { chat_id: chatId, text: 'Para parear, gere um código no painel do gerente e envie:\n<code>/start CODIGO</code>', parse_mode: 'HTML' })
      return new Response(JSON.stringify({ ok: true }))
    }
    if (
      !settings?.pairing_code ||
      settings.pairing_code !== code ||
      !settings.pairing_expires_at ||
      new Date(settings.pairing_expires_at) < new Date()
    ) {
      await tg('sendMessage', { chat_id: chatId, text: '❌ Código inválido ou expirado.' })
      return new Response(JSON.stringify({ ok: true }))
    }
    await supabase.from('telegram_settings').update({
      chat_id: chatId,
      paired_at: new Date().toISOString(),
      pairing_code: null,
      pairing_expires_at: null,
    }).eq('id', 1)
    await tg('sendMessage', { chat_id: chatId, text: '✅ <b>Bot pareado com sucesso!</b>\n\nUse /help para ver os comandos.', parse_mode: 'HTML' })
    return new Response(JSON.stringify({ ok: true }))
  }

  // Demais comandos só para chat pareado
  if (!settings?.chat_id || String(settings.chat_id) !== String(chatId)) {
    await tg('sendMessage', { chat_id: chatId, text: '🔒 Este chat não está pareado. Gere um código no painel e envie /start CODIGO.' })
    return new Response(JSON.stringify({ ok: true }))
  }

  const parts = text.split(/\s+/)
  const cmd = parts[0].toLowerCase()
  const sub = (parts[1] ?? '').toLowerCase()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  if (cmd === '/help' || cmd === '/start') {
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text:
      '<b>Comandos disponíveis:</b>\n' +
      '/saldo — saldos da Lojinha e da MisticPay\n' +
      '/saldo_revendedores — saldos dos revendedores\n' +
      '/vendas — vendas pagas hoje\n' +
      '/recargas — recargas hoje\n' +
      '/pendentes — cadastros aguardando aprovação\n' +
      '/help — esta mensagem'
    })
  } else if (
    cmd === '/saldo_revendedores' ||
    cmd === '/saldorevendedores' ||
    (cmd === '/saldo' && (sub === 'revendedores' || sub === 'revendedor' || sub === 'resellers'))
  ) {
    const { data: balances } = await supabase
      .from('reseller_balances')
      .select('balance_cents, reseller:resellers(display_name, is_active)')
      .order('balance_cents', { ascending: false })
    const rows = (balances ?? [])
      .map((b: any) => ({
        name: b.reseller?.display_name ?? '—',
        active: b.reseller?.is_active !== false,
        cents: Number(b.balance_cents ?? 0),
      }))
      .filter((b) => b.cents > 0)
    const total = rows.reduce((s, r) => s + r.cents, 0)
    if (!rows.length) {
      await tg('sendMessage', { chat_id: chatId, text: '💼 Nenhum revendedor com saldo positivo.' })
    } else {
      const top = rows.slice(0, 30)
      const lines = top
        .map((r, i) => `${String(i + 1).padStart(2, ' ')}. ${r.active ? '' : '⏸ '}${r.name} — <b>${brl(r.cents)}</b>`)
        .join('\n')
      const extra = rows.length > top.length ? `\n…e mais ${rows.length - top.length} revendedor(es)` : ''
      await tg('sendMessage', {
        chat_id: chatId, parse_mode: 'HTML',
        text: `💼 <b>Saldos dos revendedores (${rows.length})</b>\n${lines}${extra}\n\n💰 Total: <b>${brl(total)}</b>`,
      })
    }
  } else if (cmd === '/saldo') {
    const [prov, gw] = await Promise.all([
      fetchProviderBalanceCents(supabase),
      fetchGatewayBalanceCents(supabase),
    ])
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
      text:
        `💼 <b>Saldos do painel</b>\n\n` +
        `🏪 Lojinha: <b>${prov != null ? brl(prov) : 'indisponível'}</b>\n` +
        `💳 MisticPay (Gateway PIX): <b>${gw != null ? brl(gw) : 'indisponível'}</b>\n\n` +
        `<i>Dica: use</i> <code>/saldo revendedores</code> <i>para ver os saldos dos revendedores.</i>`
    })
  } else if (cmd === '/vendas') {
    const { data } = await supabase.from('balance_transactions')
      .select('amount_cents').eq('kind', 'order_debit').gte('created_at', todayIso)
    const total = (data ?? []).reduce((s, r: any) => s + Math.abs(r.amount_cents || 0), 0)
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
      text: `🛒 <b>Vendas hoje</b>\nQuantidade: ${(data ?? []).length}\nTotal: ${brl(total)}` })
  } else if (cmd === '/recargas') {
    const { data } = await supabase.from('balance_transactions')
      .select('amount_cents').eq('kind', 'deposit').gte('created_at', todayIso)
    const total = (data ?? []).reduce((s, r: any) => s + (r.amount_cents || 0), 0)
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
      text: `💰 <b>Recargas hoje</b>\nQuantidade: ${(data ?? []).length}\nTotal: ${brl(total)}` })
  } else if (cmd === '/pendentes') {
    const { data } = await supabase.from('profiles').select('display_name,email').eq('approval_status', 'pending')
    if (!data?.length) {
      await tg('sendMessage', { chat_id: chatId, text: '✅ Nenhum cadastro pendente.' })
    } else {
      const lines = data.slice(0, 20).map((p: any) => `• ${p.display_name ?? '—'} (${p.email})`).join('\n')
      await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
        text: `🆕 <b>Cadastros pendentes (${data.length})</b>\n${lines}` })
    }
  } else if (cmd.startsWith('/')) {
    await tg('sendMessage', { chat_id: chatId, text: 'Comando não reconhecido. Use /help.' })
  } else {
    // Conversa livre — IA com contexto do painel
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
    const ctx = await gatherPanelContext(supabase)
    const reply = await askAI(text, ctx)
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: reply })
  }

  return new Response(JSON.stringify({ ok: true }))
})