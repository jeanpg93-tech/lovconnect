import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, Loader2, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function NotificationCenter({ variant = "floating" }: { variant?: "floating" | "inline" }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("id,type,title,body,link,read_at,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notif[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel(`notif-center-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, load]);

  const unread = items.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const markAllRead = async () => {
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) return toast.error(error.message);
    load();
  };

  if (!user) return null;

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "relative",
        variant === "floating" &&
          "h-10 w-10 rounded-full border border-border bg-background/80 shadow-lg backdrop-blur"
      )}
      aria-label="Notificações"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Button>
  );

  const popover = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] p-0 border-border bg-popover/95 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-bold">Notificações</div>
            <div className="text-[11px] text-muted-foreground">
              {unread > 0 ? `${unread} não lida${unread === 1 ? "" : "s"}` : "Tudo em dia"}
            </div>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={markAllRead}>
              <Check className="mr-1 h-3 w-3" /> Marcar todas
            </Button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhuma notificação ainda</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const inner = (
                  <div
                    className={cn(
                      "group flex gap-3 px-4 py-3 transition-colors hover:bg-accent/50 cursor-pointer",
                      !n.read_at && "bg-primary/5"
                    )}
                  >
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: n.read_at ? "transparent" : "hsl(var(--primary))" }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">{n.title}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                      )}
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => {
                          if (!n.read_at) markRead(n.id);
                          setOpen(false);
                        }}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div onClick={() => !n.read_at && markRead(n.id)}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  if (variant === "floating") {
    return (
      <div className="fixed right-4 top-4 z-40 hidden md:block" style={{ top: "calc(env(safe-area-inset-top) + 1rem)" }}>
        {popover}
      </div>
    );
  }
  return popover;
}