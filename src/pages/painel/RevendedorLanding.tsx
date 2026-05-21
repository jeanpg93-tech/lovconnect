import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  Zap, 
  Coins, 
  Crown, 
  Heart, 
  Star, 
  ShieldCheck, 
  Rocket, 
  MessageSquare, 
  Wallet, 
  PlusCircle, 
  ArrowRight,
  Infinity as InfinityIcon,
  Tag,
  KeyRound,
  History,
  LayoutDashboard,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import wizardHero from "@/assets/wizard-hero.png";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORIES = [
  { id: "destaques", name: "Destaques", icon: Star, color: "text-amber-400" },
  { id: "creditos", name: "Recargas", icon: Coins, color: "text-emerald-400" },
  { id: "licencas", name: "Licenças", icon: KeyRound, color: "text-primary" },
  { id: "servicos", name: "Serviços", icon: Zap, color: "text-sky-400" },
];

const SERVICES = [
  {
    id: "creditos-10",
    category: "creditos",
    name: "10 Recargas",
    description: "Ideal para testes rápidos e demonstrações.",
    price: 1500,
    icon: Coins,
    tag: "Teste",
    link: "/painel/revendedor/comprar-creditos",
    popular: false
  },
  {
    id: "creditos-100",
    category: "creditos",
    name: "100 Recargas",
    description: "O pacote mais vendido para uso profissional.",
    price: 12000,
    icon: Coins,
    tag: "Popular",
    link: "/painel/revendedor/comprar-creditos",
    popular: true
  },
  {
    id: "creditos-500",
    category: "creditos",
    name: "500 Recargas",
    description: "Melhor custo-benefício para grandes operações.",
    price: 50000,
    icon: Zap,
    tag: "Pro",
    link: "/painel/revendedor/comprar-creditos",
    popular: false
  },
  {
    id: "licenca-7d",
    category: "licencas",
    name: "Pro 7 dias",
    description: "Acesso total por uma semana.",
    price: 1990,
    icon: KeyRound,
    tag: "Semanal",
    link: "/painel/revendedor/licencas",
    popular: false
  },
  {
    id: "licenca-30d",
    category: "licencas",
    name: "Pro 30 dias",
    description: "Plano mensal completo com todos os recursos.",
    price: 4990,
    icon: ShieldCheck,
    tag: "Mensal",
    link: "/painel/revendedor/licencas",
    popular: true
  },
  {
    id: "licenca-vitalicia",
    category: "licencas",
    name: "Vitalícia",
    description: "Acesso para sempre sem mensalidades.",
    price: 49700,
    icon: Crown,
    tag: "Premium",
    link: "/painel/revendedor/licencas",
    popular: false
  },
  {
    id: "custom-ext",
    category: "servicos",
    name: "Personalização",
    description: "Personalize sua extensão com sua marca.",
    price: 0,
    icon: Rocket,
    tag: "Marca Própria",
    link: "/painel/revendedor/personalizar-extensao",
    popular: false,
    priceLabel: "Consultar"
  },
  {
    id: "loja-vendas",
    category: "servicos",
    name: "Minha Loja",
    description: "Configure sua vitrine de vendas online.",
    price: 0,
    icon: LayoutDashboard,
    tag: "Dashboard",
    link: "/painel/revendedor/loja",
    popular: false,
    priceLabel: "Grátis"
  }
];

