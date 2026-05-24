import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Check,
  X,
  UserCheck,
  Users,
  Clock,
  ShieldX,
  Search,
} from "lucide-react";
import { toast } from "sonner";

type Pending = {
  id: string;
  email: string | null;
  display_name: string | null;
  affiliate_code_used: string | null;
  approval_status: string;
  created_at: string;
};

type ReferrerInfo = { name: string; type: "reseller" | "campaign" };

export default function GerenteAprovacoes() {
  const [rows, setRows] = useState<Pending[]>([]);
  const [referrers, setReferrers] = useState<Record<string, ReferrerInfo>>({});
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "rejected" | "all">("pending");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("profiles")
      .select("id,email,display_name,affiliate_code_used,approval_status,created_at")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("approval_status", filter);
    const [{ data, error }, allCounts] = await Promise.all([
      q,
      supabase.from("profiles").select("approval_status"),
    ]);
    if (error) toast.error(error.message);
    const list = (data ?? []) as Pending[];
    setRows(list);

    // Carrega informações de quem indicou
    const codes = Array.from(
      new Set(list.map((r) => r.affiliate_code_used).filter(Boolean) as string[])
    );
    if (codes.length) {
      const { data: affs } = await supabase
        .from("affiliate_codes")
        .select("code,label,owner_reseller_id, resellers:owner_reseller_id(display_name)")
        .in("code", codes);
      const map: Record<string, ReferrerInfo> = {};
      (affs ?? []).forEach((a: any) => {
        const name = a.resellers?.display_name || a.label || "Campanha";
        map[String(a.code).toUpperCase()] = {
          name,
          type: a.owner_reseller_id ? "reseller" : "campaign",
        };
      });
      setReferrers(map);
    } else {
      setReferrers({});
    }

    const all = allCounts.data ?? [];
    setCounts({
      total: all.length,
      pending: all.filter((p: any) => p.approval_status === "pending").length,
      approved: all.filter((p: any) => p.approval_status === "approved").length,
      rejected: all.filter((p: any) => p.approval_status === "rejected").length,
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const approve = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("approve_user", { _user_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Usuário aprovado como revendedor");
    load();
  };

  const reject = async (id: string) => {
    if (!confirm("Rejeitar este cadastro?")) return;
    setBusy(id);
    const { error } = await supabase.rpc("reject_user", { _user_id: id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Cadastro rejeitado");
    load();
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.display_name ?? "").toLowerCase().includes(s) ||
        (r.email ?? "").toLowerCase().includes(s) ||
        (r.affiliate_code_used ?? "").toLowerCase().includes(s) ||
        (referrers[(r.affiliate_code_used ?? "").toUpperCase()]?.name ?? "")
          .toLowerCase()
          .includes(s)
    );
  }, [rows, search, referrers]);

  return (
    <PageContainer>
      <PageHeader
        title="Aprovações"
        description="Aprove ou rejeite novos cadastros de revendedores e mantenha a rede saudável."
        icon={UserCheck}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total" value={counts.total} icon={Users} hint="Usuários cadastrados" />
        <StatCard label="Pendentes" value={counts.pending} icon={Clock} hint="Aguardando análise" />
        <StatCard label="Aprovados" value={counts.approved} icon={Check} hint="Em operação" />
        <StatCard label="Rejeitados" value={counts.rejected} icon={ShieldX} hint="Bloqueados" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou código..."
            className="pl-9 bg-white/5 border-white/10"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 self-stretch sm:self-auto">
          {(["pending", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 sm:flex-none rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                filter === f
                  ? "bg-primary text-primary-foreground shadow-glow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {f === "pending" ? "Pendentes" : f === "rejected" ? "Rejeitados" : "Todos"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/60 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <UserCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Nenhum cadastro encontrado.
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-foreground/80">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Nome</th>
                    <th className="px-4 py-3 text-left font-bold">Email</th>
                    <th className="px-4 py-3 text-left font-bold">Código</th>
                    <th className="px-4 py-3 text-left font-bold">Indicado por</th>
                    <th className="px-4 py-3 text-left font-bold">Status</th>
                    <th className="px-4 py-3 text-left font-bold">Data</th>
                    <th className="px-4 py-3 text-right font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/5">
                      <td className="px-4 py-3 font-medium">{r.display_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                      <td className="px-4 py-3">
                        {r.affiliate_code_used ? (
                          <code className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 font-mono text-xs text-primary">
                            {r.affiliate_code_used}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const ref = referrers[(r.affiliate_code_used ?? "").toUpperCase()];
                          if (!ref) return <span className="text-muted-foreground">—</span>;
                          return (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{ref.name}</span>
                              {ref.type === "campaign" && (
                                <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                                  Campanha
                                </Badge>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={r.approval_status === "approved" ? "default" : r.approval_status === "rejected" ? "destructive" : "secondary"}
                          className="capitalize"
                        >
                          {r.approval_status === "pending" ? "Pendente" : r.approval_status === "approved" ? "Aprovado" : "Rejeitado"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {r.approval_status !== "approved" && (
                            <Button
                              size="sm"
                              disabled={busy === r.id}
                              onClick={() => approve(r.id)}
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                            >
                              {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" />Aprovar</>}
                            </Button>
                          )}
                          {r.approval_status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === r.id}
                              onClick={() => reject(r.id)}
                              className="text-destructive border-destructive/40 hover:bg-destructive/10"
                            >
                              <X className="mr-1 h-3.5 w-3.5" />Rejeitar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-white/5">
              {filtered.map((r) => (
                <div key={r.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{r.display_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                    <Badge
                      variant={r.approval_status === "approved" ? "default" : r.approval_status === "rejected" ? "destructive" : "secondary"}
                      className="capitalize shrink-0"
                    >
                      {r.approval_status === "pending" ? "Pendente" : r.approval_status === "approved" ? "Aprovado" : "Rejeitado"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                    {r.affiliate_code_used && (
                      <code className="rounded bg-primary/10 border border-primary/20 px-1.5 py-0.5 font-mono text-primary">
                        {r.affiliate_code_used}
                      </code>
                    )}
                  </div>
                  {(() => {
                    const ref = referrers[(r.affiliate_code_used ?? "").toUpperCase()];
                    if (!ref) return null;
                    return (
                      <div className="text-[11px] text-muted-foreground">
                        Indicado por: <span className="text-foreground font-medium">{ref.name}</span>
                        {ref.type === "campaign" && " (campanha)"}
                      </div>
                    );
                  })()}
                  <div className="flex gap-2">
                    {r.approval_status !== "approved" && (
                      <Button
                        size="sm"
                        disabled={busy === r.id}
                        onClick={() => approve(r.id)}
                        className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" />Aprovar</>}
                      </Button>
                    )}
                    {r.approval_status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === r.id}
                        onClick={() => reject(r.id)}
                        className="flex-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                      >
                        <X className="mr-1 h-3.5 w-3.5" />Rejeitar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
