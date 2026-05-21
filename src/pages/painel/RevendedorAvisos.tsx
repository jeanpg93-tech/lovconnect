import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/painel/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Sparkles, Megaphone, Gift, Wrench, Check, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Announcement = {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: number;
  expires_at: string | null;
  created_at: string;
};

const CATEGORIES = [
  { value: "alerta", label: "Alerta", icon: AlertTriangle, color: "text-destructive border-destructive/40 bg-destructive/10" },
  { value: "atualizacao", label: "Atualização", icon: Wrench, color: "text-blue-500 border-blue-500/40 bg-blue-500/10" },
  { value: "novidade", label: "Novidade", icon: Sparkles, color: "text-purple-500 border-purple-500/40 bg-purple-500/10" },
  { value: "bonus", label: "Bônus", icon: Gift, color: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10" },
  { value: "geral", label: "Geral", icon: Megaphone, color: "text-muted-foreground border-border bg-muted" },
];
const catMeta = (c: string) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[4];

export default function RevendedorAvisos() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [reads, setReads] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const [a, r] = await Promise.all([
      supabase.from("announcements")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("announcement_reads").select("announcement_id").eq("user_id", u.user?.id ?? ""),
    ]);
    setItems((a.data ?? []) as any);
    setReads(new Set((r.data ?? []).map((x: any) => x.announcement_id)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("announcement_reads")
      .insert({ announcement_id: id, user_id: u.user.id });
    if (error && !error.message.includes("duplicate")) {
      toast.error("Erro ao marcar: " + error.message);
      return;
    }
    setReads((s) => new Set(s).add(id));
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <PageHeader title="Avisos" description="Comunicados oficiais da equipe." />
      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum aviso no momento.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const m = catMeta(a.category);
            const isRead = reads.has(a.id);
            return (
              <Card key={a.id} className={cn("transition-opacity", isRead && "opacity-70")}>
                <CardContent className="p-4 sm:p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", m.color)}>
                      <m.icon className="h-3 w-3" /> {m.label}
                    </span>
                    {!isRead && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                        Novo
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-base font-bold sm:text-lg">{a.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.content}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span>{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                      {a.expires_at && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Até {new Date(a.expires_at).toLocaleString("pt-BR")}
                        </span>
                      )}
                    </div>
                    {!isRead && (
                      <Button size="sm" variant="ghost" onClick={() => markRead(a.id)}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Marcar como lido
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