export default function RevendedorLanding() {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState("destaques");

  const filteredServices = useMemo(() => {
    if (activeCategory === "destaques") {
      return SERVICES.filter(s => s.popular);
    }
    return SERVICES.filter(s => s.category === activeCategory);
  }, [activeCategory]);

  const scrollToSection = (id: string) => {
    setActiveCategory(id);
    const element = document.getElementById("services-grid");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-background mx-4 mt-4">
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute -right-20 top-1/2 -translate-y-1/2 h-[520px] w-[520px] rounded-full opacity-60 pointer-events-none blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 65%)" }}
        />

        <div className="relative grid gap-8 p-6 md:p-12 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" />
              Catálogo de Serviços
            </div>

            <h1 className="font-display text-4xl md:text-6xl font-black leading-[0.95] tracking-tighter">
              Tudo que você precisa
              <br />
              <span className="italic text-primary text-shadow-red">Num só lugar.</span>
            </h1>

            <p className="max-w-md text-sm md:text-base text-muted-foreground leading-relaxed">
              Explore todos os pacotes de recargas, licenças pro e serviços de personalização para alavancar sua revenda.
            </p>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-2xl px-8 shadow-red-glow">
                <a href="#services-grid">Começar agora</a>
              </Button>
              <Button variant="outline" size="lg" className="rounded-2xl px-8" asChild>
                <Link to="/painel/revendedor/adicionar-saldo">
                  <Wallet className="mr-2 h-4 w-4" /> Recarregar Saldo
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative">
              <div className="absolute inset-x-8 bottom-2 h-8 rounded-[50%] opacity-70 blur-2xl"
                style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.6), transparent 70%)" }}
              />
              <img
                src={wizardHero}
                alt="Mago Revendovable"
                className="relative w-full max-w-[240px] md:max-w-[300px] h-auto object-contain animate-wizard-float drop-shadow-[0_20px_40px_hsl(var(--primary)/0.45)]"
              />
              
              {/* Floating badges */}
              <div className="absolute -left-4 top-10 flex h-12 w-12 animate-wizard-float items-center justify-center rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl shadow-2xl" style={{ animationDelay: "-1.5s" }}>
                <Coins className="h-6 w-6 text-amber-400" />
              </div>
              <div className="absolute -right-4 top-1/2 flex h-14 w-14 animate-wizard-float items-center justify-center rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl shadow-2xl" style={{ animationDelay: "-3s" }}>
                <Zap className="h-7 w-7 text-primary" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="sticky top-20 z-30 bg-background/80 backdrop-blur-xl border-b border-border mt-8 mx-4 rounded-2xl p-2 flex overflow-x-auto no-scrollbar gap-2 shadow-sm">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-xl transition-all duration-300 whitespace-nowrap font-display font-bold text-sm",
                activeCategory === cat.id 
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105" 
                  : "bg-card border border-border text-muted-foreground hover:bg-accent"
              )}
            >
              <Icon className={cn("h-4 w-4", activeCategory === cat.id ? "" : cat.color)} />
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Services Grid */}
      <div id="services-grid" className="px-4 mt-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredServices.map((service, idx) => {
            const Icon = service.icon;
            return (
              <div
                key={service.id}
                className={cn(
                  "group relative overflow-hidden rounded-[2rem] border border-border bg-card p-6 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4",
                  service.popular && "ring-2 ring-primary/30"
                )}
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {service.popular && (
                  <div className="absolute right-6 top-6 flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary ring-1 ring-primary/20">
                    <Star className="h-3 w-3 fill-current" /> Destaque
                  </div>
                )}
                
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-500">
                  <Icon className="h-7 w-7" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-xl font-bold tracking-tight">{service.name}</h3>
                    <span className="text-[10px] font-mono uppercase text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
                      {service.tag}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                    {service.description}
                  </p>
                </div>

                <div className="mt-8 flex items-end justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Preço</span>
                    <div className="text-2xl font-black tracking-tighter">
                      {service.priceLabel || formatBRL(service.price)}
                    </div>
                  </div>
                  <Button asChild size="icon" className="h-12 w-12 rounded-2xl bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all duration-500 group-hover:scale-110">
                    <Link to={service.link}>
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </Button>
                </div>

                {/* Glass decoration */}
                <div className="absolute -bottom-12 -right-12 h-24 w-24 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
              </div>
            );
          })}
        </div>

        {filteredServices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-20 w-20 rounded-full bg-accent flex items-center justify-center mb-4">
              <Zap className="h-10 w-10 text-muted-foreground opacity-20" />
            </div>
            <h3 className="font-display text-xl font-bold">Nenhum serviço encontrado</h3>
            <p className="text-muted-foreground mt-2">Tente mudar a categoria acima.</p>
          </div>
        )}
      </div>

      {/* Trust Section */}
      <div className="px-4 mt-16">
        <div className="rounded-[2.5rem] bg-accent/50 border border-border p-8 md:p-12">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <div className="space-y-4">
              <h2 className="font-display text-3xl md:text-5xl font-black tracking-tighter">Qualidade Garantida</h2>
              <p className="text-muted-foreground text-sm md:text-lg">
                Seja um revendedor de sucesso com a melhor infraestrutura do mercado. 
                Suporte 24/7 e ativação imediata.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: "Seguro", icon: ShieldCheck },
                { label: "Rápido", icon: Zap },
                { label: "Escalável", icon: Rocket },
                { label: "24/7", icon: MessageSquare }
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 rounded-2xl bg-background border border-border flex items-center justify-center shadow-sm">
                    <item.icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 w-full max-w-lg">
        <div className="bg-background/80 backdrop-blur-2xl border border-border/50 p-2 rounded-[2.5rem] shadow-2xl ring-1 ring-white/10 flex items-center justify-between">
          <Link
            to="/painel/revendedor"
            className="flex h-12 w-12 items-center justify-center rounded-[1.5rem] text-muted-foreground hover:bg-accent transition-all"
          >
            <Home className="h-6 w-6" />
          </Link>
          <div className="h-8 w-[1px] bg-border mx-1" />
          
          <div className="flex flex-1 items-center justify-around gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => scrollToSection(cat.id)}
                className={cn(
                  "flex flex-col items-center gap-1 p-2 rounded-2xl transition-all min-w-[64px]",
                  activeCategory === cat.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                )}
              >
                <cat.icon className="h-5 w-5" />
                <span className="text-[9px] font-black uppercase tracking-tighter">{cat.name}</span>
              </button>
            ))}
          </div>

          <div className="h-8 w-[1px] bg-border mx-1" />
          <Link
            to="/painel/revendedor/transacoes"
            className="flex h-12 w-12 items-center justify-center rounded-[1.5rem] text-muted-foreground hover:bg-accent transition-all"
          >
            <History className="h-6 w-6" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function Home(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
