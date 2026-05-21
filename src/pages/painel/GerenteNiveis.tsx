import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Save, Plus, Trash2, Crown, Pencil, EyeOff, Tag, Wallet, Sparkles, UserCheck, KeyRound, Users, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";


type Tier = {
  id: string; slug: string; name: string; color: string;
  min_spent_cents: number; discount_percent: number; recharge_bonus_percent: number;
  referral_commission_percent: number;
  test_keys_per_day: number;
  sort_order: number; is_active: boolean;
  is_hidden: boolean;
};
type Reseller = { id: string; display_name: string };
type State = { reseller_id: string; total_spent_cents: number; forced_tier_id: string | null };
type Extension = { id: string; name: string };
type TierPriceRow = { id: string; tier_id: string; extension_id: string; license_type: string; price_cents: number; is_active: boolean };

const blank: Omit<Tier, "id"> = {
  slug: "", name: "", color: "#888888",
  min_spent_cents: 0, discount_percent: 0, recharge_bonus_percent: 0,
  referral_commission_percent: 0,
  test_keys_per_day: 10,
  sort_order: 99, is_active: true,
  is_hidden: false,
};

const LICENSE_TYPES: { key: string; label: string }[] = [
  { key: "pro_1d", label: "Pro 1 dia" },
  { key: "pro_7d", label: "Pro 7 dias" },
  { key: "pro_15d", label: "Pro 15 dias" },
  { key: "pro_30d", label: "Pro 30 dias" },
  { key: "lifetime", label: "Vitalícia" },
];

