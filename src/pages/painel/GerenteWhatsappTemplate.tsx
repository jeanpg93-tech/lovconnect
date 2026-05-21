import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_TPL = "Olá {nome}! ✅ Sua licença {tipo} foi gerada.\n\n🔑 Chave: {chave}\n\nGuarde com cuidado.";

export default function GerenteWhatsappTemplate() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tpl, setTpl] = useState(DEFAULT_TPL);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings").select("value").eq("key", "evolution_message_template").maybeSingle();
      if (data?.value) {
        const v = typeof data.value === "string" ? data.value : (data.value as any);
        setTpl(typeof v === "string" ? v : DEFAULT_TPL);
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({
      key: "evolution_message_template",
      value: tpl as any,
    }, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Template salvo");
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Mensagem de entrega (WhatsApp)"
        description="Texto enviado a todos os clientes quando uma licença é gerada e o revendedor está com WhatsApp conectado."
      />

      <section className="rounded-xl border border-border bg-card/60 p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Template global</h3>
            <p className="text-xs text-muted-foreground">Vale para todos os revendedores conectados.</p>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label>Mensagem</Label>
          <Textarea rows={8} value={tpl} onChange={(e) => setTpl(e.target.value)} className="font-mono text-sm" />
          <p className="text-[11px] text-muted-foreground">
            Variáveis: <code>{"{nome}"}</code>, <code>{"{chave}"}</code>, <code>{"{tipo}"}</code>
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </section>
    </PageContainer>
  );
}
