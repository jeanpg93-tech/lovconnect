import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, Share2, Users, TrendingUp, Crown, Gift } from "lucide-react";
import { toast } from "sonner";

type Referral = {
  id: string;
  referred_reseller_id: string;
  affiliate_code: string;
  total_commission_cents: number;
  created_at: string;
};

export default function RevendedorIndicacoes() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [code, setCode] = useState<string>("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referredNames, setReferredNames] = useState<Record<string, string>>({});
  const [tier, setTier] = useState<{ name: string; color: string; referral_commission_percent: number } | null>(null);

  const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const link = code ? `${window.location.origin}/auth?ref=${code}` : "";

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      if (!r || cancelled) { setLoading(false); return; }
      setResellerId(r.id);

      const [{ data: aff }, { data: refs }, { data: t }] = await Promise.all([
        supabase.from("affiliate_codes").select("code").eq("owner_reseller_id", r.id).maybeSingle(),
        supabase.from("reseller_referrals").select("*").eq("referrer_reseller_id", r.id).order("created_at", { ascending: false }),
        supabase.rpc("get_reseller_tier", { _reseller_id: r.id }),
      ]);
      if (cancelled) return;
      if (aff?.code) setCode(aff.code);
      setReferrals((refs ?? []) as Referral[]);
      const tRow: any = Array.isArray(t) ? t[0] : t;
      if (tRow) setTier({ name: tRow.name, color: tRow.color, referral_commission_percent: Number(tRow.referral_commission_percent ?? 0) });

      const ids = (refs ?? []).map((x: any) => x.referred_reseller_id);
      if (ids.length) {
        const { data: rs } = await supabase.from("resellers").select("id,display_name").in("id", ids);
        const map: Record<string, string> = {};
        (rs ?? []).forEach((x: any) => { map[x.id] = x.display_name; });
        setReferredNames(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const copy = (s: string, label: string) => {
    navigator.clipboard.writeText(s);
    toast.success(`${label} copiado`);
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Vire revendedor comigo",
          text: "Use meu código de indicação para se cadastrar:",
          url: link,
        });
      } catch {}
    } else {
      copy(link, "Link");
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const totalEarned = referrals.reduce((s, r) => s + r.total_commission_cents, 0);
  const pct = tier?.referral_commission_percent ?? 0;

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <PageHeader
        title="Indique e ganhe"
        description="Compartilhe seu link de indicação. Ganhe comissão sobre cada recarga dos seus indicados."
      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold relative z-10">
            <Users className="h-3.5 w-3.5 text-primary" /> Indicados
          </div>
          <div className="mt-2 font-display text-2xl md:text-3xl font-bold relative z-10">{referrals.length}</div>
          <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <Users className="h-12 w-12 text-primary rotate-12" />
          </div>
        </div>
        
        <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold relative z-10">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Total ganho
          </div>
          <div className="mt-2 font-display text-2xl md:text-3xl font-bold text-emerald-500 relative z-10">{fmt(totalEarned)}</div>
          <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingUp className="h-12 w-12 text-emerald-500 rotate-12" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold relative z-10">
            <Gift className="h-3.5 w-3.5 text-amber-500" /> Sua comissão
          </div>
          <div className="mt-2 font-display text-2xl md:text-3xl font-bold text-amber-500 relative z-10">{pct}%</div>
          <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <Gift className="h-12 w-12 text-amber-500 rotate-12" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <Crown className="h-3.5 w-3.5 text-primary" /> Partner
            </div>
            {tier && (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider z-10"
                style={{ borderColor: tier.color, color: tier.color, backgroundColor: `${tier.color}15` }}
              >
                {tier.name}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight relative z-10">
            % sobre cada recarga dos indicados. Suba de nível para aumentar.
          </p>
          <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:opacity-10 transition-opacity">
            <Crown className="h-12 w-12 text-primary rotate-12" />
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-primary/5 p-5 md:p-6">
        <div className="relative z-10">
          <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" /> Compartilhar convite
          </h3>
          
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold ml-1">Seu Link de Cadastro</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input 
                    value={link} 
                    readOnly 
                    className="pr-10 font-mono text-xs bg-background/50 border-primary/20 focus-visible:ring-primary/30 h-11" 
                  />
                  <div className="absolute right-0 top-0 h-full flex items-center pr-1">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-9 w-9 text-muted-foreground hover:text-primary"
                      onClick={() => copy(link, "Link")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                className="h-12 border-primary/20 bg-background/50 hover:bg-primary/5 text-primary font-semibold"
                onClick={() => copy(code, "Código")}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar Código
              </Button>
              <Button 
                className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-bold shadow-lg shadow-primary/20"
                onClick={share}
              >
                <Share2 className="mr-2 h-4 w-4" /> Enviar Link
              </Button>
            </div>

            <div className="bg-primary/10 rounded-xl p-3 flex gap-3 items-start">
              <div className="bg-primary/20 rounded-full p-1.5 mt-0.5">
                <Gift className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Ganhe {pct}% de todas as recargas!</strong> Quem usar seu link vira seu indicado para sempre. O crédito cai na hora no seu saldo.
              </p>
            </div>
          </div>
        </div>
        
        {/* Decorative element */}
        <div className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
          <Users className="h-32 w-32 text-primary rotate-12" />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Seus indicados ({referrals.length})</h2>
        </div>

        {referrals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/20 p-12 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary/50 mb-4">
              <Users className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">Nenhum indicado ainda</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[200px] mx-auto">
              Seus indicados e ganhos aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Desktop View (Table) */}
            <div className="hidden md:block rounded-xl border border-border bg-card/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-secondary/20 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  <tr>
                    <th className="px-6 py-4 text-left">Revendedor</th>
                    <th className="px-6 py-4 text-left">Desde</th>
                    <th className="px-6 py-4 text-right">Comissão acumulada</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-foreground">
                          {referredNames[r.referred_reseller_id] || "Revendedor"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs font-medium">
                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-emerald-500 font-bold">
                        {fmt(r.total_commission_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View (Cards) */}
            <div className="md:hidden space-y-2.5">
              {referrals.map((r) => (
                <div key={r.id} className="p-4 rounded-2xl border border-border bg-card/40 flex items-center justify-between transition-active active:scale-[0.98]">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {(referredNames[r.referred_reseller_id] || "R")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm">{referredNames[r.referred_reseller_id] || "Revendedor"}</div>
                      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                        Indicado em {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground mb-0.5 font-bold uppercase tracking-tighter">Ganhos</div>
                    <div className="text-sm font-bold text-emerald-500 font-mono">
                      {fmt(r.total_commission_cents)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
