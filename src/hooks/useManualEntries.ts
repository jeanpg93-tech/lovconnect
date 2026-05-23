import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ManualEntry = {
  id: string;
  entry_type: "revenue" | "expense";
  description: string;
  amount_cents: number;
  category: string | null;
  entry_date: string;
  created_at: string;
  updated_at: string;
};

export type ManualEntryInput = {
  entry_type: "revenue" | "expense";
  description: string;
  amount_cents: number;
  category?: string | null;
  entry_date: string;
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
      .order("entry_date", { ascending: false });
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
    const { error } = await supabase.from("manual_financial_entries").insert({
      ...input,
      created_by: u.user?.id ?? null,
    });
    if (error) throw error;
    await load();
  };

  const update = async (id: string, input: Partial<ManualEntryInput>) => {
    const { error } = await supabase
      .from("manual_financial_entries")
      .update(input)
      .eq("id", id);
    if (error) throw error;
    await load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("manual_financial_entries").delete().eq("id", id);
    if (error) throw error;
    await load();
  };

  return { entries, loading, error, reload: load, create, update, remove };
}