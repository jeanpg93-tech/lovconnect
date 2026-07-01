import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Save, Pencil, Check, X } from "lucide-react";
import { ClaudeIcon } from "@/components/icons/ClaudeIcon";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type PlanCode = string;
const PLAN_LABELS: Record<string, string> = {
  pro_30d: "Pro · 30 dias",
  "5x_7d": "5x · 7 dias",
  "5x_30d": "5x · 30 dias",
  "20x_30d": "20x · 30 dias",
};
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PlanRow = {
  plan_code: PlanCode;
  reseller_cost_cents: number;     // custo do revendedor (definido pelo gerente)
  suggested_sale_cents: number;    // preço sugerido pelo gerente (sale_price_cents)
  override_sale_cents: number | null; // preço de venda do revendedor
  is_active: boolean;
};

export default function ClaudePriceTable() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [editing, setEditing] = useState<PlanCode | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase.from("resellers").select("id").eq("user_id", user.id).maybeSingle();
      const rid = r?.id ?? null;
      setResellerId(rid);
      const [{ data: base }, { data: ov }] = await Promise.all([
        supabase
          .from("claude_plan_prices")
          .select("plan_code, sale_price_cents, is_active, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        rid
          ? supabase
              .from("claude_reseller_price_overrides")
              .select("plan_code, sale_price_cents, is_active")
              .eq("reseller_id", rid)
          : Promise.resolve({ data: [] } as any),
      ]);
      const ovMap = new Map<string, number>();
      ((ov ?? []) as any[]).forEach((o) => {
        if (o.is_active) ovMap.set(o.plan_code, o.sale_price_cents);
      });
      const activeCodes = ((base ?? []) as any[]).map((b) => b.plan_code as string);
      // Per-tier cost lookup só para os planos ativos
      const tierCosts: Record<string, number> = {};
      if (rid) {
        await Promise.all(
          activeCodes.map(async (pc) => {
            const { data } = await supabase.rpc("get_reseller_claude_cost", {
              _reseller_id: rid,
              _plan_code: pc,
            });
            if (typeof data === "number") tierCosts[pc] = data;
          }),
        );
      }
      const merged: PlanRow[] = ((base ?? []) as any[]).map((b) => ({
        plan_code: b.plan_code,
        reseller_cost_cents: tierCosts[b.plan_code] ?? 0,
        suggested_sale_cents: b.sale_price_cents ?? 0,
        override_sale_cents: ovMap.has(b.plan_code) ? (ovMap.get(b.plan_code) as number) : null,
        is_active: !!b.is_active,
      }));
      setRows(merged);
      setLoading(false);
    })();
  }, [user]);

  const saveOverride = async (pc: PlanCode, valueReais: number | null) => {
    if (!resellerId) return;
    const row = rows.find((r) => r.plan_code === pc);
    if (!row) return;
    const baseReais = row.reseller_cost_cents / 100;
    if (valueReais !== null && Number.isFinite(valueReais) && valueReais > 0) {
      if (baseReais <= 0) {
        return toast.warning("Custo deste plano ainda não foi definido pelo gerente.");
      }
      if (valueReais < baseReais) {
        return toast.error(`R$ ${valueReais.toFixed(2)} está abaixo do custo (R$ ${baseReais.toFixed(2)}).`);
      }
      if (valueReais === baseReais) {
        return toast.warning("Esse preço é igual ao custo. Você não teria lucro.");
      }
    }
    setSaving(true);
    let error: any = null;
    if (valueReais === null || !Number.isFinite(valueReais) || valueReais <= 0) {
      ({ error } = await supabase
        .from("claude_reseller_price_overrides")
        .delete()
        .eq("reseller_id", resellerId)
        .eq("plan_code", pc));
    } else {
      ({ error } = await supabase
        .from("claude_reseller_price_overrides")
        .upsert(
          {
            reseller_id: resellerId,
            plan_code: pc,
            sale_price_cents: Math.round(valueReais * 100),
            markup_mode: "final",
            markup_value_cents: Math.round(valueReais * 100),
            is_active: true,
          },
          { onConflict: "reseller_id,plan_code" },
        ));
    }
    setSaving(false);
    if (error) return toast.error(`Erro ao salvar: ${error.message}`);
    setRows((prev) =>
      prev.map((r) =>
        r.plan_code === pc
          ? { ...r, override_sale_cents: valueReais !== null && valueReais > 0 ? Math.round(valueReais * 100) : null }
          : r,
      ),
    );
    setEditing(null);
    toast.success("Preço atualizado");
  };

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3">
        <ClaudeIcon className="text-primary" size={16} />
        <div className="text-sm">
          Defina o preço de venda dos planos Claude. O custo é cobrado da sua carteira quando uma chave é emitida.
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card/40 backdrop-blur-sm">
        <div className="hidden grid-cols-12 gap-3 border-b border-border bg-card/60 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:grid">
          <div className="col-span-4">Plano</div>
          <div className="col-span-2">Custo</div>
          <div className="col-span-2">Sugerido</div>
          <div className="col-span-4">Meu preço</div>
        </div>
        <div className="divide-y divide-border">
          {rows.map((row) => {
            const cost = row.reseller_cost_cents / 100;
            const suggested = row.suggested_sale_cents / 100;
            const my = row.override_sale_cents != null ? row.override_sale_cents / 100 : null;
            const empty = !cost;
            const isEditing = editing === row.plan_code;
            return (
              <div
                key={row.plan_code}
                className={cn(
                  "grid grid-cols-1 gap-3 px-4 py-3.5 transition-colors hover:bg-card/70 md:grid-cols-12 md:items-center",
                  empty && "opacity-70",
                )}
              >
                <div className="md:col-span-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-primary">
                      <ClaudeIcon size={16} />
                    </div>
                    <div>
                      <div className="font-display font-semibold">{PLAN_LABELS[row.plan_code] ?? row.plan_code}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.is_active ? "Disponível" : "Indisponível"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">Custo</div>
                  {cost > 0 ? (
                    <div className="font-display text-base font-bold tabular-nums">{fmtBRL(cost)}</div>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      Não definido
                    </span>
                  )}
                </div>

                <div className="md:col-span-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">Sugerido</div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    {suggested > 0 ? fmtBRL(suggested) : "—"}
                  </div>
                </div>

                <div className="md:col-span-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground md:hidden">Meu preço</div>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">R$</span>
                      <Input
                        autoFocus
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="h-8 w-28"
                        placeholder={suggested > 0 ? String(suggested) : "0,00"}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        disabled={saving}
                        onClick={() => saveOverride(row.plan_code, draft === "" ? null : Number(draft))}
                      >
                        <Check className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : my && my > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-bold tabular-nums text-primary">{fmtBRL(my)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => { setDraft(String(my)); setEditing(row.plan_code); }}
                      >
                        <Pencil className="h-3 w-3" /> Editar
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      disabled={empty || !row.is_active}
                      onClick={() => { setDraft(suggested > 0 ? String(suggested) : ""); setEditing(row.plan_code); }}
                    >
                      <Save className="h-3.5 w-3.5" /> Cadastrar preço
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}