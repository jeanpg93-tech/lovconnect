import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, Wallet, Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Reseller = { id: string; display_name: string; slug: string };
type Ext = { id: string; name: string };
type Price = { id: string; extension_id: string; license_type: string; price_cents: number; is_active: boolean };

const LICENSE_TYPES = [
  { value: "pro_1d", label: "Pro 1 dia" },
  { value: "pro_7d", label: "Pro 7 dias" },
  { value: "pro_15d", label: "Pro 15 dias" },
  { value: "pro_30d", label: "Pro 30 dias" },
  { value: "lifetime", label: "Vitalícia" },
];

export default function GerenteRevendedorPrecos() {
  const [resellers, setResellers] = useState<Reseller[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [extensions, setExtensions] = useState<Ext[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmt, setCreditAmt] = useState("100,00");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("resellers").select("id,display_name,slug").order("display_name");
      setResellers(data ?? []);
      if (data && data[0]) setSelected(data[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const [{ data: re }, { data: pr }, { data: bal }] = await Promise.all([
        supabase.from("reseller_extensions").select("extensions(id,name)").eq("reseller_id", selected),
        supabase.from("reseller_extension_prices").select("*").eq("reseller_id", selected),
        supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", selected).maybeSingle(),
      ]);
      setExtensions(((re ?? []).map((x: any) => x.extensions).filter(Boolean)) as Ext[]);
      setPrices(pr ?? []);
      setBalance(bal?.balance_cents ?? 0);
    })();
  }, [selected]);

  const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const getPrice = (extId: string, type: string) =>
    prices.find((p) => p.extension_id === extId && p.license_type === type);

  const setPrice = async (extId: string, type: string, valueStr: string, active: boolean) => {
    const cents = Math.round(parseFloat(valueStr.replace(",", ".") || "0") * 100);
    if (cents < 0) return toast.error("Valor inválido");
    const existing = getPrice(extId, type);
    if (existing) {
      const { error } = await supabase.from("reseller_extension_prices")
        .update({ price_cents: cents, is_active: active }).eq("id", existing.id);
      if (error) return toast.error(error.message);
      setPrices((prev) => prev.map((p) => p.id === existing.id ? { ...p, price_cents: cents, is_active: active } : p));
    } else {
      const { data, error } = await supabase.from("reseller_extension_prices").insert({
        reseller_id: selected, extension_id: extId, license_type: type, price_cents: cents, is_active: active,
      }).select().single();
      if (error) return toast.error(error.message);
      if (data) setPrices((prev) => [...prev, data as Price]);
    }
    toast.success("Preço salvo");
  };

  const creditBalance = async () => {
    const cents = Math.round(parseFloat(creditAmt.replace(",", ".")) * 100);
    if (!cents || cents < 1) return toast.error("Valor inválido");
    // upsert balance manually since the rpc is server-only
    const { data: cur } = await supabase.from("reseller_balances").select("balance_cents").eq("reseller_id", selected).maybeSingle();
    if (cur) {
      const { error } = await supabase.from("reseller_balances")
        .update({ balance_cents: cur.balance_cents + cents }).eq("reseller_id", selected);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("reseller_balances").insert({ reseller_id: selected, balance_cents: cents });
      if (error) return toast.error(error.message);
    }
    setBalance((b) => b + cents);
    setCreditOpen(false);
    toast.success("Saldo creditado");
  };

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <PageContainer>
      <PageHeader title="Preços por revendedor" description="Defina o preço que cada revendedor paga por extensão e tipo de licença." />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1 space-y-1.5">
          <Label>Revendedor</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {resellers.map((r) => <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border border-border bg-card/60 px-4 py-2.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3.5 w-3.5 text-primary" /> Saldo do revendedor
          </div>
          <div className="font-display text-lg font-bold">{fmt(balance)}</div>
        </div>
        <Button variant="outline" onClick={() => setCreditOpen(true)}><Plus className="mr-1 h-4 w-4" /> Creditar saldo</Button>
      </div>

      {extensions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Esse revendedor não tem extensões liberadas ainda.
        </div>
      ) : (
        <div className="space-y-4">
          {extensions.map((e) => (
            <div key={e.id} className="rounded-xl border border-border bg-card/60 p-5">
              <div className="font-display font-semibold">{e.name}</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {LICENSE_TYPES.map((t) => {
                  const existing = getPrice(e.id, t.value);
                  return (
                    <PriceRow
                      key={t.value}
                      label={t.label}
                      initialValue={existing ? (existing.price_cents / 100).toFixed(2).replace(".", ",") : ""}
                      initialActive={existing?.is_active ?? true}
                      onSave={(v, a) => setPrice(e.id, t.value, v, a)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Creditar saldo</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Valor (R$)</Label>
            <Input value={creditAmt} onChange={(e) => setCreditAmt(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreditOpen(false)}>Cancelar</Button>
            <Button onClick={creditBalance} className="bg-primary text-primary-foreground hover:bg-primary/90">Creditar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function PriceRow({ label, initialValue, initialActive, onSave }: {
  label: string; initialValue: string; initialActive: boolean;
  onSave: (v: string, a: boolean) => void;
}) {
  const [v, setV] = useState(initialValue);
  const [a, setA] = useState(initialActive);
  useEffect(() => { setV(initialValue); setA(initialActive); }, [initialValue, initialActive]);
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <input type="checkbox" checked={a} onChange={(e) => setA(e.target.checked)} /> Ativo
        </label>
      </div>
      <div className="flex gap-1.5">
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="0,00" className="h-8" />
        <Button size="sm" variant="outline" onClick={() => onSave(v, a)}><Save className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}
