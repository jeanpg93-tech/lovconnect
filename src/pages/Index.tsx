import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Sparkles, Wallet, Store, KeyRound, ShieldCheck, Zap, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const Index = () => {
  const { user } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Aurora blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="blob animate-mystic-float"
          style={{ top: "-10%", left: "-10%", width: "55vw", height: "55vw", background: "hsl(var(--primary) / 0.45)" }}
        />
        <div
          className="blob animate-mystic-float"
          style={{ top: "20%", right: "-15%", width: "50vw", height: "50vw", background: "hsl(var(--primary-glow) / 0.4)", animationDelay: "-6s" }}
        />
        <div
          className="blob animate-mystic-float"
          style={{ bottom: "-20%", left: "20%", width: "45vw", height: "45vw", background: "hsl(280 90% 70% / 0.35)", animationDelay: "-12s" }}
        />
      </div>

      {/* Header */}
      <header className="relative z-20">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-mystic text-primary-foreground shadow-mystic-sm">
              <Sparkles className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">Revendovable</span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">Recursos</a>
            <a href="#para-quem" className="transition-colors hover:text-foreground">Para quem</a>
            <a href="#integracoes" className="transition-colors hover:text-foreground">Integrações</a>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Button asChild size="sm" className="rounded-full bg-gradient-mystic px-5 font-semibold text-primary-foreground shadow-mystic-sm hover:opacity-95">
                <Link to="/painel">Acessar painel</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost" className="rounded-full font-semibold">
                  <Link to="/auth">Entrar</Link>
                </Button>
                <Button asChild size="sm" className="rounded-full bg-gradient-mystic px-5 font-semibold text-primary-foreground shadow-mystic-sm hover:opacity-95">
                  <Link to="/auth">Começar agora <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <section className="container mx-auto grid items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          <div className="space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary backdrop-blur-sm">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Acesso por convite
            </div>

            <h1 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              Plataforma de revenda com{" "}
              <span className="text-gradient-mystic">a menor fricção</span> do mercado.
            </h1>

            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              Gerencie licenças, recarga e sua loja digital num só lugar. Pague em PIX, escale com níveis e venda com checkout próprio — sem burocracia.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 rounded-full bg-gradient-mystic px-7 text-sm font-bold text-primary-foreground shadow-mystic hover:opacity-95">
                <Link to={user ? "/painel" : "/auth"}>
                  {user ? "Acessar painel" : "Começar agora"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-border bg-card/40 px-7 text-sm font-bold backdrop-blur-sm hover:bg-card">
                <a href="#features">Ver recursos</a>
              </Button>
            </div>

            <div className="flex items-center gap-6 pt-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> PIX integrado</div>
              <div className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-primary" /> Liberação instantânea</div>
              <div className="flex items-center gap-1.5"><Crown className="h-3.5 w-3.5 text-primary" /> Sistema de níveis</div>
            </div>
          </div>

          {/* Mock cards flutuantes */}
          <div className="relative mx-auto h-[460px] w-full max-w-md">
            <div className="absolute inset-0 rounded-[3rem] bg-gradient-mystic opacity-20 blur-3xl" />

            {/* Card principal */}
            <div className="absolute left-1/2 top-1/2 w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-border bg-card/80 p-6 shadow-mystic backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Saldo da loja</span>
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-3 font-display text-4xl font-extrabold tracking-tight">R$ 12.480,<span className="text-2xl text-muted-foreground">90</span></div>
              <div className="mt-1 text-xs text-emerald-500 font-semibold">+ R$ 1.240 hoje</div>

              <div className="mt-6 space-y-3">
                {[
                  { l: "Venda — Licença Premium", v: "+ R$ 197,00", t: "agora" },
                  { l: "Recarga PIX", v: "+ R$ 500,00", t: "2m" },
                  { l: "Comissão indicação", v: "+ R$ 39,40", t: "5m" },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{row.l}</div>
                        <div className="text-muted-foreground">{row.t}</div>
                      </div>
                    </div>
                    <div className="font-bold text-foreground">{row.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Badge flutuante */}
            <div className="absolute -right-2 top-6 rounded-2xl border border-border bg-card/90 px-3 py-2 shadow-mystic-sm backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs">
                <div className="h-7 w-7 rounded-full bg-gradient-mystic flex items-center justify-center text-primary-foreground"><Crown className="h-3.5 w-3.5" /></div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Nível</div>
                  <div className="font-bold">Mystic</div>
                </div>
              </div>
            </div>

            <div className="absolute -left-3 bottom-10 rounded-2xl border border-border bg-card/90 px-3 py-2 shadow-mystic-sm backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs">
                <div className="h-7 w-7 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center"><Zap className="h-3.5 w-3.5" /></div>
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">PIX</div>
                  <div className="font-bold">Aprovado</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="container mx-auto px-4 pb-12">
          <div className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            A escolha de quem escala
          </div>
          <div className="mx-auto mt-6 flex max-w-3xl flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm font-bold text-muted-foreground/70">
            <span>NIGHTBLADE</span><span>ARCANE</span><span>MYSTIC</span><span>SHADOW</span><span>VOID</span><span>ASTRAL</span>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="container mx-auto px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-primary">Recursos</div>
            <h2 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">
              Tudo que sua operação precisa.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Recarga, licenças, loja, integração PIX e WhatsApp — sem precisar costurar 5 ferramentas.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { i: KeyRound, t: "Licenças", d: "Gere, distribua e resete chaves dos seus clientes em segundos." },
              { i: Wallet, t: "Recarga PIX", d: "Receba recarga com PIX integrado e liberação automática." },
              { i: Store, t: "Loja própria", d: "Sua vitrine pública pra vender direto sem intermediário." },
              { i: Crown, t: "Níveis e bônus", d: "Quanto mais escala, mais bônus de recarga você desbloqueia." },
              { i: Zap, t: "API completa", d: "Automatize criação e validação de chaves no seu sistema." },
              { i: ShieldCheck, t: "Anti-abuso", d: "Reembolsos auditados e proteções contra ataques." },
            ].map((f, i) => (
              <div key={i} className="group rounded-3xl border border-border bg-card/50 p-6 backdrop-blur-sm transition-all hover:border-primary/40 hover:shadow-mystic-sm">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <f.i className="h-5 w-5" />
                </div>
                <div className="font-display text-lg font-bold">{f.t}</div>
                <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Para quem */}
        <section id="para-quem" className="container mx-auto px-4 py-20">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card/50 p-8 backdrop-blur-sm">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Para revendedores</div>
              <h3 className="mt-3 font-display text-3xl font-bold">Venda mais, com menos atrito.</h3>
              <p className="mt-3 text-muted-foreground">
                Painel completo com saldo em tempo real, sua loja pública, integração PIX, ranking, comissão por indicação e níveis de bônus.
              </p>
            </div>
            <div className="rounded-3xl border border-border bg-gradient-mystic p-8 text-primary-foreground shadow-mystic">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground/80">Para clientes finais</div>
              <h3 className="mt-3 font-display text-3xl font-bold">Suas extensões. Sempre disponíveis.</h3>
              <p className="mt-3 text-primary-foreground/85">
                Painel limpo pra ver chaves, status e baixar suas ferramentas em segundos.
              </p>
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section id="integracoes" className="container mx-auto px-4 pb-24">
          <div className="relative overflow-hidden rounded-[2.5rem] border border-border bg-card/60 p-10 text-center backdrop-blur-xl md:p-16">
            <div className="absolute inset-0 -z-10 bg-gradient-aurora opacity-70" />
            <h2 className="mx-auto max-w-2xl font-display text-4xl font-extrabold tracking-tight md:text-5xl">
              Pronto pra entrar no <span className="text-gradient-mystic">círculo</span>?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Acesso por convite. Aprovação manual. Sem catálogo público.
            </p>
            <Button asChild size="lg" className="mt-8 h-12 rounded-full bg-gradient-mystic px-8 text-sm font-bold text-primary-foreground shadow-mystic hover:opacity-95">
              <Link to={user ? "/painel" : "/auth"}>
                {user ? "Acessar painel" : "Solicitar acesso"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 text-xs text-muted-foreground sm:flex-row">
          <div>© {new Date().getFullYear()} Revendovable</div>
          <div className="flex items-center gap-4">
            <span>Acesso restrito</span>
            <span>·</span>
            <span>Tráfego monitorado</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
