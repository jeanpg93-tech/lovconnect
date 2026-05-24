import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LovMainLogo } from "@/components/LovMainLogo";
import { Loader2, Phone, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { whatsappSchema } from "@/lib/auth-schemas";

export function PendingProfileGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("whatsapp")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      const wa = (data?.whatsapp ?? "").replace(/\D/g, "");
      setNeeds(wa.length < 10);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const parsed = whatsappSchema.safeParse(whatsapp);
    if (!parsed.success) {
      setErr(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ whatsapp: parsed.data })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("WhatsApp salvo. Aguarde a aprovação.");
    setNeeds(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!needs) return <>{children}</>;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-30" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <LovMainLogo />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-2xl backdrop-blur-sm">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 shadow-red-glow-sm">
            <Phone className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-center font-display text-xl font-bold uppercase tracking-tight">
            Complete seu cadastro
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Para concluir sua solicitação, precisamos do seu WhatsApp. É por ele que entraremos em contato.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wa" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                WhatsApp
              </Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  id="wa"
                  type="tel"
                  inputMode="tel"
                  autoFocus
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 98888-7777"
                  className="pl-9"
                />
              </div>
              {err && <p className="text-[11px] text-destructive">{err}</p>}
            </div>

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldCheck className="mr-2 h-4 w-4" />Salvar e continuar</>}
            </Button>
            <Button type="button" variant="ghost" onClick={() => signOut()} className="w-full text-muted-foreground">
              <LogOut className="mr-2 h-4 w-4" /> sair
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}