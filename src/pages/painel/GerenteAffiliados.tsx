import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer, StatCard } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Copy, Trash2, Sparkles, Tag, CheckCircle2, Users, Pause, Share2, TrendingUp, DollarSign, Search } from "lucide-react";
import { toast } from "sonner";

type Affiliate = {
  id: string;
  code: string;
  label: string | null;
  max_uses: number | null;
  uses: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  owner_reseller_id: string | null;
  owner_name?: string | null;
};

type ReferralRow = {
  id: string;
  affiliate_code: string;
  total_commission_cents: number;
  created_at: string;
  referrer: { id: string; display_name: string; phone: string | null } | null;
  referred: { id: string; display_name: string; phone: string | null; created_at: string } | null;
  recharges_count: number;
  recharges_total_cents: number;
};

const randomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

export default function GerenteAffiliados() {
  const [list, setList] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [refs, setRefs] = useState<ReferralRow[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);
  const [refSearch, setRefSearch] = useState("");
  const [codeFilter, setCodeFilter] = useState<"all" | "reseller" | "campaign">("all");
  const [codeSearch, setCodeSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("affiliate_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const rows = (data ?? []) as Affiliate[];
    const ownerIds = Array.from(new Set(rows.map((r) => r.owner_reseller_id).filter(Boolean))) as string[];
    if (ownerIds.length > 0) {
      const { data: owners } = await supabase
        .from("resellers")
        .select("id, display_name")
        .in("id", ownerIds);
      const byId = new Map((owners ?? []).map((o: any) => [o.id, o.display_name]));
      rows.forEach((r) => { r.owner_name = r.owner_reseller_id ? (byId.get(r.owner_reseller_id) ?? null) : null; });
    }
    setList(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const loadReferrals = async () => {
    setRefsLoading(true);
    const { data: rows, error } = await supabase
      .from("reseller_referrals")
      .select("id, affiliate_code, total_commission_cents, created_at, referrer_reseller_id, referred_reseller_id")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setRefsLoading(false); return; }
    const list = rows ?? [];
    const resellerIds = Array.from(new Set(list.flatMap((r: any) => [r.referrer_reseller_id, r.referred_reseller_id])));
    if (resellerIds.length === 0) { setRefs([]); setRefsLoading(false); return; }

    const [{ data: resellers }, { data: recharges }] = await Promise.all([
      supabase.from("resellers").select("id, user_id, display_name, created_at").in("id", resellerIds),
      supabase.from("recharge_intents").select("reseller_id, amount_cents").eq("status", "paid").in("reseller_id", list.map((r: any) => r.referred_reseller_id)),
    ]);
    const userIds = (resellers ?? []).map((r: any) => r.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id, phone").in("id", userIds);
    const phoneByUser = new Map((profiles ?? []).map((p: any) => [p.id, p.phone]));
    const resellerById = new Map((resellers ?? []).map((r: any) => [r.id, r]));

    const recAgg = new Map<string, { count: number; total: number }>();
    (recharges ?? []).forEach((r: any) => {
      const cur = recAgg.get(r.reseller_id) ?? { count: 0, total: 0 };
      cur.count += 1; cur.total += Number(r.amount_cents ?? 0);
      recAgg.set(r.reseller_id, cur);
    });

    const enriched: ReferralRow[] = list.map((r: any) => {
      const rr = resellerById.get(r.referrer_reseller_id);
      const rd = resellerById.get(r.referred_reseller_id);
      const agg = recAgg.get(r.referred_reseller_id) ?? { count: 0, total: 0 };
      return {
        id: r.id,
        affiliate_code: r.affiliate_code,
        total_commission_cents: Number(r.total_commission_cents ?? 0),
        created_at: r.created_at,
        referrer: rr ? { id: rr.id, display_name: rr.display_name, phone: phoneByUser.get(rr.user_id) ?? null } : null,
        referred: rd ? { id: rd.id, display_name: rd.display_name, phone: phoneByUser.get(rd.user_id) ?? null, created_at: rd.created_at } : null,
        recharges_count: agg.count,
        recharges_total_cents: agg.total,
      };
    });
    setRefs(enriched);
    setRefsLoading(false);
  };

  useEffect(() => { loadReferrals(); }, []);

  const openDialog = () => {
    setCode(randomCode());
    setLabel("");
    setMaxUses("");
    setOpen(true);
  };

  const create = async () => {
    if (!code.trim()) return toast.error("Informe um código");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("affiliate_codes").insert({
      code: code.trim().toUpperCase(),
      label: label.trim() || null,
      max_uses: maxUses ? parseInt(maxUses, 10) : null,
      created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      if (error.message.includes("duplicate")) toast.error("Esse código já existe");
      else toast.error(error.message);
      return;
    }
    toast.success("Código criado");
    setOpen(false);
    load();
  };

  const toggleActive = async (a: Affiliate) => {
    const { error } = await supabase
      .from("affiliate_codes")
      .update({ is_active: !a.is_active })
      .eq("id", a.id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (a: Affiliate) => {
    if (!confirm(`Remover código "${a.code}"?`)) return;
    const { error } = await supabase.from("affiliate_codes").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    load();
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Copiado");
  };

  const stats = {
    total: list.length,
    active: list.filter((l) => l.is_active).length,
    inactive: list.filter((l) => !l.is_active).length,
    totalUses: list.reduce((s, l) => s + (l.uses ?? 0), 0),
  };

  const filteredCodes = list.filter((a) => {
    if (codeFilter === "reseller" && !a.owner_reseller_id) return false;
    if (codeFilter === "campaign" && a.owner_reseller_id) return false;
    if (codeSearch.trim()) {
      const q = codeSearch.toLowerCase();
      if (
        !a.code.toLowerCase().includes(q) &&
        !(a.label ?? "").toLowerCase().includes(q) &&
        !(a.owner_name ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const fmtBRL = (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const refStats = {
    total: refs.length,
    commission: refs.reduce((s, r) => s + r.total_commission_cents, 0),
    recharges: refs.reduce((s, r) => s + r.recharges_total_cents, 0),
    activeIndicators: new Set(refs.filter((r) => r.referrer).map((r) => r.referrer!.id)).size,
  };

  const filteredRefs = refs.filter((r) => {
    if (!refSearch.trim()) return true;
    const q = refSearch.toLowerCase();
    return (
      r.referrer?.display_name.toLowerCase().includes(q) ||
      r.referred?.display_name.toLowerCase().includes(q) ||
      r.referrer?.phone?.toLowerCase().includes(q) ||
      r.referred?.phone?.toLowerCase().includes(q) ||
      r.affiliate_code.toLowerCase().includes(q)
    );
  });

  return (
    <PageContainer>
      <PageHeader
        title="Afiliados"
        description="Gere códigos que promovem novos cadastros a revendedor automaticamente."
        icon={Tag}
        actions={
          <Button onClick={openDialog} className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-xl">
            <Plus className="mr-1.5 h-4 w-4" /> Novo código
          </Button>
        }
      />

      <Tabs defaultValue="codigos" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="codigos" className="gap-1.5"><Tag className="h-3.5 w-3.5" /> Códigos</TabsTrigger>
          <TabsTrigger value="indicacoes" className="gap-1.5"><Share2 className="h-3.5 w-3.5" /> Indicações</TabsTrigger>
        </TabsList>

        <TabsContent value="codigos" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Códigos" value={stats.total} icon={Tag} hint="Total cadastrado" />
        <StatCard label="Ativos" value={stats.active} icon={CheckCircle2} hint="Aceitando novos cadastros" />
        <StatCard label="Inativos" value={stats.inactive} icon={Pause} hint="Pausados ou esgotados" />
        <StatCard label="Conversões" value={stats.totalUses} icon={Users} hint="Cadastros gerados" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-xl border border-border bg-card p-1">
              {[
                { v: "all" as const, label: "Todos", count: list.length },
                { v: "reseller" as const, label: "Revendedor", count: list.filter((l) => l.owner_reseller_id).length },
                { v: "campaign" as const, label: "Campanha", count: list.filter((l) => !l.owner_reseller_id).length },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setCodeFilter(opt.v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    codeFilter === opt.v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label} <span className="opacity-60">({opt.count})</span>
                </button>
              ))}
            </div>
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
                placeholder="Buscar código, descrição, dono…"
                className="pl-9 h-10 rounded-xl bg-card"
              />
            </div>
          </div>

      <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filteredCodes.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Tag className="mx-auto mb-2 h-8 w-8 opacity-40" />
            {list.length === 0 ? "Nenhum código de afiliado criado ainda." : "Nenhum código encontrado com esses filtros."}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-foreground/80">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Código</th>
                    <th className="px-4 py-3 text-left font-bold">Tipo / Dono</th>
                    <th className="px-4 py-3 text-left font-bold">Descrição</th>
                    <th className="px-4 py-3 text-center font-bold">Usos</th>
                    <th className="px-4 py-3 text-center font-bold">Ativo</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCodes.map((a) => {
                    const exhausted = a.max_uses != null && a.uses >= a.max_uses;
                    return (
                      <tr key={a.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-sm font-semibold text-primary">{a.code}</code>
                            <Button size="sm" variant="ghost" onClick={() => copy(a.code)} className="h-6 w-6 p-0">
                              <Copy className="h-3 w-3" />
                            </Button>
                            {exhausted && <Badge variant="destructive" className="text-[10px]">esgotado</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {a.owner_reseller_id ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge variant="secondary" className="w-fit text-[10px] gap-1"><Users className="h-2.5 w-2.5" /> Revendedor</Badge>
                              <span className="text-xs text-muted-foreground">{a.owner_name ?? "—"}</span>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary"><Sparkles className="h-2.5 w-2.5" /> Campanha</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{a.label ?? "—"}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">
                          {a.uses}{a.max_uses != null ? ` / ${a.max_uses}` : ""}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(a)} disabled={!!a.owner_reseller_id} title={a.owner_reseller_id ? "Códigos automáticos de revendedor não podem ser removidos" : undefined}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-white/5">
              {filteredCodes.map((a) => {
                const exhausted = a.max_uses != null && a.uses >= a.max_uses;
                return (
                  <div key={a.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-sm font-semibold text-primary">{a.code}</code>
                          <Button size="sm" variant="ghost" onClick={() => copy(a.code)} className="h-6 w-6 p-0">
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        {a.owner_reseller_id ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-[10px] gap-1"><Users className="h-2.5 w-2.5" /> Revendedor</Badge>
                            <span className="text-[11px] text-muted-foreground truncate">{a.owner_name ?? "—"}</span>
                          </div>
                        ) : (
                          <Badge variant="outline" className="w-fit text-[10px] gap-1 border-primary/40 text-primary"><Sparkles className="h-2.5 w-2.5" /> Campanha</Badge>
                        )}
                        {a.label && <p className="text-xs text-muted-foreground">{a.label}</p>}
                      </div>
                      <Switch checked={a.is_active} onCheckedChange={() => toggleActive(a)} />
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-muted-foreground">
                        Usos: <span className="text-foreground">{a.uses}{a.max_uses != null ? ` / ${a.max_uses}` : ""}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        {exhausted && <Badge variant="destructive" className="text-[10px]">esgotado</Badge>}
                        <Button size="sm" variant="ghost" className="text-destructive h-7 px-2" onClick={() => remove(a)} disabled={!!a.owner_reseller_id}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
        </TabsContent>

        <TabsContent value="indicacoes" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Indicações" value={refStats.total} icon={Share2} hint="Vínculos ativos" />
            <StatCard label="Indicadores" value={refStats.activeIndicators} icon={Users} hint="Revendedores que indicaram" />
            <StatCard label="Recargas dos indicados" value={fmtBRL(refStats.recharges)} icon={TrendingUp} hint="Total recebido via PIX" />
            <StatCard label="Comissões pagas" value={fmtBRL(refStats.commission)} icon={DollarSign} hint="Creditado aos indicadores" />
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={refSearch}
              onChange={(e) => setRefSearch(e.target.value)}
              placeholder="Buscar por nome, WhatsApp ou código…"
              className="pl-9 h-10 rounded-xl bg-card"
            />
          </div>

          <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
            {refsLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : filteredRefs.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <Share2 className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {refs.length === 0 ? "Nenhuma indicação registrada ainda." : "Nenhum resultado para a busca."}
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-foreground/80">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold">Indicador</th>
                        <th className="px-4 py-3 text-left font-bold">Indicado</th>
                        <th className="px-4 py-3 text-left font-bold">Cadastro</th>
                        <th className="px-4 py-3 text-right font-bold">Recargas</th>
                        <th className="px-4 py-3 text-right font-bold">Comissão paga</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRefs.map((r) => (
                        <tr key={r.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                          <td className="px-4 py-3">
                            <div className="font-medium">{r.referrer?.display_name ?? "—"}</div>
                            {r.referrer?.phone && <div className="text-[11px] text-muted-foreground font-mono">{r.referrer.phone}</div>}
                            <code className="text-[10px] text-primary/80">{r.affiliate_code}</code>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{r.referred?.display_name ?? "—"}</div>
                            {r.referred?.phone && <div className="text-[11px] text-muted-foreground font-mono">{r.referred.phone}</div>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {r.referred?.created_at ? fmtDate(r.referred.created_at) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-mono text-sm">{fmtBRL(r.recharges_total_cents)}</div>
                            <div className="text-[11px] text-muted-foreground">{r.recharges_count} recarga{r.recharges_count === 1 ? "" : "s"}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-emerald-500">
                            {fmtBRL(r.total_commission_cents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden divide-y divide-white/5">
                  {filteredRefs.map((r) => (
                    <div key={r.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase text-muted-foreground">Indicador</div>
                          <div className="font-medium text-sm truncate">{r.referrer?.display_name ?? "—"}</div>
                          {r.referrer?.phone && <div className="text-[11px] text-muted-foreground font-mono">{r.referrer.phone}</div>}
                        </div>
                        <code className="text-[10px] text-primary/80 shrink-0">{r.affiliate_code}</code>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Indicado</div>
                        <div className="font-medium text-sm truncate">{r.referred?.display_name ?? "—"}</div>
                        {r.referred?.phone && <div className="text-[11px] text-muted-foreground font-mono">{r.referred.phone}</div>}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Cadastro: {r.referred?.created_at ? fmtDate(r.referred.created_at) : "—"}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">Recargas</div>
                          <div className="font-mono text-sm">{fmtBRL(r.recharges_total_cents)}</div>
                          <div className="text-[10px] text-muted-foreground">{r.recharges_count}x</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase text-muted-foreground">Comissão</div>
                          <div className="font-mono text-sm text-emerald-500">{fmtBRL(r.total_commission_cents)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Novo código de afiliado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Quem se cadastrar em <code className="font-mono">/auth</code> usando este código será
              promovido a <strong>revendedor</strong> automaticamente.
            </p>
            <div className="space-y-1.5">
              <Label>Código</Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="font-mono uppercase"
                />
                <Button type="button" variant="outline" onClick={() => setCode(randomCode())}>
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Campanha YouTube"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Limite de usos (opcional)</Label>
              <Input
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Em branco = ilimitado"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={create}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
