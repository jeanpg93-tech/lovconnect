import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Image as ImageIcon, Film } from "lucide-react";
import { toast } from "sonner";

type Tutorial = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  media_url: string | null;
  media_type: string;
  is_active: boolean;
};

export default function GerentePlanoTutoriais() {
  const [items, setItems] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("recharge_plan_tutorial_media")
      .select("*")
      .order("sort_order", { ascending: true });
    setItems((data ?? []) as Tutorial[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (t: Tutorial) => {
    setSaving(t.id);
    const { error } = await supabase
      .from("recharge_plan_tutorial_media")
      .update({
        title: t.title,
        description: t.description,
        media_url: t.media_url,
        media_type: t.media_type,
        is_active: t.is_active,
      })
      .eq("id", t.id);
    setSaving(null);
    if (error) toast.error(error.message);
    else { toast.success("Salvo"); load(); }
  };

  const update = (id: string, patch: Partial<Tutorial>) => {
    setItems((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary opacity-30" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Tutoriais da página do cliente
          </CardTitle>
          <CardDescription>
            Os GIFs/vídeos abaixo aparecem na página pública do plano para ajudar o cliente.
            Cole uma URL pública (Tenor, Imgur, YouTube embed, etc.). Deixe vazio para esconder.
          </CardDescription>
        </CardHeader>
      </Card>

      {items.map((t) => (
        <Card key={t.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {t.slug}
                </div>
                <CardTitle className="text-base">{t.title}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Ativo</Label>
                <Switch
                  checked={t.is_active}
                  onCheckedChange={(v) => update(t.id, { is_active: v })}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Título</Label>
                <Input
                  value={t.title}
                  onChange={(e) => update(t.id, { title: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <select
                  value={t.media_type}
                  onChange={(e) => update(t.id, { media_type: e.target.value })}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="gif">GIF</option>
                  <option value="image">Imagem</option>
                  <option value="video">Vídeo</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea
                rows={2}
                value={t.description ?? ""}
                onChange={(e) => update(t.id, { description: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">URL da mídia</Label>
              <Input
                placeholder="https://media.tenor.com/..."
                value={t.media_url ?? ""}
                onChange={(e) => update(t.id, { media_url: e.target.value })}
              />
            </div>
            {t.media_url && (
              <div className="rounded-lg border bg-muted/30 p-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                  <Film className="h-3 w-3" /> Pré-visualização
                </div>
                {t.media_type === "video" ? (
                  <video src={t.media_url} controls className="w-full max-h-64 rounded" />
                ) : (
                  <img src={t.media_url} alt={t.title} className="w-full max-h-64 object-contain rounded" />
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => save(t)} disabled={saving === t.id}>
                {saving === t.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}