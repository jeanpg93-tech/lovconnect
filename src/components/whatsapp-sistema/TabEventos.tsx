import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type Event = {
  id: string;
  event_key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  template: string;
  cooldown_hours: number;
  variables: string[];
};

export default function TabEventos() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Partial<Event>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("system_whatsapp_events").select("*").order("event_key");
    setEvents((data ?? []) as any);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const update = (id: string, patch: Partial<Event>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const save = async (ev: Event) => {
    setSaving(ev.id);
    const patch = drafts[ev.id] ?? {};
    const payload = {
      enabled: patch.enabled ?? ev.enabled,
      template: patch.template ?? ev.template,
      cooldown_hours: Number(patch.cooldown_hours ?? ev.cooldown_hours),
    };
    const { error } = await supabase.from("system_whatsapp_events").update(payload).eq("id", ev.id);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`"${ev.label}" salvo`);
    setDrafts((d) => { const n = { ...d }; delete n[ev.id]; return n; });
    load();
  };

  const toggleEnabled = async (ev: Event, v: boolean) => {
    const { error } = await supabase.from("system_whatsapp_events").update({ enabled: v }).eq("id", ev.id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Eventos automáticos</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configure quais notificações são enviadas e o texto de cada uma.
            Use variáveis como <code className="text-xs bg-muted px-1 rounded">{"{nome}"}</code>,{" "}
            <code className="text-xs bg-muted px-1 rounded">{"{valor}"}</code>,{" "}
            <code className="text-xs bg-muted px-1 rounded">{"{link}"}</code>.
            O rodapé é adicionado automaticamente.
          </p>
        </CardContent>
      </Card>

      {events.map((ev) => {
        const draft = drafts[ev.id] ?? {};
        const enabled = draft.enabled ?? ev.enabled;
        const template = draft.template ?? ev.template;
        const cooldown = draft.cooldown_hours ?? ev.cooldown_hours;
        const dirty = Object.keys(draft).length > 0;
        return (
          <Card key={ev.id}>
            <CardHeader>
              <CardTitle className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-base">{ev.label}</div>
                  {ev.description && <div className="text-xs text-muted-foreground font-normal mt-1">{ev.description}</div>}
                </div>
                <Switch checked={enabled} onCheckedChange={(v) => toggleEnabled(ev, v)} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {ev.variables.map((v) => (
                  <Badge key={v} variant="secondary" className="text-xs cursor-pointer" onClick={() => {
                    update(ev.id, { template: template + `{${v}}` });
                  }}>{`{${v}}`}</Badge>
                ))}
              </div>
              <div>
                <Label>Mensagem</Label>
                <Textarea
                  rows={5}
                  value={template}
                  onChange={(e) => update(ev.id, { template: e.target.value })}
                  disabled={!enabled}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Cooldown (horas) — evita reenvio repetido</Label>
                  <Input
                    type="number" min={0}
                    value={cooldown}
                    onChange={(e) => update(ev.id, { cooldown_hours: Number(e.target.value) })}
                  />
                </div>
              </div>
              <Button onClick={() => save(ev)} disabled={!dirty || saving === ev.id} size="sm">
                {saving === ev.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}