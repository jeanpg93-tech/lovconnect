import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Store, ArrowLeft } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { StorefrontBackground } from "@/components/storefront/StorefrontBackground";
import { StorefrontVisualEffects, type VisualEffect } from "@/components/storefront/StorefrontVisualEffects";
import { PortalFooterBrand } from "@/components/cliente-claude/PortalFooterBrand";

function hexToHslString(hex?: string | null): string | null {
  if (!hex) return null;
  const m = hex.trim().replace("#", "");
  if (!/^([0-9a-f]{6}|[0-9a-f]{3})$/i.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

type Branding = {
  store_name: string;
  logo_url: string | null;
  primary_color: string;
  background_color: string | null;
  background_effect: string;
  visual_effect: string;
  tagline: string | null;
};

export default function ClienteClaudeLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storeSlug = searchParams.get("loja")?.trim() ?? "";
  const emailFromUrl = searchParams.get("email")?.trim() ?? "";
  const portalPath = `/cliente-claude${storeSlug ? `?loja=${encodeURIComponent(storeSlug)}` : ""}`;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [expiredLink, setExpiredLink] = useState<null | { code: string; description: string }>(null);
  const [sendingRecovery, setSendingRecovery] = useState(false);
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    if (emailFromUrl) setEmail(emailFromUrl);
  }, [emailFromUrl]);

  // Carrega branding do revendedor (público) para padronizar o login com a loja.
  useEffect(() => {
    if (!storeSlug) return;
    let cancelled = false;
    (async () => {
      const { data: reseller } = await supabase
        .from("resellers_public" as any)
        .select("id, display_name, slug, is_active")
        .ilike("slug", storeSlug)
        .maybeSingle();
      if (!reseller || !(reseller as any).is_active) return;
      const { data: sf } = await supabase
        .from("reseller_storefronts")
        .select("store_name, tagline, logo_url, primary_color, background_color, background_effect, visual_effect")
        .eq("reseller_id", (reseller as any).id)
        .maybeSingle();
      if (cancelled) return;
      setBranding({
        store_name: (sf as any)?.store_name ?? (reseller as any).display_name,
        tagline: (sf as any)?.tagline ?? null,
        logo_url: (sf as any)?.logo_url ?? null,
        primary_color: (sf as any)?.primary_color ?? "#7c3aed",
        background_color: (sf as any)?.background_color ?? null,
        background_effect: (sf as any)?.background_effect ?? "none",
        visual_effect: (sf as any)?.visual_effect ?? "none",
      });
    })();
    return () => { cancelled = true; };
  }, [storeSlug]);

  useEffect(() => {
    // Detecta erro do magic link expirado retornado pelo Supabase no fragmento da URL
    // Ex.: #error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const err = params.get("error");
    const code = params.get("error_code") ?? "";
    if (!err) return;
    setExpiredLink({
      code,
      description: params.get("error_description")?.replace(/\+/g, " ") ?? "Link inválido ou expirado.",
    });
    // limpa o hash pra não mostrar de novo em refresh
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  const themeStyle = useMemo(() => {
    const brandHsl = hexToHslString(branding?.primary_color) ?? null;
    const bgHsl = hexToHslString(branding?.background_color) ?? null;
    const style: React.CSSProperties = {};
    if (brandHsl) (style as any)["--brand"] = brandHsl;
    if (bgHsl) (style as any)["--brand-bg"] = bgHsl;
    return style;
  }, [branding]);

  const color = branding?.primary_color ?? "#7c3aed";
  const storeName = branding?.store_name ?? "Portal do Cliente Claude";

  const sendRecovery = async () => {
    if (!email) return toast.error("Informe seu e-mail para receber o link de redefinição");
    setSendingRecovery(true);
    try {
      const { error } = await supabase.functions.invoke("claude-customer-login-link", {
        body: { email, reseller_slug: storeSlug || null, redirect_to: `${window.location.origin}${portalPath}` },
      });
      if (error) throw error;
      toast.success("Se o e-mail existir, você receberá um link para definir uma nova senha.");
      setExpiredLink(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar link");
    } finally {
      setSendingRecovery(false);
    }
  };

  const signInWithPassword = async () => {
    if (!email || !password) return toast.error("Preencha e-mail e senha");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate(portalPath);
    } catch (e: any) {
      toast.error(e?.message ?? "Credenciais inválidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        ...themeStyle,
        background: branding
          ? `radial-gradient(1200px 600px at 10% -10%, ${color}33, transparent 60%), radial-gradient(900px 500px at 100% 0%, ${color}1f, transparent 55%), ${branding.background_color ?? "hsl(240 10% 4%)"}`
          : undefined,
        color: branding ? "hsl(0 0% 98%)" : undefined,
      }}
    >
      {branding && (
        <>
          <StorefrontBackground effect={branding.background_effect as any} color={color} />
          <StorefrontVisualEffects effect={branding.visual_effect as VisualEffect} color={color} />
        </>
      )}

      <Card
        className="w-full max-w-md relative z-10 border-white/10 bg-card/80 backdrop-blur-xl shadow-2xl animate-fade-in"
        style={branding ? { boxShadow: `0 20px 60px -20px ${color}80, 0 0 0 1px ${color}22 inset` } : undefined}
      >
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            {branding?.logo_url ? (
              <img
                src={branding.logo_url}
                alt={storeName}
                className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/10"
                style={{ boxShadow: `0 0 30px ${color}80` }}
              />
            ) : (
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center font-bold text-2xl"
                style={{ background: `${color}22`, color, boxShadow: `0 0 30px ${color}66` }}
              >
                {storeName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] opacity-60">{storeName}</div>
            <CardTitle className="text-2xl mt-1" style={branding ? { color } : undefined}>
              Portal do Cliente
            </CardTitle>
            <p className="text-sm opacity-70 mt-1">Acompanhe suas chaves, consumo e renove.</p>
          </div>
          {storeSlug && (
            <Button asChild variant="ghost" size="sm" className="mx-auto">
              <Link to={`/loja/${storeSlug}`}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Voltar para a loja
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {expiredLink && (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">
                  {expiredLink.code === "otp_expired"
                    ? "Seu link mágico expirou."
                    : "Não foi possível validar o link."}
                </p>
                <p className="text-xs opacity-90">
                  Informe seu e-mail abaixo e clique em <b>Esqueci minha senha</b> para receber um novo link.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              autoComplete="email"
              className={branding ? "bg-white/5 border-white/10" : ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={branding ? "bg-white/5 border-white/10" : ""}
            />
          </div>

          <Button
            className="w-full hover-scale"
            disabled={loading}
            onClick={signInWithPassword}
            style={branding ? { background: color, color: "white", boxShadow: `0 0 24px ${color}80` } : undefined}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Entrar
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            disabled={sendingRecovery}
            onClick={sendRecovery}
          >
            {sendingRecovery && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Esqueci minha senha / primeiro acesso
          </Button>

          <p className="text-xs opacity-60 text-center">
            Novo por aqui? A conta é criada automaticamente na sua primeira compra — use "Esqueci minha senha" para definir a sua.
          </p>
        </CardContent>
      </Card>

      <div className="relative z-10 mt-6">
        <PortalFooterBrand />
      </div>
    </div>
  );
}