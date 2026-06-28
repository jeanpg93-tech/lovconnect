import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import PackLowBalanceBanner from "@/components/painel/PackLowBalanceBanner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Package, Copy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";
import { PackIcon } from "@/lib/pack-icons";
import { DevReleasePixButton } from "@/components/dev/DevReleasePixButton";

type Pack = {
  id: string; name: string; credits: number; price_cents: number;
  is_active: boolean; sort_order: number; icon?: string | null;
};

const brl = (c: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);

export default function RevendedorComprarPacote() {
  const { packCredits } = useRole();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [pix, setPix] = useState<{ purchase_id: string; copy_paste?: string; qr?: string; credits: number; pack_name: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await invokeAuthenticatedFunction<any>("list-available-packs", { method: "GET" });
      setPacks(((data?.packs ?? []) as any) as Pack[]);
      setLoading(false);
    })();
  }, []);

  // realtime: ao virar pago, fecha modal e mostra toast
  useEffect(() => {
    if (!pix) return;
    const ch = supabase
      .channel(`pack-purchase-${pix.purchase_id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "reseller_pack_purchases", filter: `id=eq.${pix.purchase_id}` }, (payload: any) => {
        if (payload.new?.status === "paid") {
          toast.success("Pagamento confirmado! Licenças liberadas.");
          setPix(null);
          setTimeout(() => window.location.reload(), 1500);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pix?.purchase_id]);

  const buy = async (pack: Pack) => {
    setCreating(pack.id);
    const { data, error } = await invokeAuthenticatedFunction<any>("pack-create-purchase", {
      method: "POST",
      body: { pack_id: pack.id },
    });
    setCreating(null);
    if (error || (data as any)?.error) return toast.error((data as any)?.error ?? "Falha ao criar Pix");
    setPix({
      purchase_id: data.purchase_id,
      copy_paste: data.copy_paste,
      qr: data.qr_code_base64,
      credits: data.credits,
      pack_name: data.pack_name,
    });
  };

  return (
    <PageContainer>
      <PageHeader
        title="Comprar Pacote"
        description="Cada licença = 1 chave gerada (qualquer duração). Trials são grátis."
      />
      <PackLowBalanceBanner />

      <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2">
        <Package className="h-5 w-5 text-primary" />
        <div>
          <div className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground">Licenças restantes</div>
          <div className="font-mono font-black text-xl text-primary">{packCredits}</div>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : packs.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">Nenhum pacote disponível no momento.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packs.map((p) => {
              const perKey = p.credits > 0 ? p.price_cents / p.credits : 0;
              return (
                <div key={p.id} className="rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-sm flex flex-col">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                      <PackIcon name={p.icon} className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-lg font-bold truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.credits} licenças</div>
                    </div>
                  </div>
                  <div className="my-4 font-mono text-3xl font-black text-primary">{brl(p.price_cents)}</div>
                  <div className="text-[11px] text-muted-foreground mb-4">{brl(perKey)} por licença</div>
                  <Button className="mt-auto" disabled={!!creating} onClick={() => buy(p)}>
                    {creating === p.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Comprar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!pix} onOpenChange={(o) => !o && setPix(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Pague com Pix</DialogTitle></DialogHeader>
          {pix && (
            <div className="space-y-4">
              <div className="text-center">
                <Badge className="bg-primary/15 text-primary border-primary/30">{pix.pack_name} · {pix.credits} licenças</Badge>
              </div>
              {pix.qr && (
                <div className="flex justify-center">
                  <img
                    src={pix.qr.startsWith("data:") ? pix.qr : `data:image/png;base64,${pix.qr}`}
                    alt="QR Code PIX"
                    className="w-full max-w-[260px] aspect-square rounded-lg bg-white p-2"
                  />
                </div>
              )}
              {pix.copy_paste && (
                <div className="space-y-2">
                  <Label className="text-xs">PIX Copia e cola</Label>
                  <div className="flex gap-2">
                    <Input value={pix.copy_paste} readOnly className="font-mono text-xs" />
                    <Button size="icon" variant="secondary" onClick={() => {
                      navigator.clipboard.writeText(pix.copy_paste!);
                      toast.success("PIX copiado!");
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                As licenças serão liberadas automaticamente após o pagamento.
              </div>
              <div className="flex justify-center pt-1">
                <DevReleasePixButton kind="pack" id={pix.purchase_id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}