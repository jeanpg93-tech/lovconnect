import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LovMainLogo } from "@/components/LovMainLogo";
import { Loader2, KeyRound, User, Phone, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { whatsappSchema } from "@/lib/auth-schemas";

type Props = { userId: string; children: React.ReactNode };

export function FirstAccessGate({ userId, children }: Props) {
  const { signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState(false);
  const [mustChangePwd, setMustChangePwd] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [needName, setNeedName] = useState(false);
  const [needWa, setNeedWa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, whatsapp, must_change_password")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      const wa = (data?.whatsapp ?? "").replace(/\D/g, "");
      const nm = (data?.display_name ?? "").trim();
      const mcp = !!(data as any)?.must_change_password;
      setMustChangePwd(mcp);
      setNeedName(nm.length < 2);
      setNeedWa(wa.length < 10);
      setName(nm);
      setWhatsapp(data?.whatsapp ?? "");
      setNeeds(mcp || nm.length < 2 || wa.length < 10);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (needName && name.trim().length < 2) { setErr("Informe seu nome completo."); return; }
    let waClean: string | null = null;
    if (needWa) {
      const parsed = whatsappSchema.safeParse(whatsapp);
      if (!parsed.success) { setErr(parsed.error.issues[0].message); return; }
      waClean = parsed.data;
    }
    if (mustChangePwd) {
      if (pwd.length < 8) { setErr("A nova senha deve ter pelo menos 8 caracteres."); return; }
      if (pwd !== pwd2) { setErr("As senhas não coincidem."); return; }
    }

    setSaving(true);
    try {
      if (mustChangePwd) {
        const { error } = await supabase.auth.updateUser({ password: pwd });
        if (error) throw error;
      }
      const update: {
        must_change_password: boolean;
        display_name?: string;
        whatsapp?: string;
      } = { must_change_password: false };
      if (needName) update.display_name = name.trim();
      if (needWa && waClean) update.whatsapp = waClean;
      const { error: pErr } = await supabase.from("profiles").update(update).eq("id", userId);
      if (pErr) throw pErr;
      toast.success("Cadastro concluído!");
      setNeeds(false);
    } catch (e: any) {
      setErr(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen w-full flex-1 items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!needs) return <>{children}</>;

  return (
    <div className="relative flex min-h-screen w-full flex-1 items-center justify-center overflow-hidden bg-background p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-30" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex justify-center sm:mb-8"><LovMainLogo variant="vertical" size="h-40 sm:h-56" /></div>
        <div className="rounded-2xl border border-border/60 bg-card/60 p-8 shadow-2xl backdrop-blur-sm">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 shadow-red-glow-sm">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-center font-display text-xl font-bold uppercase tracking-tight">
            Primeiro acesso
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Para sua segurança, complete seu cadastro antes de continuar.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {needName && (
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" className="pl-9" />
                </div>
              </div>
            )}

            {needWa && (
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">WhatsApp</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                  <Input type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(11) 98888-7777" className="pl-9" />
                </div>
              </div>
            )}

            {mustChangePwd && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Nova senha</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                    <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Mínimo 8 caracteres" className="pl-9" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Confirmar senha</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                    <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} placeholder="Repita a nova senha" className="pl-9" />
                  </div>
                </div>
              </>
            )}

            {err && <p className="text-[11px] text-destructive">{err}</p>}

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