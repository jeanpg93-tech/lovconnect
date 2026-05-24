import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Loader2, Settings2, Wallet, ChevronDown, ChevronUp, Store, Ban, Trash2, Crown, Eye, RotateCcw, Search, TrendingUp, Medal, Trophy, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Reseller = {
  id: string; user_id: string; display_name: string; slug: string; is_active: boolean; test_keys_used_today: number; test_keys_per_day_override: number | null; activation_status?: string | null;
};
type Profile = { id: string; email: string; display_name: string | null; phone: string | null; is_banned: boolean | null };
type Tier = { id: string; name: string; color: string; min_spent_cents: number; is_active: boolean; is_hidden: boolean; test_keys_per_day: number; sort_order: number };
type State = { reseller_id: string; total_spent_cents: number; forced_tier_id: string | null };

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const formatBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);

const firstLastName = (name: string | null | undefined) => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
};

const formatPhoneBR = (phone: string | null | undefined) => {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const d = digits.slice(2);
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
};

const ActivationBadge = ({ status }: { status?: string | null }) => {
  const s = status ?? "awaiting_payment";
  const map: Record<string, { label: string; cls: string; Icon: any }> = {
    active: { label: "Pago", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", Icon: CheckCircle2 },
    payment_under_review: { label: "Em análise", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30", Icon: Clock },
    payment_rejected: { label: "Rejeitado", cls: "bg-rose-500/15 text-rose-500 border-rose-500/30", Icon: XCircle },
    awaiting_payment: { label: "Aguardando pgto", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30", Icon: AlertCircle },
  };
  const { label, cls, Icon } = map[s] ?? map.awaiting_payment;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap", cls)}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
};

export default function GerenteRevendedores() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [profilesByUser, setProfilesByUser] = useState<Record<string, Profile>>({});
  const [balancesByReseller, setBalancesByReseller] = useState<Record<string, number>>({});
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [states, setStates] = useState<Record<string, State>>({});
  const [monthlyRanking, setMonthlyRanking] = useState<{ reseller_id: string; total_spent_cents: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileExpandedRow, setMobileExpandedRow] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedResellerId, setSelectedResellerId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const [balanceDialog, setBalanceDialog] = useState<Reseller | null>(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceDescription, setBalanceDescription] = useState("");
  const [balanceSaving, setBalanceSaving] = useState(false);

  const [testKeysDialog, setTestKeysDialog] = useState<Reseller | null>(null);
  const [testKeysOverride, setTestKeysOverride] = useState("");
  const [testKeysSaving, setTestKeysSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: rs } = await supabase.from("resellers").select("*").order("created_at", { ascending: false });
    const list = rs ?? [];
    setResellers(list);
    
    const [{ data: t }, { data: s }, { data: rankingData }] = await Promise.all([
      supabase.from("reseller_tiers").select("*").order("sort_order"),
      supabase.from("reseller_tier_state").select("*"),
      supabase.rpc("get_reseller_ranking_v2", { start_date: startOfMonth.toISOString() }),
    ]);
    
    setTiers((t ?? []) as Tier[]);
    const smap: Record<string, State> = {};
    (s ?? []).forEach((row: any) => { smap[row.reseller_id] = row; });
    setStates(smap);
    setMonthlyRanking((rankingData ?? []) as { reseller_id: string; total_spent_cents: number }[]);

    if (list.length) {
      const userIds = list.map((r) => r.user_id);
      const resellerIds = list.map((r) => r.id);
      const [{ data: profs }, { data: bals }] = await Promise.all([
        supabase.from("profiles").select("id,email,display_name,phone,is_banned").in("id", userIds),
        supabase.from("reseller_balances").select("reseller_id,balance_cents").in("reseller_id", resellerIds),
      ]);
      const pmap: Record<string, Profile> = {};
      (profs ?? []).forEach((p: any) => { pmap[p.id] = p as Profile; });
      setProfilesByUser(pmap);
      const bmap: Record<string, number> = {};
      (bals ?? []).forEach((b: any) => { bmap[b.reseller_id] = Number(b.balance_cents) || 0; });
      setBalancesByReseller(bmap);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!email.trim() || !displayName.trim()) return toast.error("Preencha email e nome");
    setSaving(true);
    const { data: prof, error: profErr } = await supabase
      .from("profiles").select("id").eq("email", email.trim()).maybeSingle();
    if (profErr || !prof) {
      setSaving(false);
      return toast.error("Usuário não encontrado. Ele precisa criar a conta primeiro em /auth.");
    }
    const { error: rErr } = await supabase.from("resellers").insert({
      user_id: prof.id,
      display_name: displayName.trim(),
      slug: (slug || slugify(displayName)).trim(),
      is_active: true,
    });
    if (rErr) { setSaving(false); return toast.error(rErr.message); }
    const { error: roleErr } = await supabase.from("user_roles").insert({
      user_id: prof.id, role: "revendedor",
    });
    setSaving(false);
    if (roleErr && !roleErr.message.includes("duplicate")) return toast.error(roleErr.message);
    toast.success("Revendedor criado");
    setOpen(false);
    setEmail(""); setDisplayName(""); setSlug("");
    load();
  };

  const toggleActive = async (r: Reseller) => {
    const prof = profilesByUser[r.user_id];
    if (prof?.is_banned && !r.is_active) {
      return toast.error("Não é possível ativar um revendedor banido. Desba primeiro.");
    }
    const { error } = await supabase.from("resellers").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setResellers(prev => prev.map(item => item.id === r.id ? { ...item, is_active: !r.is_active } : item));
    toast.success(!r.is_active ? "Revendedor ativado" : "Revendedor desativado");
  };

  const toggleBan = async (r: Reseller) => {
    const prof = profilesByUser[r.user_id];
    if (!prof) return;
    const isCurrentlyBanned = !!prof.is_banned;
    if (!isCurrentlyBanned && r.is_active) {
      return toast.error("Não é possível banir um revendedor ativo. Desative-o primeiro.");
    }
    if (!confirm(`Tem certeza que deseja ${isCurrentlyBanned ? "remover o banimento" : "banir"} este revendedor?`)) return;
    const { error } = await supabase.from("profiles").update({ is_banned: !isCurrentlyBanned }).eq("id", r.user_id);
    if (error) return toast.error(error.message);
    setProfilesByUser(prev => ({ ...prev, [r.user_id]: { ...prof, is_banned: !isCurrentlyBanned } }));
    toast.success(isCurrentlyBanned ? "Banimento removido" : "Revendedor banido");
  };

  const deleteReseller = async (r: Reseller) => {
    if (!confirm(`Tem certeza que deseja EXCLUIR este revendedor? Esta ação é irreversível e removerá o acesso ao painel.`)) return;
    const { error } = await supabase.from("resellers").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    await supabase.from("user_roles").delete().eq("user_id", r.user_id).eq("role", "revendedor");
    setResellers(prev => prev.filter(item => item.id !== r.id));
    toast.success("Revendedor excluído com sucesso");
  };

  const openBalance = (r: Reseller) => {
    setBalanceDialog(r);
    setBalanceAmount("");
    setBalanceDescription("");
  };

  const addBalance = async () => {
    if (!balanceDialog) return;
    const value = parseFloat(balanceAmount.replace(",", "."));
    if (!isFinite(value) || value === 0) return toast.error("Informe um valor válido (use negativo para debitar)");
    const cents = Math.round(value * 100);
    setBalanceSaving(true);
    const current = balancesByReseller[balanceDialog.id] ?? 0;
    const newBalance = current + cents;
    const { error: upErr } = await supabase
      .from("reseller_balances")
      .upsert({ reseller_id: balanceDialog.id, balance_cents: newBalance }, { onConflict: "reseller_id" });
    if (upErr) { setBalanceSaving(false); return toast.error(upErr.message); }
    await supabase.from("balance_transactions").insert({
      reseller_id: balanceDialog.id,
      kind: cents > 0 ? "manual_credit" : "manual_debit",
      amount_cents: cents,
      description: balanceDescription.trim() || (cents > 0 ? "Recarga manual pelo gerente" : "Débito manual pelo gerente"),
    });
    setBalanceSaving(false);
    setBalancesByReseller(prev => ({ ...prev, [balanceDialog.id]: newBalance }));
    toast.success("Saldo atualizado");
    setBalanceDialog(null);
  };

  const resetTestKeys = async (r: Reseller) => {
    if (!confirm(`Deseja resetar o contador de chaves teste de ${r.display_name}?`)) return;
    const { error } = await supabase.from("resellers").update({ test_keys_used_today: 0 }).eq("id", r.id);
    if (error) return toast.error(error.message);
    setResellers(prev => prev.map(item => item.id === r.id ? { ...item, test_keys_used_today: 0 } : item));
    toast.success("Contador de chaves teste resetado");
  };

  const openTestKeysConfig = (r: Reseller) => {
    setTestKeysDialog(r);
    setTestKeysOverride(r.test_keys_per_day_override?.toString() || "");
  };

  const saveTestKeysConfig = async () => {
    if (!testKeysDialog) return;
    const value = testKeysOverride === "" ? null : parseInt(testKeysOverride);
    if (testKeysOverride !== "" && isNaN(value!)) return toast.error("Informe um número válido");
    setTestKeysSaving(true);
    const { error } = await supabase.from("resellers").update({ test_keys_per_day_override: value }).eq("id", testKeysDialog.id);
    setTestKeysSaving(false);
    if (error) return toast.error(error.message);
    setResellers(prev => prev.map(item => item.id === testKeysDialog.id ? { ...item, test_keys_per_day_override: value } : item));
    toast.success("Limite de chaves teste atualizado");
    setTestKeysDialog(null);
  };

  const tierFor = (resellerId: string): Tier | null => {
    const st = states[resellerId];
    const spent = st?.total_spent_cents || 0;
    if (st?.forced_tier_id) {
      return tiers.find((t) => t.id === st.forced_tier_id) ?? null;
    }
    const eligible = tiers.filter((t) => t.is_active && !t.is_hidden && t.min_spent_cents <= spent);
    const calculated = eligible.sort((a, b) => b.min_spent_cents - a.min_spent_cents)[0] ?? null;
    // Aplica bonus_min_tier_id como piso mínimo
    const reseller = resellers.find((r) => r.id === resellerId);
    const bonusId = (reseller as any)?.bonus_min_tier_id;
    if (bonusId) {
      const bonus = tiers.find((t) => t.id === bonusId && t.is_active) ?? null;
      if (bonus && (!calculated || (bonus.sort_order ?? 0) > (calculated.sort_order ?? -1))) {
        return bonus;
      }
    }
    return calculated;
  };

  const tierProgressFor = (resellerId: string) => {
    const st = states[resellerId];
    if (st?.forced_tier_id) return null;
    const spent = st?.total_spent_cents || 0;
    const currentTier = tierFor(resellerId);
    
    const next = tiers
      .filter((t) => t.is_active && !t.is_hidden && t.min_spent_cents > spent)
      .sort((a, b) => a.min_spent_cents - b.min_spent_cents)[0];

    if (!next) return null;
    
    const minForNext = next.min_spent_cents;
    const minForCurrent = currentTier?.min_spent_cents || 0;
    const progress = Math.min(100, Math.max(0, ((spent - minForCurrent) / (minForNext - minForCurrent)) * 100));
    return { progress, nextTierName: next.name };
  };

  const filteredResellers = resellers.filter(r => {
    const matchesSearch = r.display_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         profilesByUser[r.user_id]?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSelected = !selectedResellerId || r.id === selectedResellerId;
    return matchesSearch && matchesSelected;
  });

  const rankedResellers = useMemo(() => {
    const HIDDEN = new Set(["jeanpg.93"]);
    return monthlyRanking
      .map(item => {
        const reseller = resellers.find(r => r.id === item.reseller_id);
        return { 
          id: item.reseller_id, 
          display_name: reseller?.display_name || "Desconhecido",
          slug: (reseller as any)?.slug as string | undefined,
          total_spent_cents: item.total_spent_cents 
        };
      })
      .filter(r => !HIDDEN.has(r.display_name.toLowerCase()) && !HIDDEN.has((r.slug ?? "").toLowerCase()))
      .sort((a, b) => b.total_spent_cents - a.total_spent_cents);
  }, [monthlyRanking, resellers]);

  return (
    <PageContainer>
      <PageHeader
        title="Revendedores"
        description="Gerencie sua rede de parceiros, promova usuários e controle o saldo de cada revenda."
        icon={Store}
        actions={
          <Button 
            onClick={() => setOpen(true)} 
            className="h-10 px-6 gap-2 bg-primary text-primary-foreground font-bold uppercase tracking-widest shadow-glow-sm hover:scale-[1.02] transition-all rounded-xl"
          >
            <Plus className="h-5 w-5" /> Novo revendedor
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Pesquisar por nome ou email..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12 bg-card/60 border-border rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          <select 
            value={selectedResellerId || ""} 
            onChange={(e) => setSelectedResellerId(e.target.value || null)}
            className="flex-1 h-12 px-4 bg-card/60 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Todos os revendedores</option>
            {resellers.map(r => (
              <option key={r.id} value={r.id}>{r.display_name}</option>
            ))}
          </select>
          {selectedResellerId && (
            <Button variant="ghost" onClick={() => setSelectedResellerId(null)} className="h-12 px-4 rounded-xl border border-border">Limpar</Button>
          )}
        </div>
      </div>

      <div className="mb-8 overflow-hidden rounded-2xl border border-border bg-card/60 shadow-sm transition-all duration-300">
        <div className="bg-white/5 px-6 py-4 flex items-center justify-between border-b border-border">
          <div className="flex flex-col">
            <h2 className="font-display font-black uppercase tracking-tighter text-lg flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Ranking Mensal ({new Date().toLocaleString('pt-BR', { month: 'long' })})
            </h2>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mt-0.5">Baseado em depósitos realizados este mês</p>
          </div>
          <Trophy className="h-6 w-6 text-primary/40" />
        </div>
        <div className="p-3 md:p-6">
          <div className="grid grid-cols-3 gap-2 md:gap-6">
            {rankedResellers.slice(0, 3).map((r, index) => {
              const rankColors = ["text-amber-500", "text-slate-400", "text-amber-700"];
              const rankBorders = ["border-amber-500/20", "border-slate-400/20", "border-amber-700/20"];
              return (
                <div key={r.id} className={cn("relative group p-2 md:p-4 rounded-xl md:rounded-2xl border bg-white/5 flex flex-col md:flex-row items-center text-center md:text-left md:items-center gap-1 md:gap-4 transition-all hover:scale-[1.02] hover:bg-white/10", rankBorders[index])}>
                  <div className={`text-xl md:text-3xl font-black italic ${rankColors[index] || "text-muted-foreground"}`}>#{index + 1}</div>
                  <div className="flex-1 min-w-0 w-full">
                    <div className="font-bold truncate text-[10px] md:text-sm text-foreground">{r.display_name}</div>
                    <div className="text-[8px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                      <span className="hidden sm:inline">Este mês: </span>
                      <span className="font-mono font-bold text-primary block sm:inline">{formatBRL(r.total_spent_cents)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {rankedResellers.length === 0 && <div className="text-center py-4 text-sm text-muted-foreground">Nenhum depósito registrado este mês.</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 shadow-sm overflow-hidden transition-all duration-300">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : filteredResellers.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum revendedor cadastrado.</div>
        ) : (
          <>
            <TooltipProvider delayDuration={150}>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-[10px] uppercase font-black tracking-[0.2em] text-muted-foreground/60">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Nome</th>
                    <th className="px-6 py-4 text-left font-semibold">Usuário</th>
                    <th className="px-6 py-4 text-left font-semibold">Pagamento</th>
                    <th className="px-6 py-4 text-left font-semibold">Email</th>
                    <th className="px-6 py-4 text-left font-semibold">WhatsApp</th>
                    <th className="px-6 py-4 text-center font-semibold">Nível</th>
                    <th className="px-6 py-4 text-center font-semibold">Progresso</th>
                    <th className="px-6 py-4 text-center font-semibold">Teste (Uso/Limite)</th>
                    <th className="px-6 py-4 text-center font-semibold">Ativo</th>
                    <th className="px-6 py-4 text-right font-semibold">Saldo</th>
                    <th className="px-6 py-4 text-center font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredResellers.map((r) => {
                    const prof = profilesByUser[r.user_id];
                    const balance = balancesByReseller[r.id] ?? 0;
                    const tier = tierFor(r.id);
                    const progress = tierProgressFor(r.id);
                    return (
                      <tr key={r.id} className="group transition-all duration-300 hover:bg-white/5">
                        <td className="px-6 py-4 font-medium text-foreground">{firstLastName(prof?.display_name)}</td>
                        <td className="px-6 py-4 text-muted-foreground/80">{r.display_name}</td>
                        <td className="px-6 py-4"><ActivationBadge status={r.activation_status} /></td>
                        <td className="px-6 py-4 text-muted-foreground/80">{prof?.email ?? "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground/80 font-mono text-xs whitespace-nowrap">{formatPhoneBR(prof?.phone)}</td>
                        <td className="px-6 py-4 text-center">
                          {tier ? (
                            <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ background: `${tier.color}22`, color: tier.color }}>
                              <Crown className="h-3 w-3" /> {tier.name}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-6 py-4 text-center min-w-[150px]">
                          {progress ? (
                            <div className="space-y-1">
                              <Progress value={progress.progress} className="h-1.5" />
                              <p className="text-[9px] text-muted-foreground">Próximo: {progress.nextTierName}</p>
                            </div>
                          ) : <span className="text-[10px] text-muted-foreground">Nível Máximo</span>}
                        </td>
                         <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold">{r.test_keys_used_today} / {r.test_keys_per_day_override || tier?.test_keys_per_day || 0}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 rounded-md hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                    onClick={() => openTestKeysConfig(r)}
                                  >
                                    <Settings2 className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Configurar limite diário de chaves de teste</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6 rounded-md hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                    onClick={() => resetTestKeys(r)}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Zerar contador de chaves de teste usadas hoje</TooltipContent>
                              </Tooltip>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex"><Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} /></span>
                            </TooltipTrigger>
                            <TooltipContent>{r.is_active ? "Revendedor ativo — clique para suspender" : "Revendedor suspenso — clique para ativar"}</TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-primary">{formatBRL(balance)}</td>
                        <td className="px-6 py-4 text-center">
                          <TooltipProvider delayDuration={150}>
                            <div className="flex justify-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" onClick={() => openBalance(r)}><Wallet className="h-4 w-4" /></Button>
                                </TooltipTrigger>
                                <TooltipContent>Ajustar saldo do revendedor</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="ghost" onClick={() => deleteReseller(r)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                </TooltipTrigger>
                                <TooltipContent>Excluir revendedor</TooltipContent>
                              </Tooltip>
                            </div>
                          </TooltipProvider>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </TooltipProvider>
            <div className="md:hidden divide-y divide-white/5">
              {filteredResellers.map((r) => {
                const prof = profilesByUser[r.user_id];
                const balance = balancesByReseller[r.id] ?? 0;
                const tier = tierFor(r.id);
                const progress = tierProgressFor(r.id);
                return (
                  <div key={r.id} className="p-4 space-y-4 border-b border-white/5 bg-white/5 rounded-xl mb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-foreground">{firstLastName(prof?.display_name)}</h3>
                        <p className="text-[11px] text-muted-foreground">@{r.display_name}</p>
                        <p className="text-xs text-muted-foreground">{prof?.email ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">{formatPhoneBR(prof?.phone)}</p>
                        <div className="mt-2"><ActivationBadge status={r.activation_status} /></div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-primary block">{formatBRL(balance)}</span>
                        <div className="mt-1">
                           <Switch className="scale-75 origin-right" checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground/60">Nível</p>
                        {tier && (
                          <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest" style={{ background: `${tier.color}22`, color: tier.color }}>
                            {tier.name}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground/60">Chaves Teste</p>
                        <p className="text-xs font-mono font-bold">{r.test_keys_used_today} / {r.test_keys_per_day_override || tier?.test_keys_per_day || 0}</p>
                      </div>
                    </div>

                    {progress && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          <span>Progresso</span>
                          <span>{progress.nextTierName}</span>
                        </div>
                        <Progress value={progress.progress} className="h-1.5" />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button className="flex-1 h-9 rounded-lg" size="sm" variant="secondary" onClick={() => openBalance(r)}>
                        <Wallet className="mr-2 h-4 w-4" /> Saldo
                      </Button>
                      <Button className="flex-1 h-9 rounded-lg" size="sm" variant="secondary" onClick={() => openTestKeysConfig(r)}>
                        <Settings2 className="mr-2 h-4 w-4" /> Limite
                      </Button>
                      <Button size="icon" variant="destructive" className="h-9 w-9 rounded-lg shrink-0" onClick={() => deleteReseller(r)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo revendedor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            <Label>Nome</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={saving}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!balanceDialog} onOpenChange={(v) => !v && setBalanceDialog(null)}>
        <DialogContent className="bg-card border-white/10 shadow-glow-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-black uppercase tracking-tighter flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Ajustar saldo de {balanceDialog?.display_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm">
              Saldo atual:{" "}
              <span className="font-mono font-semibold">
                {formatBRL(balanceDialog ? balancesByReseller[balanceDialog.id] ?? 0 : 0)}
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                placeholder="Ex.: 50,00 (ou -10,00 para debitar)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input
                value={balanceDescription}
                onChange={(e) => setBalanceDescription(e.target.value)}
                placeholder="Motivo do ajuste"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setBalanceDialog(null)} className="uppercase text-[10px] font-bold tracking-widest">Cancelar</Button>
            <Button
              onClick={addBalance}
              disabled={balanceSaving}
              className="bg-primary text-primary-foreground font-black uppercase tracking-widest shadow-glow-sm hover:scale-[1.02] transition-all"
            >
              {balanceSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!testKeysDialog} onOpenChange={(v) => !v && setTestKeysDialog(null)}>
        <DialogContent className="bg-card border-white/10 shadow-glow-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-black uppercase tracking-tighter flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Chaves Teste: {testKeysDialog?.display_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Limite diário de chaves teste</Label>
              <Input
                type="number"
                value={testKeysOverride}
                onChange={(e) => setTestKeysOverride(e.target.value)}
                placeholder="Ex.: 10 (Deixe vazio para usar o limite do nível)"
              />
              <p className="text-[10px] text-muted-foreground">
                O limite atual do nível {tierFor(testKeysDialog?.id || "")?.name} é {tierFor(testKeysDialog?.id || "")?.test_keys_per_day || 0}.
              </p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="text-sm">Resetar uso de hoje ({testKeysDialog?.test_keys_used_today || 0})</div>
              <Button size="sm" variant="outline" onClick={() => { resetTestKeys(testKeysDialog!); setTestKeysDialog(null); }}>
                Resetar Agora
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setTestKeysDialog(null)} className="uppercase text-[10px] font-bold tracking-widest">Cancelar</Button>
            <Button
              onClick={saveTestKeysConfig}
              disabled={testKeysSaving}
              className="bg-primary text-primary-foreground font-black uppercase tracking-widest shadow-glow-sm hover:scale-[1.02] transition-all"
            >
              {testKeysSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
