import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram'

function stripTelegramHtml(text: string) {
  return String(text ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(b|strong|i|em|u|s|strike|del|code|pre)[^>]*>/gi, '')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

Deno.serve(async (req) => {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY')
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    return new Response(JSON.stringify({ error: 'missing keys' }), { status: 500 })
  }

  // Cron-triggered utility. No user input; only sends preformatted outbox messages
  // to the single configured admin chat_id. Safe to expose to cron with anon apikey.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: settings } = await supabase.from('telegram_settings').select('chat_id').eq('id', 1).maybeSingle()
  if (!settings?.chat_id) {
    return new Response(JSON.stringify({ skipped: 'not paired' }))
  }

  const { data: pending, error: pendingErr } = await supabase
    .rpc('claim_telegram_outbox', { _limit: 50 })

  if (pendingErr) {
    console.error('[telegram-dispatch] failed to fetch pending', pendingErr)
    return new Response(JSON.stringify({ error: 'fetch_failed', details: pendingErr.message }), { status: 500 })
  }

  const pendingCount = pending?.length ?? 0
  if (pendingCount > 0) {
    console.log(`[telegram-dispatch] processing ${pendingCount} pending message(s)`)
  }

  let sent = 0, failed = 0
  for (const msg of pending ?? []) {
    try {
      const isEdit = msg.is_edit === true && msg.edit_message_id
      const method = isEdit ? 'editMessageText' : 'sendMessage'
      const payload: Record<string, unknown> = {
        chat_id: settings.chat_id,
        text: msg.text,
        parse_mode: msg.parse_mode ?? 'HTML',
        disable_web_page_preview: true,
      }
      if (isEdit) payload.message_id = msg.edit_message_id

      const r = await fetch(`${GATEWAY_URL}/${method}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TELEGRAM_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      const rawBody = await r.text()
      let body: any = {}
      try {
        body = rawBody ? JSON.parse(rawBody) : {}
      } catch (_) {
        body = { description: rawBody || `HTTP ${r.status}` }
      }
      const desc = String(body?.description ?? '')
      // "message is not modified" é sucesso silencioso em edits
      const notModified = isEdit && /message is not modified/i.test(desc)
      if ((r.ok && body.ok) || notModified) {
        const returnedMid = body?.result?.message_id ?? msg.edit_message_id ?? null
        await supabase.from('telegram_outbox')
          .update({
            sent_at: new Date().toISOString(),
            attempts: msg.attempts + 1,
            message_id: returnedMid,
            last_error: null,
          })
          .eq('id', msg.id)
        sent++
      } else {
        const shouldRetryPlainText = /parse entities|can't parse|unsupported start tag|bad request/i.test(desc)
        if (shouldRetryPlainText) {
          const retry = await fetch(`${GATEWAY_URL}/sendMessage`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              'X-Connection-Api-Key': TELEGRAM_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: settings.chat_id,
              text: stripTelegramHtml(msg.text),
              disable_web_page_preview: true,
            }),
          })
          const retryBody = await retry.json().catch(() => ({}))
          if (retry.ok && retryBody?.ok) {
            await supabase.from('telegram_outbox')
              .update({
                sent_at: new Date().toISOString(),
                attempts: msg.attempts + 1,
                message_id: retryBody?.result?.message_id ?? null,
                last_error: null,
              })
              .eq('id', msg.id)
            sent++
            continue
          }
        }
        await supabase.from('telegram_outbox')
          .update({ attempts: msg.attempts + 1, last_error: JSON.stringify(body).slice(0, 500) })
          .eq('id', msg.id)
        failed++
      }
    } catch (e) {
      await supabase.from('telegram_outbox')
        .update({ attempts: msg.attempts + 1, last_error: String(e).slice(0, 500) })
        .eq('id', msg.id)
      failed++
    }
  }

  if (sent > 0 || failed > 0) {
    console.log(`[telegram-dispatch] done sent=${sent} failed=${failed} fetched=${pendingCount}`)
  }

  return new Response(JSON.stringify({ sent, failed, fetched: pendingCount }), {
    headers: { 'Content-Type': 'application/json' },
  })
})