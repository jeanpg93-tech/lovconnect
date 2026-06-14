import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Rocket, Lightbulb, ListChecks, Sparkles } from "lucide-react";
import { toast } from "sonner";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const DOWNLOAD_URL = `https://${PROJECT_ID}.supabase.co/functions/v1/public-extension-download`;

function buildPrompt(downloadUrl: string) {
  return `# 🧩 Implantar download de Extensões (LovMain) no meu site/painel

Você é um engenheiro sênior. Implemente a integração abaixo no projeto **sem remover, renomear ou quebrar nenhuma rota, página, tabela, função ou componente existente**. Apenas **adicione** o que for necessário. Mantenha o estilo visual atual (design tokens, sidebar, layout).

## 🧰 Stack alvo
Este prompt assume um projeto padrão **React + Vite + TypeScript + Tailwind + shadcn/ui** no frontend e **Edge Functions (Deno/Supabase)** no backend. Se o projeto usar outra stack (Next.js, Nuxt, Laravel, Node/Express, etc.), **adapte os caminhos e o runtime do proxy** mantendo a mesma arquitetura (frontend → proxy backend → API do provedor).

## ⚠️ Regra de ouro — fonte única da verdade
**O arquivo .zip da extensão, o nome real, a versão e o tamanho DEVEM vir SEMPRE da API do fornecedor.** É proibido:
- Hospedar o .zip da extensão no próprio servidor/CDN da loja.
- Hardcodar versão, tamanho ou link de download — sempre chamar \`GET ?slug=<slug>\` no momento do clique.
- Armazenar ou reutilizar o \`download_url\` retornado (ele é assinado e expira em ~10 min).
- Inventar metadados (changelog, descrição definitiva) sem buscar do fornecedor.

A loja é apenas uma **vitrine + disparador de download**. Toda atualização de versão é automática porque vem do fornecedor.

## 🎯 Objetivo
Permitir que o site/painel do cliente:
1. Liste as extensões disponíveis do provedor (nome, versão, descrição, changelog, tamanho).
2. Ofereça um botão "Baixar" que gera um link assinado e inicia o download do .zip.
3. (Opcional) Exiba o histórico de versões/changelog de cada extensão.

## 🔑 Endpoint
- **Base URL (download):** \`${downloadUrl}\`
- **Autenticação:** **pública** (sem chave). O endpoint devolve uma **URL assinada de curta duração (~10 min)** que aponta direto para o arquivo .zip.
- **Identificação da extensão:** pelo \`slug\` (informado pelo provedor para cada extensão liberada).

## 📚 Como chamar

### GET \`${downloadUrl}?slug=<SLUG>\`
Resposta 200:
\`\`\`json
{
  "name": "Minha Extensão",
  "version": "1.4.2",
  "file_size": 184320,
  "download_url": "https://.../signed-url.zip",
  "expires_in": 600
}
\`\`\`
Erros: \`400\` slug ausente · \`404\` extensão não encontrada / inativa · \`500\` falha ao assinar.

> Use o \`download_url\` retornado para iniciar o download (\`window.location.href = download_url\` ou tag \`<a download>\`). **Não armazene** essa URL — ela expira.

## 🧱 O que adicionar no projeto (sem remover nada do que já existe)

### 1. Backend (proxy opcional, recomendado)
Crie a edge function **\`lovmain-extensions-proxy\`** (em projetos com Supabase: \`supabase/functions/lovmain-extensions-proxy/index.ts\`) que:
- Aceite \`GET /download?slug=<slug>\` e encaminhe para \`${downloadUrl}\`.
- Devolva o JSON do upstream com o mesmo \`status\` HTTP.
- Implemente **CORS** com \`Access-Control-Allow-Origin: *\` e responda \`OPTIONS\`.
- (Opcional) Faça cache curto (60s) da resposta para reduzir chamadas.

Como o endpoint é público, também é válido chamar direto do frontend — mas usar proxy facilita logging, cache e troca de provedor depois.

### 2. Cliente TypeScript tipado
Crie \`src/integrations/lovmain-extensions/client.ts\` com:
- \`getExtensionDownload(slug: string): Promise<{ name, version, file_size, download_url, expires_in }>\`
- \`downloadExtension(slug: string): Promise<void>\` — chama o anterior e dispara o download.

### 3. Catálogo de extensões (configuração local)
Como o provedor não expõe um endpoint de listagem pública, mantenha o catálogo de extensões liberadas para o cliente em uma **tabela do banco da loja** ou em um arquivo \`src/config/extensions.ts\`:
\`\`\`ts
export const EXTENSIONS = [
  { slug: "minha-ext", name: "Minha Extensão", description: "...", icon: "/icons/ext.png" },
];
\`\`\`
O \`name\`/\`version\` reais virão do endpoint no momento do download.

### 4. Página/Componente "Extensões"
- Crie a página (ex.: \`src/pages/Extensoes.tsx\`) e registre a rota no roteador **sem remover rotas existentes**.
- Renderize um card por extensão (do catálogo) com nome, descrição, ícone e botão **"Baixar agora"**.
- Ao clicar: chame \`downloadExtension(slug)\`, mostre loading no botão e toast de sucesso/erro.
- Use **tokens de design do projeto** (\`bg-primary\`, \`text-foreground\`, etc. — sem cores hardcoded).

### 5. Sidebar / Menu
Adicione um **novo item de menu** "Extensões" apontando para a página criada. ⚠️ **Não remover nem renomear** itens existentes.

### 6. Tratamento de erros
Toasts amigáveis para: \`404\` ("Extensão indisponível — contate o suporte"), \`500\` ("Falha ao preparar download, tente novamente"), erro de rede ("Sem conexão").

## ✅ Critérios de aceite
- Build passa sem erros e sem warnings novos.
- Todas as rotas e itens de menu **antigos continuam funcionando**.
- Cliente abre a página, vê as extensões e o botão "Baixar" inicia o download do .zip.
- O design segue os tokens do projeto (sem cores hardcoded).
- A edge function (se criada) tem CORS configurado e responde \`OPTIONS\`.

## 🧪 Pós-implementação
Me explique em 5 linhas como obtenho o **slug** de cada extensão liberada e como adiciono novas extensões ao catálogo local.
`;
}

