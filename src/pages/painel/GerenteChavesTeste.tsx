import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Globe, KeyRound, AlertTriangle, Phone, User } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  created_at: string;
  reseller_id: string | null;
  reseller_name: string | null;
  license_key: string | null;
  status: string;
  ip_address: string | null;
  buyer_name: string | null;
  phone: string | null;
};

const RANGES = [
  { value: "24h", label: "Últimas 24h", hours: 24 },
  { value: "7d", label: "Últimos 7 dias", hours: 24 * 7 },
  { value: "30d", label: "Últimos 30 dias", hours: 24 * 30 },
  { value: "all", label: "Todos", hours: 0 },
];

export default function GerenteChavesTeste() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState("24h");
  const [resellerFilter, setResellerFilter] = useState<string>("all");
  const [ipFilter, setIpFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = RANGES.find((x) => x.value === range)!;
      let q = supabase
        .from("trial_registrations")
        .select("id, created_at, name, phone, ip_address, license_key")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (r.hours > 0) {
        q = q.gte("created_at", new Date(Date.now() - r.hours * 3600_000).toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;

      const keys = Array.from(new Set((data ?? []).map((d: any) => d.license_key).filter(Boolean)));
      const orderMap = new Map<string, { reseller_id: string | null; reseller_name: string | null; status: string }>();
      if (keys.length) {
        const { data: ords } = await supabase
          .from("orders")
          .select("license_key, reseller_id, status, resellers!orders_reseller_id_fkey(display_name)")
          .in("license_key", keys);
        (ords ?? []).forEach((o: any) => {
          orderMap.set(o.license_key, {
            reseller_id: o.reseller_id,
            reseller_name: o.resellers?.display_name ?? null,
            status: o.status,
          });
        });
      }

      setRows(
        (data ?? []).map((t: any) => {
          const ord = t.license_key ? orderMap.get(t.license_key) : undefined;
          return {
            id: t.id,
            created_at: t.created_at,
            reseller_id: ord?.reseller_id ?? null,
            reseller_name: ord?.reseller_name ?? null,
            license_key: t.license_key,
            status: ord?.status ?? "—",
            ip_address: t.ip_address ?? null,
            buyer_name: t.name ?? null,
            phone: t.phone ?? null,
          };
        })
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range]);

  const resellers = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.reseller_id) m.set(r.reseller_id, r.reseller_name ?? r.reseller_id.slice(0, 8));
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (resellerFilter !== "all" && r.reseller_id !== resellerFilter) return false;
      if (ipFilter && !(r.ip_address ?? "").includes(ipFilter.trim())) return false;
      return true;
    });
  }, [rows, resellerFilter, ipFilter]);

  // IPs suspeitos: 2+ trials no período, com nomes/lojas usados
  const suspiciousIps = useMemo(() => {
    const byIp = new Map<string, {
      count: number;
      names: Set<string>;
      resellers: Set<string>;
      phones: Set<string>;
    }>();
    filtered.forEach((r) => {
      const k = r.ip_address;
      if (!k || k === "0.0.0.0") return;
      const cur = byIp.get(k) ?? { count: 0, names: new Set(), resellers: new Set(), phones: new Set() };
      cur.count++;
      if (r.buyer_name) cur.names.add(r.buyer_name);
      if (r.reseller_name) cur.resellers.add(r.reseller_name);
      if (r.phone) cur.phones.add(r.phone);
      byIp.set(k, cur);
    });
    return Array.from(byIp.entries())
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20)
      .map(([ip, v]) => ({
        ip,
        count: v.count,
        names: Array.from(v.names),
        resellers: Array.from(v.resellers),
        phones: Array.from(v.phones),
      }));
  }, [filtered]);

  const byReseller = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    filtered.forEach((r) => {
      if (!r.reseller_id) return;
      const cur = m.get(r.reseller_id) ?? { name: r.reseller_name ?? r.reseller_id.slice(0, 8), count: 0 };
      cur.count++;
      m.set(r.reseller_id, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [filtered]);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Período</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Revendedor</Label>
            <Select value={resellerFilter} onValueChange={setResellerFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({resellers.length})</SelectItem>
                {resellers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Filtro de IP</Label>
            <Input value={ipFilter} onChange={(e) => setIpFilter(e.target.value)} placeholder="ex: 187.45." />
          </div>
          <div className="flex items-end">
            <Button onClick={load} variant="outline" disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total no período</div>
          <div className="mt-1 text-3xl font-bold">{filtered.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> IPs únicos</div>
          <div className="mt-1 text-3xl font-bold">
            {new Set(filtered.map((f) => f.ip_address).filter((x) => x && x !== "0.0.0.0")).size}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Top revendedores</div>
          <div className="mt-2 space-y-1 text-xs">
            {byReseller.length === 0 && <div className="text-muted-foreground">—</div>}
            {byReseller.map((r, i) => (
              <div key={i} className="flex justify-between">
                <span className="truncate">{r.name}</span>
                <Badge variant={r.count >= 20 ? "destructive" : "secondary"}>{r.count}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {suspiciousIps.length > 0 && (
        <Card className="overflow-hidden border-destructive/40">
          <div className="border-b p-3 font-semibold flex items-center gap-2 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            IPs suspeitos — 2 ou mais trials no período ({suspiciousIps.length})
          </div>
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left p-2">IP</th>
                  <th className="text-left p-2">Qtd</th>
                  <th className="text-left p-2">Lojas</th>
                  <th className="text-left p-2">Nomes usados</th>
                  <th className="text-left p-2">Telefones</th>
                </tr>
              </thead>
              <tbody>
                {suspiciousIps.map((s) => (
                  <tr key={s.ip} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-2 font-mono text-xs whitespace-nowrap">
                      <button
                        onClick={() => setIpFilter(s.ip)}
                        className="hover:underline text-left"
                      >
                        {s.ip}
                      </button>
                    </td>
                    <td className="p-2">
                      <Badge variant={s.count >= 5 ? "destructive" : s.count >= 3 ? "default" : "secondary"}>
                        {s.count}
                      </Badge>
                    </td>
                    <td className="p-2 text-xs">
                      {s.resellers.length > 1 ? (
                        <Badge variant="destructive">{s.resellers.length} lojas</Badge>
                      ) : (
                        <span className="text-muted-foreground">{s.resellers[0] ?? "—"}</span>
                      )}
                    </td>
                    <td className="p-2 text-xs max-w-[280px] truncate" title={s.names.join(", ")}>
                      {s.names.join(", ") || "—"}
                    </td>
                    <td className="p-2 text-xs font-mono">
                      {s.phones.length === 0 ? "—" : s.phones.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b p-3 font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Chaves teste ({filtered.length})
        </div>
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left p-2">Data</th>
                <th className="text-left p-2">Revendedor</th>
                <th className="text-left p-2">Nome</th>
                <th className="text-left p-2">Telefone</th>
                <th className="text-left p-2">Chave</th>
                <th className="text-left p-2">IP</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sem chaves teste no período.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-2 whitespace-nowrap text-xs">
                    {new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </td>
                  <td className="p-2 text-xs">{r.reseller_name ?? (r.reseller_id ? r.reseller_id.slice(0, 8) : "—")}</td>
                  <td className="p-2 text-xs max-w-[160px] truncate" title={r.buyer_name ?? ""}>
                    {r.buyer_name ? (
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{r.buyer_name}</span>
                    ) : "—"}
                  </td>
                  <td className="p-2 text-xs font-mono">
                    {r.phone ? (
                      <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.phone}</span>
                    ) : "—"}
                  </td>
                  <td className="p-2 font-mono text-[11px] break-all max-w-[200px]">{r.license_key ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">
                    {r.ip_address ? (
                      <button onClick={() => setIpFilter(r.ip_address!)} className="hover:underline">
                        {r.ip_address}
                      </button>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2">
                    {r.status === "completed" ? (
                      <Badge variant="secondary">ok</Badge>
                    ) : r.status === "failed" ? (
                      <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />falha</Badge>
                    ) : (
                      <Badge variant="outline">{r.status}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}