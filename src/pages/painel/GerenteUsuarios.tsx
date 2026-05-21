import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard, PageContainer } from "@/components/painel/PageHeader";
import { Loader2, Users, ShieldCheck, Store, Search, UserCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Row = {
  id: string;
  email: string;
  display_name: string | null;
  reseller_id: string | null;
  created_at: string;
  roles: string[];
  reseller_name?: string;
};

export default function GerenteUsuarios() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "gerente" | "revendedor" | "cliente">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: profs }, { data: roles }, { data: resellers }] = await Promise.all([
        supabase.from("profiles").select("id,email,display_name,reseller_id,created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("resellers").select("id,display_name"),
      ]);
      const rolesByUser: Record<string, string[]> = {};
      (roles ?? []).forEach((r: any) => {
        rolesByUser[r.user_id] = [...(rolesByUser[r.user_id] ?? []), r.role];
      });
      const resellerName: Record<string, string> = {};
      (resellers ?? []).forEach((r: any) => { resellerName[r.id] = r.display_name; });
      setRows((profs ?? []).map((p: any) => ({
        ...p,
        roles: rolesByUser[p.id] ?? [],
        reseller_name: p.reseller_id ? resellerName[p.reseller_id] : undefined,
      })));
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => ({
    total: rows.length,
    gerentes: rows.filter((r) => r.roles.includes("gerente")).length,
    revendedores: rows.filter((r) => r.roles.includes("revendedor")).length,
    clientes: rows.filter((r) => !!r.reseller_id && r.roles.length === 0).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (filter !== "all") {
        if (filter === "cliente") {
          if (!r.reseller_id || r.roles.length > 0) return false;
        } else if (!r.roles.includes(filter)) return false;
      }
      if (!s) return true;
      return (
        (r.display_name ?? "").toLowerCase().includes(s) ||
        (r.email ?? "").toLowerCase().includes(s) ||
        (r.reseller_name ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, filter]);

  return (
    <PageContainer>
      <PageHeader
        title="Usuários"
        description="Visualize todos os usuários da plataforma, filtre por papel e identifique a quem cada um pertence."
        icon={Users}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={Users} hint="Usuários cadastrados" />
        <StatCard label="Gerentes" value={stats.gerentes} icon={ShieldCheck} hint="Acesso administrativo" />
        <StatCard label="Revendedores" value={stats.revendedores} icon={Store} hint="Operando lojas" />
        <StatCard label="Clientes" value={stats.clientes} icon={UserCircle2} hint="Vinculados a revendas" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, email ou revendedor..."
            className="pl-9 bg-white/5 border-white/10"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1 overflow-x-auto">
          {(["all", "gerente", "revendedor", "cliente"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                filter === f
                  ? "bg-primary text-primary-foreground shadow-glow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {f === "all" ? "Todos" : f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-sm overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-8 w-8 opacity-40" />
            Nenhum usuário encontrado.
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-[10px] uppercase tracking-widest text-muted-foreground/80">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Nome</th>
                    <th className="px-4 py-3 text-left font-bold">Email</th>
                    <th className="px-4 py-3 text-left font-bold">Papéis</th>
                    <th className="px-4 py-3 text-left font-bold">Revendedor</th>
                    <th className="px-4 py-3 text-left font-bold">Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/5">
                      <td className="px-4 py-3 font-medium">{r.display_name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.roles.length === 0
                            ? <span className="text-xs text-muted-foreground">Cliente</span>
                            : r.roles.map((role) => (
                                <Badge key={role} variant={role === "gerente" ? "default" : "secondary"} className="capitalize">
                                  {role}
                                </Badge>
                              ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.reseller_name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-white/5">
              {filtered.map((r) => (
                <div key={r.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{r.display_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {r.roles.length === 0
                        ? <Badge variant="outline" className="text-xs">Cliente</Badge>
                        : r.roles.map((role) => (
                            <Badge key={role} variant={role === "gerente" ? "default" : "secondary"} className="capitalize text-xs">{role}</Badge>
                          ))}
                    </div>
                  </div>
                  {r.reseller_name && (
                    <p className="text-[11px] text-muted-foreground">
                      Revendedor: <span className="text-foreground">{r.reseller_name}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}