export const DeployExtensionPrompt = () => {
  const prompt = useMemo(() => buildPrompt(DOWNLOAD_URL), []);
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Prompt copiado");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Como usar este prompt</h2>
        </div>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-5">
          <li>Anote os <strong>slugs</strong> das extensões liberadas para você (vistos na aba de extensões do seu painel).</li>
          <li>Abra o painel do <strong>cliente</strong> (Lovable, ChatGPT, Claude, Cursor, Base44, Codex etc.) e cole o prompt abaixo.</li>
          <li>Quando a IA pedir, forneça a lista de slugs e nomes amigáveis para o catálogo.</li>
          <li>Pronto — o site/painel do cliente terá uma página de Extensões com botão "Baixar".</li>
        </ol>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">O que o prompt vai criar</h2>
        </div>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Proxy opcional para o endpoint público</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Cliente TypeScript tipado</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Catálogo local de extensões</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Página "Extensões" com botão Baixar</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Item de menu novo (sem remover os existentes)</li>
          <li className="flex items-start gap-2"><Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" /> Tratamento de erros com toasts</li>
        </ul>
      </Card>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">Prompt de implantação — Extensões</h2>
          </div>
          <Button onClick={copyAll} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {copied ? <><Check className="mr-1.5 h-4 w-4" /> Copiado</> : <><Copy className="mr-1.5 h-4 w-4" /> Copiar prompt</>}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pronto para colar em qualquer assistente de código. Já contém a URL pública de download da sua instância.
        </p>
        <pre className="mt-4 max-h-[520px] overflow-auto rounded-md border border-border bg-secondary/40 p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap">
{prompt}
        </pre>
      </Card>
    </div>
  );
};
