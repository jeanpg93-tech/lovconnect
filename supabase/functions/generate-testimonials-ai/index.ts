// deno-lint-ignore-file no-explicit-any
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const storeName: string = body?.storeName || "nossa loja";

    const systemPrompt =
      "Você gera depoimentos curtos, autênticos e variados de clientes brasileiros satisfeitos para uma loja online de licenças/recargas. " +
      "Retorne SEMPRE em JSON válido seguindo exatamente o schema solicitado. Sem markdown.";

    const userPrompt =
      `Gere 3 depoimentos para a loja "${storeName}". Cada depoimento deve ter:\n` +
      `- name: nome completo brasileiro realista (variar gênero e estilo)\n` +
      `- message: frase curta (max 140 caracteres) elogiando atendimento, entrega rápida, preço ou suporte. Tom natural, sem clichês. Sem emojis.\n` +
      `Não repita nomes. Não use aspas dentro da mensagem.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_testimonials",
              description: "Submete 3 depoimentos gerados",
              parameters: {
                type: "object",
                properties: {
                  testimonials: {
                    type: "array",
                    minItems: 3,
                    maxItems: 3,
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        message: { type: "string" },
                      },
                      required: ["name", "message"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["testimonials"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_testimonials" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      const status = resp.status === 429 ? 429 : resp.status === 402 ? 402 : 500;
      return new Response(JSON.stringify({ error: "Falha no gateway de IA", detail: t }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data: any = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : null;
    const items: Array<{ name: string; message: string }> = args?.testimonials ?? [];

    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "Resposta inválida da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ testimonials: items.slice(0, 3) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
