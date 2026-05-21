import { useState, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download } from "lucide-react";
import { toast } from "sonner";

type Props = {
  containerRef: RefObject<HTMLElement>;
  fileName?: string;
  label?: string;
};

const extractText = (root: HTMLElement) => {
  // Use innerText so it respects line breaks of <pre>/headings.
  const raw = (root.innerText || root.textContent || "").trim();
  // Collapse 3+ blank lines into 2.
  return raw.replace(/\n{3,}/g, "\n\n");
};

export default function CopyAllDocsButton({
  containerRef,
  fileName = "documentacao-api.md",
  label = "Copiar documentação completa",
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const el = containerRef.current;
    if (!el) return;
    const text = extractText(el);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Documentação copiada", {
        description: `${text.length.toLocaleString("pt-BR")} caracteres na área de transferência.`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Tente baixar como arquivo.");
    }
  };

  const handleDownload = () => {
    const el = containerRef.current;
    if (!el) return;
    const text = extractText(el);
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Download iniciado");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={handleCopy}
        className="h-10 gap-2 bg-primary text-primary-foreground font-bold uppercase tracking-widest text-[10px] sm:text-xs shadow-glow-sm hover:scale-[1.02] transition-all rounded-xl px-3 sm:px-5"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span className="hidden sm:inline">{copied ? "Copiado!" : label}</span>
        <span className="sm:hidden">{copied ? "Copiado!" : "Copiar tudo"}</span>
      </Button>
      <Button
        onClick={handleDownload}
        variant="outline"
        className="h-10 gap-2 font-bold uppercase tracking-widest text-[10px] sm:text-xs rounded-xl px-3 sm:px-4"
        title="Baixar como arquivo .md"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Baixar .md</span>
      </Button>
    </div>
  );
}