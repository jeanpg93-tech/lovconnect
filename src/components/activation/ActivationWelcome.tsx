import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActivation } from "@/hooks/useActivation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Copy, Check, Sparkles, ShieldCheck, KeyRound, Award, Users, Store, RefreshCcw, Upload, Clock, LogOut, MessageCircle } from "lucide-react";
import { LovMainLogo } from "@/components/LovMainLogo";
import { toast } from "sonner";

const BENEFITS = [
  { icon: KeyRound, title: "Painel completo de revendedor", desc: "gere suas próprias chaves de licença" },
  { icon: Sparkles, title: "10 chaves de teste da Extensão", desc: "para começar a operar imediatamente" },
  { icon: Award, title: "Entrada direta no Nível Bronze", desc: "com acesso a preços de revenda" },
  { icon: Users, title: "1% de comissão recorrente", desc: "por cada novo revendedor que você indicar" },
  { icon: Store, title: "Loja pública personalizada", desc: "para receber pedidos automáticos" },
  { icon: ShieldCheck, title: "API + integrações", desc: "WhatsApp, MisticPay, Ranking e mais" },
];

function formatExpire(iso: string | null) {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expirado";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

export function ActivationWelcome() {
  const { user, signOut } = useAuth();
  const { loading, status, payment, refresh } = useActivation(user?.id);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [proofNote, setProofNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const pixActive = payment && payment.status === "pending" && payment.copy_paste && payment.expires_at && new Date(payment.expires_at) > new Date();
  const expiredOrNone = !payment || payment.status === "expired" || payment.status === "cancelled" || (payment.status === "pending" && payment.expires_at && new Date(payment.expires_at) <= new Date());
  void tick;
  const expireLabel = useMemo(() => (payment?.expires_at ? formatExpire(payment.expires_at) : ""), [payment?.expires_at, tick]);

  const generatePix = async (forceNew = false) => {
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("activation-create-pix", { body: { force_new: forceNew } });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    if (data?.error) { toast.error(data.error); return; }
    toast.success(forceNew ? "Novo PIX gerado" : "PIX gerado");
    refresh();
  };

  const copyPix = async () => {
    if (!payment?.copy_paste) return;
    await navigator.clipboard.writeText(payment.copy_paste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Código PIX copiado");
  };

  const onUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("activation-proofs").upload(path, file, { upsert: false });
    if (upErr) { setUploading(false); toast.error(upErr.message); return; }
    const { data, error } = await supabase.functions.invoke("activation-submit-proof", { body: { proof_path: path, note: proofNote } });
    setUploading(false);
    if (error || data?.error) { toast.error(error?.message ?? data?.error); return; }
    toast.success("Comprovante enviado para análise");
    setProofNote("");
    refresh();
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background p-4 py-8 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-fade opacity-30" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative z-10 mx-auto w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <LovMainLogo />
          <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="mr-1.5 h-3.5 w-3.5" /> sair</Button>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
          <div className="flex flex-col gap-2 text-center">
            <span className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><Sparkles className="h-3 w-3" /> ative seu painel</span>
            <h1 className="font-display text-2xl font-bold uppercase tracking-tight sm:text-3xl">Painel de Revendedor — <span className="text-primary">R$ 200,00</span></h1>
            <p className="text-sm text-muted-foreground">Pagamento único. Sem mensalidade. Acesso imediato.</p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/40 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><b.icon className="h-4 w-4" /></div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider">{b.title}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            {status === "payment_under_review" && (
              <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-center text-sm text-yellow-200">
                <Clock className="mx-auto mb-1 h-4 w-4" />
                Seu comprovante foi recebido e está em análise. Você será notificado em breve.
              </div>
            )}
            {status === "payment_rejected" && payment?.reviewer_note && (
              <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive-foreground">
                <strong>Comprovante recusado.</strong> Motivo: {payment.reviewer_note}
              </div>
            )}

            <Tabs defaultValue="pix">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="pix">Pagar com PIX</TabsTrigger>
                <TabsTrigger value="proof">Já paguei — enviar comprovante</TabsTrigger>
              </TabsList>

              <TabsContent value="pix" className="mt-4">
                {pixActive ? (
                  <div className="flex flex-col items-center gap-4 rounded-xl border border-border/50 bg-background/40 p-6">
                    {payment!.qr_code_base64 && (
                      <img
                        src={payment!.qr_code_base64.startsWith("data:")
                          ? payment!.qr_code_base64
                          : `data:image/png;base64,${payment!.qr_code_base64}`}
                        alt="QR Code PIX"
                        className="h-56 w-56 rounded-lg border border-border bg-white p-2"
                      />
                    )}
                    <div className="w-full max-w-md">
                      <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">PIX Copia e Cola</div>
                      <div className="mt-1.5 rounded-lg border border-border bg-background p-3 font-mono text-[11px] break-all">{payment!.copy_paste}</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button onClick={copyPix} size="sm">{copied ? <><Check className="mr-1.5 h-3.5 w-3.5" /> copiado</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> copiar PIX</>}</Button>
                      <Button onClick={() => generatePix(true)} variant="outline" size="sm" disabled={creating}>
                        {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> gerar novo PIX</>}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Expira em {expireLabel} • Confirmação automática após pagamento</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/50 bg-background/40 p-6 text-center">
                    <p className="text-sm text-muted-foreground">{expiredOrNone && payment ? "O PIX anterior expirou ou foi cancelado." : "Clique abaixo para gerar seu PIX de R$ 200."}</p>
                    <Button onClick={() => generatePix(false)} disabled={creating} className="mt-4">
                      {creating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                      gerar PIX de R$ 200
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="proof" className="mt-4">
                <div className="rounded-xl border border-border/50 bg-background/40 p-6">
                  <p className="text-sm text-muted-foreground">Envie o comprovante (imagem ou PDF) do pagamento já realizado. Um gerente irá validar e liberar seu painel.</p>
                  <textarea
                    value={proofNote}
                    onChange={(e) => setProofNote(e.target.value)}
                    placeholder="Observação opcional (data, banco, etc.)"
                    className="mt-3 w-full rounded-lg border border-border bg-background p-2 text-sm"
                    rows={2}
                    maxLength={500}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUpload(f);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  />
                  <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="mt-3 w-full">
                    {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                    enviar comprovante
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80">
            <MessageCircle className="h-3 w-3" /> dúvidas? fale com quem te indicou ou com o suporte
          </div>
        </div>
      </div>
    </div>
  );
}