import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Strikethrough, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}

const Btn = ({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  >
    {children}
  </button>
);

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  maxLength,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
    ref.current?.focus();
  };

  const handleInput = () => {
    if (!ref.current) return;
    let html = ref.current.innerHTML;
    if (maxLength && ref.current.innerText.length > maxLength) {
      ref.current.innerText = ref.current.innerText.slice(0, maxLength);
      html = ref.current.innerHTML;
    }
    onChange(html);
  };

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
        <Btn title="Negrito (Ctrl+B)" onClick={() => exec("bold")}>
          <Bold className="h-3.5 w-3.5" />
        </Btn>
        <Btn title="Itálico (Ctrl+I)" onClick={() => exec("italic")}>
          <Italic className="h-3.5 w-3.5" />
        </Btn>
        <Btn title="Sublinhado (Ctrl+U)" onClick={() => exec("underline")}>
          <Underline className="h-3.5 w-3.5" />
        </Btn>
        <Btn title="Tachado" onClick={() => exec("strikeThrough")}>
          <Strikethrough className="h-3.5 w-3.5" />
        </Btn>
        <div className="mx-1 h-4 w-px bg-border" />
        <Btn title="Lista" onClick={() => exec("insertUnorderedList")}>
          <List className="h-3.5 w-3.5" />
        </Btn>
        <Btn title="Lista numerada" onClick={() => exec("insertOrderedList")}>
          <ListOrdered className="h-3.5 w-3.5" />
        </Btn>
        <div className="mx-1 h-4 w-px bg-border" />
        <Btn title="Desfazer" onClick={() => exec("undo")}>
          <Undo2 className="h-3.5 w-3.5" />
        </Btn>
        <Btn title="Refazer" onClick={() => exec("redo")}>
          <Redo2 className="h-3.5 w-3.5" />
        </Btn>
      </div>
      <div
        ref={ref}
        contentEditable
        onInput={handleInput}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        data-placeholder={placeholder}
        className="prose-sm min-h-[140px] max-w-none px-3 py-2 text-xs leading-relaxed outline-none [&[data-placeholder]:empty:before]:text-muted-foreground [&[data-placeholder]:empty:before]:content-[attr(data-placeholder)] [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
      />
    </div>
  );
}