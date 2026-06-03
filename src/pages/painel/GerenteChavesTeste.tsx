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
import { Loader2, RefreshCw, Globe, Monitor, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  created_at: string;
  reseller_id: string;
  reseller_name: string | null;
  license_key: string | null;
  status: string;
  client_ip: string | null;
  user_agent: string | null;
  notes: string | null;
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
        .from("orders")
        .select("id, created_at, reseller_id, license_key, status, client_ip, user_agent, notes, resellers!orders_reseller_id_fkey(display_name)")
        .eq("is_test", true)
        .order("created_at", { ascending: false })
        .limit(500);
      if (r.hours > 0) {
        q = q.gte("created_at", new Date(Date.now() - r.hours * 3600_000).toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      setRows(
        (data ?? []).map((o: any) => ({
          id: o.id,
          created_at: o.created_at,
          reseller_id: o.reseller_id,
          reseller_name: o.resellers?.display_name ?? null,
          license_key: o.license_key,
          status: o.status,
          client_ip: o.client_ip,
          user_agent: o.user_agent,
          notes: o.notes,
        }))
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
    rows.forEach((r) => m.set(r.reseller_id, r.reseller_name ?? r.reseller_id.slice(0, 8)));
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (resellerFilter !== "all" && r.reseller_id !== resellerFilter) return false;
      if (ipFilter && !(r.client_ip ?? "").includes(ipFilter.trim())) return false;
      return true;
    });
  }, [rows, resellerFilter, ipFilter]);

  const grouped = useMemo(() => {
    const byIp = new Map<string, number>();
    filtered.forEach((r) => {
      const k = r.client_ip ?? "—";
      byIp.set(k, (byIp.get(k) ?? 0) + 1);
    });
    return Array.from(byIp.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [filtered]);

  const byReseller = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    filtered.forEach((r) => {
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
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="h-3 w-3" /> Top IPs</div>
          <div className="mt-2 space-y-1 text-xs">
            {grouped.length === 0 && <div className="text-muted-foreground">—</div>}
            {grouped.map(([ip, c]) => (
              <div key={ip} className="flex justify-between">
                <span className="font-mono">{ip}</span>
                <Badge variant={c >= 10 ? "destructive" : "secondary"}>{c}</Badge>
              </div>
            ))}
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
                <th className="text-left p-2">Chave</th>
                <th className="text-left p-2">IP</th>
                <th className="text-left p-2">User-Agent</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Sem chaves teste no período.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="p-2 whitespace-nowrap text-xs">
                    {new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </td>
                  <td className="p-2 text-xs">{r.reseller_name ?? r.reseller_id.slice(0, 8)}</td>
                  <td className="p-2 font-mono text-[11px] break-all max-w-[200px]">{r.license_key ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">{r.client_ip ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2 text-[11px] text-muted-foreground max-w-[260px] truncate" title={r.user_agent ?? ""}>
                    {r.user_agent ? (
                      <span className="inline-flex items-center gap-1"><Monitor className="h-3 w-3" />{r.user_agent}</span>
                    ) : "—"}
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