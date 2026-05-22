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

  const cmd = text.split(/\s+/)[0].toLowerCase()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  if (cmd === '/help' || cmd === '/start') {
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text:
      '<b>Comandos disponíveis:</b>\n' +
      '/saldo — saldo total dos revendedores\n' +
      '/vendas — vendas pagas hoje\n' +
      '/recargas — recargas hoje\n' +
      '/pendentes — cadastros aguardando aprovação\n' +
      '/help — esta mensagem'
    })
  } else if (cmd === '/saldo') {
    const { data } = await supabase.from('reseller_balances').select('balance_cents')
    const total = (data ?? []).reduce((s, r: any) => s + (r.balance_cents || 0), 0)
    await tg('sendMessage', { chat_id: chatId, parse_mode: 'HTML',
      text: `💼 <b>Saldo total dos revendedores</b>\n${brl(total)}\n(${(data ?? []).length} revendedores)` })
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
  } else {
    await tg('sendMessage', { chat_id: chatId, text: 'Comando não reconhecido. Use /help.' })
  }

  return new Response(JSON.stringify({ ok: true }))
})