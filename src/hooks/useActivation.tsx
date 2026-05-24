import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ActivationStatus = "awaiting_payment" | "payment_under_review" | "active" | "payment_rejected";

export interface ActivationPayment {
  id: string;
  amount_cents: number;
  status: string;
  qr_code_base64: string | null;
  copy_paste: string | null;
  expires_at: string | null;
  reviewer_note: string | null;
  proof_url: string | null;
  created_at: string;
}

export function useActivation(userId: string | undefined) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ActivationStatus | null>(null);
  const [resellerId, setResellerId] = useState<string | null>(null);
  const [payment, setPayment] = useState<ActivationPayment | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: r } = await supabase
      .from("resellers")
      .select("id, activation_status")
      .eq("user_id", userId)
      .maybeSingle();
    if (!r) {
      setStatus(null);
      setResellerId(null);
      setPayment(null);
      setLoading(false);
      return;
    }
    setStatus(r.activation_status as ActivationStatus);
    setResellerId(r.id);

    const { data: p } = await supabase
      .from("activation_payments")
      .select("id, amount_cents, status, qr_code_base64, copy_paste, expires_at, reviewer_note, proof_url, created_at")
      .eq("reseller_id", r.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPayment(p ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!resellerId) return;
    const ch = supabase
      .channel(`activation-${resellerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "resellers", filter: `id=eq.${resellerId}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "activation_payments", filter: `reseller_id=eq.${resellerId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [resellerId, refresh]);

  return { loading, status, resellerId, payment, refresh };
}