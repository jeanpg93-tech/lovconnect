import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  resellerId: string;
  resellerName: string;
};

const REASONS = [
  "Golpe / não entrega",
  "Conteúdo enganoso",
  "Uso indevido de marca",
  "Conteúdo proibido",
  "Outro",
];

export function ReportStoreDialog({ open, onOpenChange, resellerId, resellerName }: Props) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!reason) {
      toast.error("Selecione um motivo");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("storefront_reports").insert({
      reseller_id: resellerId,
      reason,
      details: details.trim() || null,
      reporter_contact: contact.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Não foi possível enviar a denúncia");
      return;
    }
    toast.success("Denúncia enviada. Obrigado!");
    setReason(REASONS[0]);
    setDetails("");
    setContact("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" /> Denunciar loja
          </DialogTitle>
          <DialogDescription>
            Encontrou algum problema com a loja de <strong>{resellerName}</strong>?
            Sua denúncia será analisada pela nossa equipe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Detalhes (opcional)</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Descreva o que aconteceu…"
            />
          </div>

          <div className="space-y-2">
            <Label>Seu contato (opcional)</Label>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="WhatsApp ou e-mail para retorno"
              maxLength={120}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting} variant="destructive">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar denúncia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