export default function GerenteNiveis() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [states, setStates] = useState<Record<string, State>>({});
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);

  const [editTier, setEditTier] = useState<Tier | (Omit<Tier, "id"> & { id?: string }) | null>(null);
  const [editReseller, setEditReseller] = useState<Reseller | null>(null);
  const [overrideTier, setOverrideTier] = useState<string>("auto");

  const [pricesTier, setPricesTier] = useState<Tier | null>(null);
  const [tierPrices, setTierPrices] = useState<Record<string, number>>({}); // key: extId|type -> cents
  const [savingPrices, setSavingPrices] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: r }, { data: s }, { data: ex }] = await Promise.all([
      supabase.from("reseller_tiers").select("*").order("sort_order"),
      supabase.from("resellers").select("id,display_name").order("display_name"),
      supabase.from("reseller_tier_state").select("*"),
      supabase.from("extensions").select("id,name").eq("is_active", true).order("name"),
    ]);
    setTiers((t ?? []) as Tier[]);
    setResellers(r ?? []);
    const map: Record<string, State> = {};
    (s ?? []).forEach((row: any) => { map[row.reseller_id] = row; });
    setStates(map);
    setExtensions((ex ?? []) as Extension[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const tierFor = (resellerId: string): Tier | null => {
    const st = states[resellerId];
    if (!st) return tiers.find((t) => !t.is_hidden) ?? null;
    if (st.forced_tier_id) {
      return tiers.find((t) => t.id === st.forced_tier_id) ?? null;
    }
    const eligible = tiers.filter((t) => t.is_active && !t.is_hidden && t.min_spent_cents <= st.total_spent_cents);
    return eligible.sort((a, b) => b.min_spent_cents - a.min_spent_cents)[0] ?? null;
  };

  const saveTier = async () => {
    if (!editTier) return;
    const payload = {
      slug: editTier.slug.trim().toLowerCase(),
      name: editTier.name.trim(),
      color: editTier.color,
      min_spent_cents: Number(editTier.min_spent_cents) || 0,
      discount_percent: Number(editTier.discount_percent) || 0,
      recharge_bonus_percent: Number(editTier.recharge_bonus_percent) || 0,
      referral_commission_percent: Number(editTier.referral_commission_percent) || 0,
      test_keys_per_day: Math.max(0, Math.floor(Number(editTier.test_keys_per_day) || 0)),
      sort_order: Number(editTier.sort_order) || 0,
      is_active: editTier.is_active,
      is_hidden: !!editTier.is_hidden,
    };
    if (!payload.slug || !payload.name) return toast.error("Slug e nome são obrigatórios");
    if ("id" in editTier && editTier.id) {
      const { error } = await supabase.from("reseller_tiers").update(payload).eq("id", editTier.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("reseller_tiers").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Nível salvo");
    setEditTier(null);
    load();
  };

  const removeTier = async (id: string) => {
    if (!confirm("Remover este nível?")) return;
    const { error } = await supabase.from("reseller_tiers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const openOverride = (r: Reseller) => {
    setEditReseller(r);
    setOverrideTier(states[r.id]?.forced_tier_id ?? "auto");
  };

  const saveOverride = async () => {
    if (!editReseller) return;
    const forced_tier_id = overrideTier === "auto" ? null : overrideTier;
    const existing = states[editReseller.id];
    if (existing) {
      const { error } = await supabase.from("reseller_tier_state")
        .update({ forced_tier_id }).eq("reseller_id", editReseller.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("reseller_tier_state")
        .insert({ reseller_id: editReseller.id, total_spent_cents: 0, forced_tier_id });
      if (error) return toast.error(error.message);
    }
    toast.success("Nível atualizado");
    setEditReseller(null);
    load();
  };

  const openPrices = async (tier: Tier) => {
    setPricesTier(tier);
    const { data, error } = await supabase
      .from("tier_extension_prices")
      .select("*")
      .eq("tier_id", tier.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const map: Record<string, number> = {};
    (data ?? []).forEach((row: TierPriceRow) => {
      map[`${row.extension_id}|${row.license_type}`] = row.price_cents;
    });
    setTierPrices(map);
  };

  const savePrices = async () => {
    if (!pricesTier) return;
    setSavingPrices(true);
    // Apaga e reinsere apenas valores > 0
    const { error: delErr } = await supabase
      .from("tier_extension_prices")
      .delete()
      .eq("tier_id", pricesTier.id);
    if (delErr) {
      toast.error(delErr.message);
      setSavingPrices(false);
      return;
    }
    const rows = Object.entries(tierPrices)
      .filter(([_, cents]) => Number(cents) > 0)
      .map(([key, cents]) => {
        const [extension_id, license_type] = key.split("|");
        return {
          tier_id: pricesTier.id,
          extension_id,
          license_type,
          price_cents: Math.round(Number(cents)),
          is_active: true,
        };
      });
    if (rows.length) {
      const { error } = await supabase.from("tier_extension_prices").insert(rows);
      if (error) {
        toast.error(error.message);
        setSavingPrices(false);
        return;
      }
    }
    toast.success("Preços salvos");
    setSavingPrices(false);
    setPricesTier(null);
  };

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-background via-background to-primary/5 p-4 md:p-8">
      {/* Decorative bg */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-20 bottom-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-6">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary/20 via-background to-background p-8 border border-primary/10 shadow-2xl mb-8">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-[100px]" />
          <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary border border-primary/20">
                <Crown className="h-3 w-3 animate-pulse" /> Gestão de Elite
              </div>
              <h1 className="font-display text-4xl font-black tracking-tight md:text-5xl lg:text-6xl">
                Níveis de <span className="text-primary">Carreira</span>
              </h1>
              <p className="max-w-md text-sm font-medium text-muted-foreground leading-relaxed">
                Configure as patentes, benefícios e acompanhe a evolução dos seus revendedores em tempo real.
              </p>
            </div>
            
            <Button onClick={() => setEditTier({ ...blank })} className="h-14 rounded-2xl bg-primary px-8 text-sm font-black uppercase tracking-widest text-white shadow-glow-sm transition-all hover:scale-105 hover:shadow-glow-md">
              <Plus className="mr-2 h-5 w-5" /> Novo Nível
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-12">
          {/* Configuração dos níveis */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-glow-sm">
                <Trophy className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-2xl font-black tracking-tight">Estrutura de Patentes</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Configuração de benefícios e requisitos</p>
              </div>
            </div>

            {tiers.length === 0 ? (
              <div className="rounded-[2.5rem] border-2 border-dashed border-border p-16 text-center bg-card/30 backdrop-blur-sm">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted mb-6">
                  <Crown className="h-10 w-10 text-muted-foreground/20" />
                </div>
                <h4 className="text-lg font-bold mb-2">Nenhuma patente criada</h4>
                <p className="text-sm text-muted-foreground italic max-w-xs mx-auto">Comece criando sua primeira patente para organizar seus revendedores.</p>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2">
                {tiers.map((t, idx) => (
                  <div
                    key={t.id}
                    className="group relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-card/40 p-6 backdrop-blur-xl transition-all hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5"
                  >
                    <div 
                      className="absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-5 blur-3xl transition-opacity group-hover:opacity-10"
                      style={{ backgroundColor: t.color }}
                    />
                    
                    <div className="relative flex flex-col gap-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div 
                            className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-inner border border-white/5"
                            style={{ backgroundColor: `${t.color}15`, color: t.color }}
                          >
                            <Crown className="h-7 w-7" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-display text-xl font-black tracking-tight">{t.name}</h4>
                              <div className="flex gap-1">
                                {t.is_hidden && (
                                  <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[8px] font-black text-amber-500 border border-amber-500/20 uppercase">
                                    <EyeOff className="mr-1 h-2.5 w-2.5" /> OCULTO
                                  </span>
                                )}
                                {!t.is_active && (
                                  <span className="inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-[8px] font-black text-zinc-500 border border-zinc-500/20 uppercase">
                                    INATIVO
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="font-mono text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">NÍVEL #{idx + 1} • {t.slug}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openPrices(t)} className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all">
                            <Tag className="h-4.5 w-4.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setEditTier(t)} className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all">
                            <Pencil className="h-4.5 w-4.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => removeTier(t.id)} className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10 transition-all">
                            <Trash2 className="h-4.5 w-4.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Gasto Mín.", value: fmt(t.min_spent_cents), icon: Wallet },
                          { label: "Bônus PIX", value: `${t.recharge_bonus_percent}%`, icon: Sparkles },
                          { label: "Comissão", value: `${t.referral_commission_percent}%`, icon: UserCheck },
                          { label: "Testes/Dia", value: t.test_keys_per_day, icon: KeyRound },
                        ].map((stat, sIdx) => (
                          <div key={sIdx} className="rounded-2xl border border-white/5 bg-black/20 p-4 shadow-inner group-hover:bg-black/30 transition-colors">
                            <div className="flex items-center gap-2 mb-1.5">
                              <stat.icon className="h-3 w-3 text-muted-foreground/60" />
                              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">{stat.label}</span>
                            </div>
                            <div className="text-sm font-black font-mono tracking-tight">{stat.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Monitoramento dos revendedores */}
          <div className="lg:col-span-4 space-y-6">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-glow-sm">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display text-2xl font-black tracking-tight">Monitoramento</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Acompanhamento em tempo real</p>
              </div>
            </div>

            <Card className="rounded-[2.5rem] border-white/5 bg-card/40 backdrop-blur-xl p-6 shadow-xl">
              {resellers.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Users className="h-6 w-6 text-muted-foreground/20" />
                  </div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Nenhum revendedor</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {resellers.map((r) => {
                    const st = states[r.id];
                    const forced = st?.forced_tier_id ? tiers.find((t) => t.id === st.forced_tier_id) : null;
                    const tier = forced ?? tierFor(r.id);
                    const isOverride = !!st?.forced_tier_id;
                    
                    return (
                      <div
                        key={r.id}
                        className="group flex items-center justify-between rounded-3xl border border-transparent p-4 transition-all hover:bg-white/5 hover:border-white/5"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="relative">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 font-black text-primary text-sm border border-primary/20 shadow-inner group-hover:scale-110 transition-transform">
                              {r.display_name?.[0]?.toUpperCase() ?? "?"}
                            </div>
                            {isOverride && (
                              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-500 border-2 border-card flex items-center justify-center shadow-lg" title="Nível Manual">
                                <Pencil className="h-2.5 w-2.5 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-black text-sm truncate leading-tight group-hover:text-primary transition-colors">{r.display_name}</div>
                            <div className="text-[10px] font-bold text-muted-foreground tabular-nums flex items-center gap-1.5 mt-0.5">
                              <Wallet className="h-2.5 w-2.5" /> {fmt(st?.total_spent_cents ?? 0)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {tier ? (
                            <div 
                              className="hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border border-white/5 shadow-inner"
                              style={{ backgroundColor: `${tier.color}15`, color: tier.color, borderColor: `${tier.color}20` }}
                            >
                              <Crown className="h-3 w-3 shrink-0" />
                              <span className="max-w-[80px] truncate">{tier.name}</span>
                            </div>
                          ) : (
                            <span className="hidden sm:block text-[9px] font-black uppercase text-muted-foreground/40 tracking-widest">Sem nível</span>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openOverride(r)} className="h-9 w-9 rounded-xl hover:bg-primary/10 transition-all">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>


      {/* Editor de tier */}
      <Dialog open={!!editTier} onOpenChange={(v) => !v && setEditTier(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editTier && "id" in editTier && editTier.id ? "Editar nível" : "Novo nível"}</DialogTitle></DialogHeader>
          {editTier && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nome</Label>
                <Input value={editTier.name} onChange={(e) => setEditTier({ ...editTier, name: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Slug</Label>
                <Input value={editTier.slug} onChange={(e) => setEditTier({ ...editTier, slug: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Cor</Label>
                <Input type="color" value={editTier.color} onChange={(e) => setEditTier({ ...editTier, color: e.target.value })} />
              </div>
              <div className="space-y-1.5"><Label>Ordem</Label>
                <Input type="number" value={editTier.sort_order} onChange={(e) => setEditTier({ ...editTier, sort_order: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5 col-span-2"><Label>Gasto mínimo (centavos)</Label>
                <Input type="number" value={editTier.min_spent_cents} onChange={(e) => setEditTier({ ...editTier, min_spent_cents: Number(e.target.value) })} />
                <div className="text-[10px] text-muted-foreground">{fmt(Number(editTier.min_spent_cents) || 0)}</div>
              </div>
              <div className="space-y-1.5"><Label>Desconto (%)</Label>
                <Input type="number" step="0.01" value={editTier.discount_percent} onChange={(e) => setEditTier({ ...editTier, discount_percent: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5"><Label>Bônus recargas (%)</Label>
                <Input type="number" step="0.01" value={editTier.recharge_bonus_percent} onChange={(e) => setEditTier({ ...editTier, recharge_bonus_percent: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5"><Label>Comissão de indicação (%)</Label>
                <Input type="number" step="0.01" value={editTier.referral_commission_percent} onChange={(e) => setEditTier({ ...editTier, referral_commission_percent: Number(e.target.value) })} />
                <div className="text-[10px] text-muted-foreground">% sobre recargas PIX dos indicados</div>
              </div>
              <div className="space-y-1.5"><Label>Chaves teste por dia</Label>
                <Input type="number" min="0" step="1" value={editTier.test_keys_per_day} onChange={(e) => setEditTier({ ...editTier, test_keys_per_day: Number(e.target.value) })} />
                <div className="text-[10px] text-muted-foreground">Limite de licenças teste a cada 24h. Use 0 para bloquear.</div>
              </div>
              <label className="flex items-center gap-2 col-span-2 text-xs">
                <input type="checkbox" checked={editTier.is_active} onChange={(e) => setEditTier({ ...editTier, is_active: e.target.checked })} /> Ativo
              </label>
              <label className="flex items-center gap-2 col-span-2 text-xs">
                <input type="checkbox" checked={!!editTier.is_hidden} onChange={(e) => setEditTier({ ...editTier, is_hidden: e.target.checked })} />
                Oculto para revendedores (somente o gerente vê e atribui — útil para níveis especiais como Partner com preços manuais)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTier(null)}>Cancelar</Button>
            <Button onClick={saveTier} className="bg-primary text-primary-foreground hover:bg-primary/90"><Save className="mr-1 h-4 w-4" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override do revendedor */}
      <Dialog open={!!editReseller} onOpenChange={(v) => !v && setEditReseller(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Nível de {editReseller?.display_name}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Nível</Label>
            <Select value={overrideTier} onValueChange={setOverrideTier}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático (pelo gasto)</SelectItem>
                {tiers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.is_hidden ? " (oculto)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              "Automático" segue o gasto acumulado. Selecionar um nível trava manualmente — inclusive níveis ocultos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditReseller(null)}>Cancelar</Button>
            <Button onClick={saveOverride} className="bg-primary text-primary-foreground hover:bg-primary/90">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preços manuais por extensão (níveis ocultos) */}
      <Dialog open={!!pricesTier} onOpenChange={(v) => !v && setPricesTier(null)}>
        <DialogContent className="bg-card border-border max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preços manuais — {pricesTier?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Defina o preço (em reais) de cada plano por extensão. Quando preenchido, esse valor substitui o preço do plano + desconto% para revendedores neste nível. Deixe em branco (ou 0) para usar o preço normal.
            </p>
            {extensions.length === 0 ? (
              <div className="rounded border border-border p-6 text-center text-sm text-muted-foreground">
                Nenhuma extensão ativa cadastrada.
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Extensão</th>
                      {LICENSE_TYPES.map((lt) => (
                        <th key={lt.key} className="px-3 py-2 text-right">{lt.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extensions.map((ext) => (
                      <tr key={ext.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-medium">{ext.name}</td>
                        {LICENSE_TYPES.map((lt) => {
                          const k = `${ext.id}|${lt.key}`;
                          const cents = tierPrices[k] ?? 0;
                          const reais = cents > 0 ? (cents / 100).toFixed(2) : "";
                          return (
                            <td key={lt.key} className="px-2 py-1.5">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="—"
                                value={reais}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const c = v === "" ? 0 : Math.max(0, Math.round(parseFloat(v) * 100));
                                  setTierPrices((prev) => ({ ...prev, [k]: c }));
                                }}
                                className="h-8 w-24 text-right font-mono text-xs"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPricesTier(null)}>Cancelar</Button>
            <Button onClick={savePrices} disabled={savingPrices} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {savingPrices ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Salvar preços
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

