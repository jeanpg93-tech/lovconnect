import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ManualEntry = {
  id: string;
  entry_type: "revenue" | "expense";
  description: string;
  amount_cents: number;
  cost_cents: number;
  reference_kind: string | null;
  reference_meta: any | null;
  category: string | null;
  entry_date: string;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
};

export type ManualEntryInput = {
  entry_type: "revenue" | "expense";
  description: string;
  amount_cents: number;
  cost_cents?: number;
  reference_kind?: string | null;
  reference_meta?: any | null;
  category?: string | null;
  entry_date: string;
};

const entrySortOrder = (entryDate: string) => {
  const ms = Date.parse(entryDate);
  return Number.isFinite(ms) ? ms : Date.now();
};

const entryDayKey = (entryDate: string) => {
  const d = new Date(entryDate);
  if (Number.isNaN(d.getTime())) return entryDate.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

export function useManualEntries(opts?: { fromDate?: string | null }) {
  const [entries, setEntries] = useState<ManualEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from("manual_financial_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("sort_order", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (opts?.fromDate) q = q.gte("entry_date", opts.fromDate);
    const { data, error } = await q;
    if (error) setError(error.message);
    setEntries((data as ManualEntry[]) || []);
    setLoading(false);
  }, [opts?.fromDate]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (input: ManualEntryInput) => {
    const { data: u } = await supabase.auth.getUser();
    const sort_order = entrySortOrder(input.entry_date);
    const { error } = await supabase.from("manual_financial_entries").insert({
      ...input,
      created_by: u.user?.id ?? null,
      sort_order,
    });
    if (error) throw error;
    await load();
  };

  const update = async (id: string, input: Partial<ManualEntryInput>) => {
    const payload = input.entry_date
      ? { ...input, sort_order: entrySortOrder(input.entry_date) }
      : input;
    const { error } = await supabase
      .from("manual_financial_entries")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("manual_financial_entries").delete().eq("id", id);
    if (error) throw error;
    await load();
  };

  // Move um lançamento para cima/baixo na listagem trocando o sort_order com o vizinho.
  const move = async (id: string, direction: "up" | "down") => {
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (neighborIdx < 0 || neighborIdx >= entries.length) return;
    const a = entries[idx];
    const b = entries[neighborIdx];
    if (entryDayKey(a.entry_date) !== entryDayKey(b.entry_date)) return;
    const aOrder = a.sort_order ?? entrySortOrder(a.entry_date);
    const bOrder = b.sort_order ?? entrySortOrder(b.entry_date);
    // Garante valores distintos
    const newA = bOrder === aOrder ? bOrder + (direction === "up" ? 1 : -1) : bOrder;
    const newB = bOrder === aOrder ? aOrder : aOrder;
    // Otimismo: atualiza local primeiro
    setEntries((prev) => {
      const copy = [...prev];
      [copy[idx], copy[neighborIdx]] = [copy[neighborIdx], copy[idx]];
      return copy;
    });
    await supabase.from("manual_financial_entries").update({ sort_order: newA }).eq("id", a.id);
    await supabase.from("manual_financial_entries").update({ sort_order: newB }).eq("id", b.id);
    await load();
  };

  // Reordena a lista inteira: o primeiro id recebe o maior sort_order.
  const reorder = async (orderedIds: string[]) => {
    if (orderedIds.length === 0) return;
    // aplica localmente já
    setEntries((prev) => {
      const map = new Map(prev.map((e) => [e.id, e]));
      const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as ManualEntry[];
      const rest = prev.filter((e) => !orderedIds.includes(e.id));
      return [...reordered, ...rest];
    });
    const entryById = new Map(entries.map((e) => [e.id, e]));
    await Promise.all(
      orderedIds.map((id, i) => {
        const entry = entryById.get(id);
        const base = entry ? entrySortOrder(entry.entry_date) : Date.now();
        return supabase
          .from("manual_financial_entries")
          .update({ sort_order: base + (orderedIds.length - i) })
          .eq("id", id);
      }),
    );
    await load();
  };

  return { entries, loading, error, reload: load, create, update, remove, move, reorder };
}