import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Sparkles, ShieldCheck, Calendar, LogOut, RefreshCw } from "lucide-react";
import { LovMainLogo } from "@/components/LovMainLogo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const formatBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);

const formatDate = (s: string | null) => {
  if (!s) return "—";
  try { return new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("pt-BR"); }
  catch { return s; }
};

type Charge = {
  id: string; amount_cents: number; due_date: string; status: string;
  pix_payload: string | null; pix_qr_base64: string | null;
  description: string | null; is_onboarding: boolean | null;
  created_at: string;
};

type Props = { mode?: "onboarding" | "blocked" };

export function SubscriptionLockOverlay({ mode = "onboarding" }: Props) {
  const { user, signOut } = useAuth();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Charge | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: r } = await supabase
      .from("resellers").select("id").eq("user_id", user.id).maybeSingle();
    if (!r) { setLoading(false); return; }
    let q = supabase
      .from("reseller_subscription_charges")
      .select("*")
      .eq("reseller_id", (r as any).id)
      .in("status", ["pending", "overdue"])
      .order("due_date", { ascending: true });
    if (mode === "onboarding") q = q.eq("is_onboarding", true);
    const { data } = await q;
    const list = (data ?? []) as Charge[];
    setCharges(list);
    setSelected((prev) => prev ? list.find((c) => c.id === prev.id) ?? list[0] ?? null : list[0] ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`onboarding-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reseller_subscription_charges" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "resellers", filter: `user_id=eq.${user.id}` }, (payload: any) => {
        const n = payload.new;
        if (mode === "onboarding" && n?.subscription_onboarding_completed) window.location.reload();
        if (mode === "blocked" && n?.subscription_blocked === false) window.location.reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const copy = (txt: string | null) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    toast.success("PIX copiado!");
  };

  const current = selected ?? charges[0] ?? null;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-background/70 backdrop-blur-xl">
      <div className="min-h-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl">
          <div className="mb-6 flex justify-center">
            <LovMainLogo size="h-20 sm:h-28" />
          </div>

          <div className="rounded-2xl border border-violet-500/30 bg-card/80 p-5 shadow-2xl sm:p-8 space-y-5">
            <div className="text-center">
              <Badge className={cn("mb-3", mode === "blocked"
                ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                : "bg-violet-500/15 text-violet-400 border-violet-500/30")}>
                <Sparkles className="h-3 w-3 mr-1" /> {mode === "blocked" ? "Cobrança em aberto" : "Modo Mensalista"}
              </Badge>
              <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tighter">
                {mode === "blocked" ? (
                  <>Painel <span className="text-rose-400 italic">bloqueado</span></>
                ) : (
                  <>Conclua sua <span className="text-violet-400 italic">ativação</span></>
                )}
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                {mode === "blocked"
                  ? "Você tem cobranças vencidas. Regularize o pagamento para liberar o painel."
                  : "Seu painel será liberado automaticamente assim que o pagamento for confirmado."}
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : charges.length === 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-center">
                <p className="text-sm text-amber-400 font-medium">Aguardando o gerente gerar suas cobranças iniciais.</p>
                <p className="text-xs text-muted-foreground mt-2">Entre em contato com o suporte se isto demorar.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={load}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Verificar novamente
                </Button>
              </div>
            ) : (
              <>
                {/* Charge selector */}
                {charges.length > 1 && (
                  <div className="grid grid-cols-2 gap-2">
                    {charges.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-all",
                          current?.id === c.id
                            ? "border-violet-500/50 bg-violet-500/10"
                            : "border-border bg-card/40 hover:bg-card/60",
                        )}
                      >
                        <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Parcela {i + 1}</div>
                        <div className="font-mono font-black text-lg mt-1">{formatBRL(c.amount_cents)}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(c.due_date)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {current && (
                  <div className="rounded-xl border border-border bg-background/40 p-4 sm:p-6 space-y-4">
                    <div className="text-center">
                      <p className="text-xs uppercase font-bold tracking-widest text-muted-foreground">Valor a pagar</p>
                      <p className="font-mono font-black text-3xl sm:text-4xl text-violet-400 mt-1">{formatBRL(current.amount_cents)}</p>
                      <p className="text-xs text-muted-foreground mt-2">Vencimento: {formatDate(current.due_date)}</p>
                    </div>

                    {current.pix_qr_base64 && (
                      <div className="flex justify-center">
                        <img
                          src={current.pix_qr_base64.startsWith("data:") ? current.pix_qr_base64 : `data:image/png;base64,${current.pix_qr_base64}`}
                          alt="QR Code PIX"
                          className="w-full max-w-[260px] aspect-square mx-auto rounded-lg bg-white p-2"
                        />
                      </div>
                    )}

                    {current.pix_payload && (
                      <div className="space-y-2">
                        <Label className="text-xs">PIX Copia e cola</Label>
                        <div className="flex gap-2">
                          <Input value={current.pix_payload} readOnly className="font-mono text-xs" />
                          <Button size="icon" variant="secondary" onClick={() => copy(current.pix_payload)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                      <ShieldCheck className="h-3 w-3 text-emerald-400" />
                      O painel será liberado em segundos após o pagamento.
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={load} className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4 mr-2" /> Verificar pagamento
              </Button>
              <Button variant="ghost" size="sm" onClick={() => signOut()} className="w-full sm:w-auto">
                <LogOut className="h-4 w-4 mr-2" /> Sair
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}