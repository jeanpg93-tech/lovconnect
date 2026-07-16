import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldCheck, Download, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { invokeAuthenticatedFunction } from "@/lib/authenticated-functions";

export default function GerenteClaudeExportar() {
  const [issuing, setIssuing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmToken, setConfirmToken] = useState<string>("");
  const [publicKeyPem, setPublicKeyPem] = useState<string>("");
  const [lastOperation, setLastOperation] = useState<{ id: string; count: number; fingerprint: string } | null>(null);

  const handleIssueToken = async () => {
    setIssuing(true);
    try {
      const { data, error, skipped } = await invokeAuthenticatedFunction<{
        confirm_token: string;
        expires_in_seconds: number;
      }>("claude-export-token-issue", { method: "POST", body: {} });
      if (skipped) { toast.error("Sessão inválida"); return; }
      if (error || !data?.confirm_token) {
        toast.error("Não foi possível gerar o token");
        return;
      }
      setConfirmToken(data.confirm_token);
      toast.success("Token gerado. Válido por 15 minutos, uso único.");
    } finally {
      setIssuing(false);
    }
  };

  const handleExport = async () => {
    if (!confirmToken.trim() || !publicKeyPem.trim()) {
      toast.error("Informe a chave pública e o token de confirmação");
      return;
    }
    setExporting(true);
    try {
      const { data, error, skipped } = await invokeAuthenticatedFunction<any>(
        "claude-export-keys",
        {
          method: "POST",
          body: { public_key_pem: publicKeyPem.trim(), confirm_token: confirmToken.trim() },
        },
      );
      if (skipped) { toast.error("Sessão inválida"); return; }
      if (error || !data?.operation_id) {
        toast.error("Falha ao exportar");
        return;
      }

      // Download imediato, sem passar pelo console.
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `claude-export-${data.operation_id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setLastOperation({
        id: data.operation_id,
        count: data.count,
        fingerprint: data.public_key_fingerprint,
      });
      // Limpa o token da tela: já foi consumido.
      setConfirmToken("");
      toast.success(`${data.count} licença(s) exportada(s) com sucesso.`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Exportar API Keys Claude</h1>
          <p className="text-sm text-muted-foreground">
            Pacote de migração criptografado com RSA-OAEP. Nenhuma chave sai em texto simples.
          </p>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Como funciona</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            1. No projeto <strong>destino</strong>, gere um par RSA-4096:
            <code className="ml-1 px-1 bg-muted rounded">openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out priv.pem</code>
            {" "}e{" "}
            <code className="px-1 bg-muted rounded">openssl rsa -in priv.pem -pubout -out pub.pem</code>.
          </p>
          <p>2. Cole aqui o conteúdo de <code>pub.pem</code> (chave pública SPKI).</p>
          <p>3. Gere o token de confirmação (uso único, expira em 15 min).</p>
          <p>4. Clique em <strong>Exportar</strong>. Um arquivo JSON criptografado será baixado.</p>
          <p>5. No destino, use a chave privada para desembrulhar (AES-GCM + RSA-OAEP SHA-256).</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Chave pública do destino</CardTitle>
          <CardDescription>Cole a chave pública RSA em formato PEM (SPKI).</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
            value={publicKeyPem}
            onChange={(e) => setPublicKeyPem(e.target.value)}
            rows={10}
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token de confirmação (single-use)</CardTitle>
          <CardDescription>
            Necessário para autorizar a exportação. Expira em 15 minutos e só pode ser usado uma vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              readOnly
              value={confirmToken}
              placeholder="Clique em 'Gerar token' para criar"
              className="flex-1 px-3 py-2 border rounded-md bg-muted font-mono text-xs"
            />
            <Button onClick={handleIssueToken} disabled={issuing} variant="secondary">
              {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Gerar token"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O token aparece apenas uma vez, aqui. Ele não é armazenado em claro no banco.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleExport}
          disabled={exporting || !confirmToken || !publicKeyPem}
          size="lg"
        >
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Exportar pacote criptografado
        </Button>
      </div>

      {lastOperation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Última exportação</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Operação:</span> <code>{lastOperation.id}</code></div>
            <div><span className="text-muted-foreground">Licenças exportadas:</span> {lastOperation.count}</div>
            <div className="break-all"><span className="text-muted-foreground">Fingerprint da chave pública:</span> <code>{lastOperation.fingerprint}</code></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
