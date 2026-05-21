import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Action = {
  key: string;
  title: string;
  description: string;
  confirm: string;
  run: () => Promise<{ error: any }> | PromiseLike<{ error: any }>;
};

export default function GerenteZonaRisco() {
  const [pending, setPending] = useState<Action | null>(null);
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);

  const actions: Action[] = [
    {
      key: "wipe-licenses",
      title: "Apagar todas as licenças de clientes",
      description:
        "Remove todos os registros em client_extensions. Os clientes perderão acesso imediatamente.",
      confirm: "APAGAR LICENCAS",
      run: () => supabase.from("client_extensions").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    },
    {
      key: "wipe-reseller-ext",
      title: "Revogar extensões de todos os revendedores",
      description:
        "Remove todos os vínculos em reseller_extensions. Revendedores não poderão mais conceder extensões até serem refeitos.",
      confirm: "REVOGAR REVENDEDORES",
      run: () => supabase.from("reseller_extensions").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    },
    {
      key: "wipe-extensions",
      title: "Apagar catálogo de extensões",
      description:
        "Remove TODAS as extensões. Vínculos e licenças relacionados serão apagados em cascata.",
      confirm: "APAGAR CATALOGO",
      run: () => supabase.from("extensions").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    },
  ];

  const execute = async () => {
    if (!pending) return;
    if (typed !== pending.confirm) return toast.error("Texto de confirmação incorreto");
    setRunning(true);
    const result = await pending.run();
    setRunning(false);
    if (result.error) return toast.error(result.error.message);
    toast.success("Ação executada");
    setPending(null);
    setTyped("");
  };

  return (
    <PageContainer>
      <PageHeader
        title="Zona de risco"
        description="Ações destrutivas e irreversíveis. Use com cuidado extremo."
      />

      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 backdrop-blur-sm">
        <div className="mb-4 flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-semibold uppercase tracking-wider">Atenção</span>
        </div>
        <div className="space-y-3">
          {actions.map((a) => (
            <div
              key={a.key}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h3 className="font-medium">{a.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPending(a); setTyped(""); }}
                className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Executar
              </Button>
            </div>
          ))}
        </div>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(v) => { if (!v) { setPending(null); setTyped(""); } }}>
        <AlertDialogContent className="bg-card border-destructive/40">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Confirmar ação destrutiva
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">
              Para confirmar, digite <span className="font-mono text-destructive">{pending?.confirm}</span>
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="bg-secondary/50 border-border font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); execute(); }}
              disabled={running || typed !== pending?.confirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar e executar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
