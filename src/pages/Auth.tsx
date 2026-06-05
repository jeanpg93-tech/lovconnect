import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LovMainLogo } from "@/components/LovMainLogo";
import { toast } from "sonner";
import { signInSchema, signUpSchema, forgotPasswordSchema } from "@/lib/auth-schemas";
import { ArrowLeft, Loader2, Mail, Lock, User as UserIcon, Ticket, AlertTriangle, MessageCircle, Eye, EyeOff, Phone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { WhatsAppFloatingButtons } from "@/components/WhatsAppFloatingButtons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { countryDialCodes, DEFAULT_DIAL_CODE } from "@/lib/country-codes";

type Mode = "signin" | "signup" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [affiliateCode, setAffiliateCode] = useState<string>("");
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappDdi, setWhatsappDdi] = useState<string>(DEFAULT_DIAL_CODE);
  const [codeLookup, setCodeLookup] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "ok"; type: "reseller" | "campaign"; label: string }
    | { status: "invalid" }
  >({ status: "idle" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [invalidCodeOpen, setInvalidCodeOpen] = useState(false);
  const [whatIsCodeOpen, setWhatIsCodeOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const supportWhatsappUrl = "https://wa.me/5511936183472?text=Olá,%20preciso%20de%20um%20código%20de%20afiliado%20para%20me%20cadastrar.";

  const passwordRules = [
    { label: "Mínimo 8 caracteres", ok: password.length >= 8 },
    { label: "1 letra maiúscula (A-Z)", ok: /[A-Z]/.test(password) },
    { label: "1 letra minúscula (a-z)", ok: /[a-z]/.test(password) },
    { label: "1 número (0-9)", ok: /[0-9]/.test(password) },
  ];
  const passwordValid = passwordRules.every((r) => r.ok);

  useEffect(() => {
    if (!authLoading && user && !isSyncing) {
      navigate("/painel", { replace: true });
    }
  }, [user, authLoading, navigate, isSyncing]);

  useEffect(() => {
    if (isSyncing) {
      const timer = setTimeout(() => {
        window.location.href = "/painel";
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSyncing]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") || params.get("code") || params.get("c");
    if (ref) {
      setAffiliateCode(ref.toUpperCase());
      setMode("signup");
    }
  }, []);

  useEffect(() => {
    const code = affiliateCode.trim();
    if (code.length < 4) {
      setCodeLookup({ status: "idle" });
      return;
    }
    setCodeLookup({ status: "checking" });
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("lookup_affiliate_code", { _code: code });
      if (error) { setCodeLookup({ status: "idle" }); return; }
      const res = data as { found?: boolean; type?: "reseller" | "campaign"; owner_name?: string; description?: string };
      if (!res?.found) { setCodeLookup({ status: "invalid" }); return; }
      setCodeLookup({
        status: "ok",
        type: res.type ?? "campaign",
        label: res.type === "reseller" ? (res.owner_name ?? "Revendedor") : (res.description ?? "Campanha"),
      });
    }, 400);
    return () => clearTimeout(t);
  }, [affiliateCode]);

  const resetErrors = () => setErrors({});

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetErrors();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { fieldErrors[i.path[0] as string] = i.message; });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);

    if (error) {
      const msg = error.message.toLowerCase().includes("invalid")
        ? "Email ou senha incorretos"
        : error.message;
      toast.error(msg);
      return;
    }
    toast.success("Bem-vindo de volta!");
    setIsSyncing(true);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetErrors();
    const fullWhatsapp = `${whatsappDdi}${(whatsapp || "").replace(/\D/g, "")}`;
    const parsed = signUpSchema.safeParse({ email, password, displayName, affiliateCode, whatsapp: fullWhatsapp });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((i) => { fieldErrors[i.path[0] as string] = i.message; });
      setErrors(fieldErrors);
      if (fieldErrors.affiliateCode) setInvalidCodeOpen(true);
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/painel`,
        data: {
          display_name: parsed.data.displayName,
          affiliate_code: parsed.data.affiliateCode.trim().toUpperCase(),
          whatsapp: parsed.data.whatsapp,
        },
      },
    });
    setLoading(false);

    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes("código de afiliado") || m.includes("afiliado")) {
        setErrors({ affiliateCode: "Código inválido ou expirado" });
        setInvalidCodeOpen(true);
      } else if (m.includes("already") || m.includes("registered")) {
        toast.error("Este email já está cadastrado. Faça login.");
        setMode("signin");
      } else if (m.includes("pwned") || m.includes("compromised")) {
        toast.error("Esta senha apareceu em vazamentos públicos. Escolha outra mais segura.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Conta criada! Aguarde aprovação do gerente para acessar.");
    setMode("signin");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    resetErrors();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0].message });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (error) { toast.error(error.message); return; }
    toast.success("Se o email existir, você receberá um link para redefinir a senha.");
    setMode("signin");
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground font-mono">
      {/* Syncing Modal */}
      <Dialog open={isSyncing} onOpenChange={() => {}}>
        <DialogContent className="border-border/50 bg-card/40 p-8 backdrop-blur-md sm:max-w-md [&>button]:hidden">
          <div className="flex flex-col items-center justify-center space-y-6 py-8 text-center">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-background/60">
                <Loader2 className="h-8 w-8 animate-spin text-primary" strokeWidth={1.5} />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-lg font-bold uppercase tracking-[0.2em] text-primary">
                Sincronizando Sessão
              </h2>
              <div className="flex flex-col space-y-1">
                <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  Estabelecendo túnel de segurança...
                </p>
                <div className="h-1 w-full overflow-hidden bg-muted/20">
                  <div className="h-full w-full animate-progress-fast bg-primary/50" />
                </div>
              </div>
            </div>

            <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
              aguarte :: redirecionamento automático
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {/* Noise / grid */}
      <div className="pointer-events-none fixed inset-0 bg-grid bg-grid-fade opacity-40" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background))_75%)]" />

      {/* Ambient glow */}
      <div className="pointer-events-none fixed left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />

      {/* Scanlines */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, hsl(var(--foreground)) 0px, hsl(var(--foreground)) 1px, transparent 1px, transparent 3px)",
        }}
      />

      <header className="relative z-20">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <Link to="/" className="flex items-center gap-3 transition-colors hover:text-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
            <span>secure_channel</span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> ::voltar
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-none border border-border/50 bg-card/40 p-8 shadow-2xl backdrop-blur-md">
            {mode === "forgot" ? (
              <>
                <div className="mb-6 flex justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-background/60">
                    <Lock className="h-5 w-5 text-primary" strokeWidth={1.5} />
                  </div>
                </div>
                <h1 className="text-center text-xl font-bold uppercase tracking-[0.2em]">Recuperar senha</h1>
                <p className="mt-2 text-center text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  Enviaremos um link de redefinição.
                </p>
                <form onSubmit={handleForgot} className="mt-8 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                      <Input id="email" type="email" autoComplete="email" value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-none border-border/50 bg-background/40 pl-9 text-xs placeholder:text-muted-foreground/30 focus-visible:ring-primary/30" placeholder="IDENTIDADE@EMAIL.COM" />
                    </div>
                    {errors.email && <p className="text-[10px] text-destructive uppercase tracking-widest">{errors.email}</p>}
                  </div>
                  <Button type="submit" disabled={loading} className="w-full rounded-none border border-primary/60 bg-transparent text-[11px] font-bold uppercase tracking-[0.3em] text-foreground hover:bg-primary/10 shadow-[0_0_20px_hsl(var(--primary)/0.2)]">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar link"}
                  </Button>
                  <button type="button" onClick={() => { setMode("signin"); resetErrors(); }}
                    className="block w-full text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors">
                    ::voltar ao login
                  </button>
                </form>
              </>
            ) : (
              <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); resetErrors(); }}>
                <TabsList className="grid w-full grid-cols-2 rounded-none border-b border-border/30 bg-transparent p-0">
                  <TabsTrigger value="signin" className="rounded-none border-b-2 border-transparent py-3 text-[10px] uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary">Entrar</TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-none border-b-2 border-transparent py-3 text-[10px] uppercase tracking-[0.2em] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary">Acesso</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-8 animate-in fade-in zoom-in-95 duration-300">
                  <div className="mb-6 flex justify-center text-primary/50">
                    <Lock className="h-8 w-8" strokeWidth={1} />
                  </div>
                  <h1 className="text-center text-xl font-bold uppercase tracking-[0.2em]">Autenticação</h1>
                  <p className="mt-2 text-center text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Identifique-se para prosseguir.</p>
                  <form onSubmit={handleSignIn} className="mt-8 space-y-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="signin-email" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                        <Input id="signin-email" type="email" autoComplete="email" value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="rounded-none border-border/50 bg-background/40 pl-9 text-xs placeholder:text-muted-foreground/30 focus-visible:ring-primary/30" placeholder="IDENTIDADE@EMAIL.COM" />
                      </div>
                      {errors.email && <p className="text-[10px] text-destructive uppercase tracking-widest">{errors.email}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="signin-password" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Chave de Acesso</Label>
                        <button type="button" onClick={() => { setMode("forgot"); resetErrors(); }}
                          className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground hover:text-primary transition-colors">
                          Esqueceu?
                        </button>
                      </div>
                       <div className="relative">
                         <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                         <Input id="signin-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password}
                           onChange={(e) => setPassword(e.target.value)}
                           className="rounded-none border-border/50 bg-background/40 pl-9 pr-10 text-xs placeholder:text-muted-foreground/30 focus-visible:ring-primary/30" placeholder="••••••••" />
                         <button type="button" onClick={() => setShowPassword((v) => !v)}
                           aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                           className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-primary transition-colors">
                           {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                         </button>
                       </div>
                      {errors.password && <p className="text-[10px] text-destructive uppercase tracking-widest">{errors.password}</p>}
                    </div>
                    <Button type="submit" disabled={loading} className="w-full rounded-none border border-primary/60 bg-transparent h-12 text-[11px] font-bold uppercase tracking-[0.3em] text-foreground hover:bg-primary/10 hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)]">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Iniciar Sessão"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-8 animate-in fade-in zoom-in-95 duration-300">
                  <h1 className="text-center text-xl font-bold uppercase tracking-[0.2em]">Solicitar Acesso</h1>
                  <p className="mt-2 text-center text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Cadastro restrito a convidados.</p>
                  <form onSubmit={handleSignUp} className="mt-8 space-y-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-name" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Nome de Operador</Label>
                      <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                        <Input id="signup-name" type="text" autoComplete="name" value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="rounded-none border-border/50 bg-background/40 pl-9 text-xs placeholder:text-muted-foreground/30 focus-visible:ring-primary/30" placeholder="SEU NOME" />
                      </div>
                      {errors.displayName && <p className="text-[10px] text-destructive uppercase tracking-widest">{errors.displayName}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-whatsapp" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">WhatsApp</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                        <Input id="signup-whatsapp" type="tel" inputMode="tel" autoComplete="tel" value={whatsapp}
                          onChange={(e) => setWhatsapp(e.target.value)}
                          className="rounded-none border-border/50 bg-background/40 pl-9 text-xs placeholder:text-muted-foreground/30 focus-visible:ring-primary/30" placeholder="(11) 98888-7777" />
                      </div>
                      {errors.whatsapp && <p className="text-[10px] text-destructive uppercase tracking-widest">{errors.whatsapp}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-email" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                        <Input id="signup-email" type="email" autoComplete="email" value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="rounded-none border-border/50 bg-background/40 pl-9 text-xs placeholder:text-muted-foreground/30 focus-visible:ring-primary/30" placeholder="IDENTIDADE@EMAIL.COM" />
                      </div>
                      {errors.email && <p className="text-[10px] text-destructive uppercase tracking-widest">{errors.email}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-password" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Senha</Label>
                       <div className="relative">
                         <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                         <Input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password}
                           onChange={(e) => setPassword(e.target.value)}
                           className="rounded-none border-border/50 bg-background/40 pl-9 pr-10 text-xs placeholder:text-muted-foreground/30 focus-visible:ring-primary/30" placeholder="MÍN. 8 CARACTERES" />
                         <button type="button" onClick={() => setShowPassword((v) => !v)}
                           aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                           className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-primary transition-colors">
                           {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                         </button>
                       </div>
                      {(password.length > 0 || errors.password) && (
                        <div className="mt-2 space-y-1 border border-border/40 bg-background/30 px-3 py-2">
                          <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                            Requisitos da senha:
                          </p>
                          <ul className="space-y-0.5">
                            {passwordRules.map((r) => (
                              <li
                                key={r.label}
                                className={`flex items-center gap-1.5 text-[10px] tracking-wide ${
                                  r.ok ? "text-emerald-500" : password.length === 0 ? "text-muted-foreground/60" : "text-destructive"
                                }`}
                              >
                                <span className="inline-block w-3 text-center font-bold">
                                  {r.ok ? "✓" : "•"}
                                </span>
                                {r.label}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {errors.password && (
                        <p className="text-[10px] text-destructive uppercase tracking-widest">{errors.password}</p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signup-affiliate" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Código de Convite</Label>
                      <div className="relative">
                        <Ticket className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                        <Input
                          id="signup-affiliate"
                          value={affiliateCode}
                          onChange={(e) => setAffiliateCode(e.target.value.toUpperCase())}
                          className="rounded-none border-border/50 bg-background/40 pl-9 font-mono uppercase text-xs placeholder:text-muted-foreground/30 focus-visible:ring-primary/30"
                          placeholder="REQUIRED_CODE"
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setWhatIsCodeOpen(true)}
                        className="text-[10px] uppercase tracking-[0.1em] text-primary/70 hover:text-primary transition-colors"
                      >
                        ::obter convite
                      </button>
                      {codeLookup.status === "checking" && (
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          verificando código...
                        </div>
                      )}
                      {codeLookup.status === "ok" && (
                        <div className="flex items-center gap-2 border border-primary/30 bg-primary/5 px-3 py-2 text-[10px] uppercase tracking-[0.15em] text-primary">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                          {codeLookup.type === "reseller" ? (
                            <span>indicado por :: <span className="font-bold text-foreground">{codeLookup.label}</span></span>
                          ) : (
                            <span>campanha :: <span className="font-bold text-foreground">{codeLookup.label}</span></span>
                          )}
                        </div>
                      )}
                      {codeLookup.status === "invalid" && (
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          código inválido ou expirado
                        </div>
                      )}
                    </div>
                    <Button type="submit" disabled={loading} className="w-full rounded-none border border-primary/60 bg-transparent h-12 text-[11px] font-bold uppercase tracking-[0.3em] text-foreground hover:bg-primary/10 hover:shadow-[0_0_20px_hsl(var(--primary)/0.3)]">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Solicitar Registro"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </main>

      <Dialog open={invalidCodeOpen} onOpenChange={setInvalidCodeOpen}>
        <DialogContent className="rounded-none border-border/50 bg-card/90 font-mono backdrop-blur-xl">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-sm uppercase tracking-[0.2em]">Acesso Negado</DialogTitle>
            <DialogDescription className="text-center text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Código de convite inválido ou expirado. Verifique suas credenciais.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex-col gap-2 sm:flex-col sm:justify-center">
            <Button
              asChild
              className="w-full rounded-none border border-primary/60 bg-transparent text-[11px] font-bold uppercase tracking-[0.3em] text-foreground hover:bg-primary/10"
            >
              <a href={supportWhatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                Contatar Gerente
              </a>
            </Button>
            <Button variant="ghost" onClick={() => setInvalidCodeOpen(false)} className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
              ::fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={whatIsCodeOpen} onOpenChange={setWhatIsCodeOpen}>
        <DialogContent className="rounded-none border-border/50 bg-card/90 font-mono backdrop-blur-xl">
          <DialogHeader>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
              <Ticket className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-sm uppercase tracking-[0.2em]">Protocolo de Convite</DialogTitle>
            <DialogDescription className="text-center text-[11px] uppercase tracking-[0.1em] text-muted-foreground leading-relaxed">
              O acesso a este ecossistema é estritamente via convite. Sem um código válido, o registro é impossibilitado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex-col gap-2 sm:flex-col sm:justify-center">
            <Button asChild className="w-full rounded-none border border-primary/60 bg-transparent text-[11px] font-bold uppercase tracking-[0.3em] text-foreground hover:bg-primary/10">
              <a href={supportWhatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                Requisitar Convite
              </a>
            </Button>
            <Button variant="ghost" onClick={() => setWhatIsCodeOpen(false)} className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
              ::ignorar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <WhatsAppFloatingButtons />
    </div>
  );
};

export default Auth;
