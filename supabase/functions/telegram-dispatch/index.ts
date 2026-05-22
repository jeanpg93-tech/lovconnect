import { createClient } from 'npm:@supabase/supabase-js@2'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram'

Deno.serve(async () => {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY')
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    return new Response(JSON.stringify({ error: 'missing keys' }), { status: 500 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: settings } = await supabase.from('telegram_settings').select('chat_id').eq('id', 1).maybeSingle()
  if (!settings?.chat_id) {
    return new Response(JSON.stringify({ skipped: 'not paired' }))
  }

  const { data: pending } = await supabase
    .from('telegram_outbox').select('*')
    .is('sent_at', null).lt('attempts', 5)
    .order('created_at', { ascending: true }).limit(20)

  let sent = 0, failed = 0
  for (const msg of pending ?? []) {
    try {
      const r = await fetch(`${GATEWAY_URL}/sendMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'X-Connection-Api-Key': TELEGRAM_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: settings.chat_id,
          text: msg.text,
          parse_mode: msg.parse_mode ?? 'HTML',
          disable_web_page_preview: true,
        }),
      })
      const body = await r.json()
      if (r.ok && body.ok) {
        await supabase.from('telegram_outbox')
          .update({ sent_at: new Date().toISOString(), attempts: msg.attempts + 1 })
          .eq('id', msg.id)
        sent++
      } else {
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

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})