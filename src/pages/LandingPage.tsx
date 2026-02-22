import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Palette,
  Search,
  PenTool,
  Target,
  BarChart3,
  Users,
  Instagram,
  Linkedin,
  ChevronLeft,
  ChevronRight,
  Play,
  Sparkles,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

/* ─── Intersection Observer hook for scroll reveal ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/* ─── Animated counter ─── */
function AnimatedCounter({ end, suffix = "", duration = 1800 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useReveal(0.3);

  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [visible, end, duration]);

  return (
    <span ref={ref} className={`transition-all duration-300 ${visible ? "animate-count-up" : "opacity-0"}`}>
      {count}{suffix}
    </span>
  );
}

/* ─── Signup Form (compact) ─── */
function SignupForm() {
  const { toast } = useToast();
  const [prenom, setPrenom] = useState("");
  const [email, setEmail] = useState("");
  const [activite, setActivite] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prenom.trim() || !email.trim() || !password.trim()) return;
    setLoading(true);
    try {
      localStorage.setItem("lac_prenom", prenom.trim());
      localStorage.setItem("lac_activite", activite.trim());

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;

      if (data.user) {
        await supabase.from("profiles").insert({
          user_id: data.user.id,
          prenom: prenom.trim(),
          activite: activite.trim(),
        });
      }

      setSuccess(true);
      toast({
        title: "Compte créé !",
        description: "Vérifie tes emails pour confirmer ton inscription.",
      });
    } catch (error: any) {
      const msg = error.message;
      if (msg === "User already registered") {
        toast({
          title: "Tu as déjà un compte !",
          description: (
            <span>
              Connecte-toi ici :{" "}
              <a href="/login" className="underline font-medium text-primary">
                page de connexion
              </a>
            </span>
          ) as any,
          variant: "destructive",
        });
      } else {
        toast({ title: "Oups !", description: msg, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-2xl bg-card border border-border p-6 text-center space-y-2 animate-reveal-scale">
        <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
        <p className="font-display text-lg font-bold text-foreground">Presque là !</p>
        <p className="text-sm text-muted-foreground">
          Un email de confirmation vient d'être envoyé. Clique sur le lien pour activer ton compte.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSignup} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Ton prénom" required className="rounded-xl h-12 bg-card border-border" />
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Ton email" required className="rounded-xl h-12 bg-card border-border" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Ex : céramiste, coach..." className="rounded-xl h-12 bg-card border-border" />
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe (6 car. min.)" required minLength={6} className="rounded-xl h-12 bg-card border-border" />
      </div>
      <Button type="submit" disabled={loading} className="w-full sm:w-auto h-12 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux px-10 text-base font-medium transition-all shadow-cta hover:-translate-y-0.5">
        {loading ? "Un instant..." : "🚀 Commencer gratuitement"}
      </Button>
      <p className="text-xs text-muted-foreground">Gratuit. Sans carte bancaire. En 30 secondes.</p>
    </form>
  );
}

/* ─── Sticky CTA Mobile ─── */
function StickyCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-card/90 backdrop-blur-md border-t border-border lg:hidden animate-reveal-up">
      <Link
        to="#signup-section"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("signup-section")?.scrollIntoView({ behavior: "smooth" });
        }}
        className="block w-full text-center rounded-pill bg-primary text-primary-foreground py-3 font-medium shadow-cta"
      >
        🚀 Commencer gratuitement
      </Link>
    </div>
  );
}

/* ─── Demo Carousel ─── */
const DEMO_SLIDES = [
  { emoji: "✍️", title: "Génère un post", desc: "Choisis un sujet, un format, et l'IA te propose un brouillon personnalisé à ton ton de voix.", badge: "Contenu" },
  { emoji: "🔍", title: "Audite ton profil", desc: "Un score de 0 à 100 sur 7 critères avec des recommandations concrètes pour s'améliorer.", badge: "Audit" },
  { emoji: "📊", title: "Suis tes résultats", desc: "Dashboard visuel avec tes stats semaine par semaine et les insights IA pour progresser.", badge: "Stats" },
  { emoji: "📅", title: "Planifie ton calendrier", desc: "Un calendrier éditorial intelligent qui équilibre tes piliers et tes objectifs automatiquement.", badge: "Planning" },
  { emoji: "🎯", title: "Prospecte en douceur", desc: "Un mini-CRM pour transformer tes abonné·es en client·es sans jamais être pushy.", badge: "CRM" },
];

function DemoCarousel() {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % DEMO_SLIDES.length), 4000);
    return () => clearInterval(timer);
  }, [paused]);

  const prev = () => { setPaused(true); setCurrent((c) => (c - 1 + DEMO_SLIDES.length) % DEMO_SLIDES.length); };
  const next = () => { setPaused(true); setCurrent((c) => (c + 1) % DEMO_SLIDES.length); };

  return (
    <div className="relative max-w-2xl mx-auto">
      <div className="overflow-hidden rounded-2xl bg-card border border-border shadow-card">
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${current * 100}%)` }}>
          {DEMO_SLIDES.map((slide, i) => (
            <div key={i} className="min-w-full p-8 sm:p-10 text-center">
              <span className="text-5xl mb-4 block">{slide.emoji}</span>
              <span className="inline-block bg-secondary text-secondary-foreground text-xs font-semibold rounded-pill px-3 py-1 mb-3">{slide.badge}</span>
              <h3 className="font-display text-xl font-bold mb-2">{slide.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">{slide.desc}</p>
            </div>
          ))}
        </div>
      </div>
      {/* Controls */}
      <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-card border border-border shadow-card flex items-center justify-center hover:bg-secondary transition-colors">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-card border border-border shadow-card flex items-center justify-center hover:bg-secondary transition-colors">
        <ChevronRight className="h-4 w-4" />
      </button>
      {/* Dots */}
      <div className="flex justify-center gap-2 mt-4">
        {DEMO_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => { setPaused(true); setCurrent(i); }}
            className={`h-2 rounded-full transition-all duration-300 ${i === current ? "w-6 bg-primary" : "w-2 bg-border hover:bg-muted-foreground/30"}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Reveal wrapper ─── */
function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`${className} ${visible ? "animate-reveal-up" : "opacity-0"}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

/* ─── Main Landing ─── */
export default function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-sm bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  const scrollToSignup = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("signup-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToDemo = () =>
    document.getElementById("demo-section")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-background font-body text-foreground overflow-x-hidden">
      <StickyCTA />

      {/* ─── NAV ─── */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold text-bordeaux">L'Assistant Com'</span>
            <span className="rounded-pill bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">beta</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/plan" className="hidden sm:inline-block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Tarifs</Link>
            <Link to="/login" className="rounded-pill border border-border px-5 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors">Se connecter</Link>
          </div>
        </div>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="relative py-16 sm:py-24 px-4 overflow-hidden">
        <div className="absolute -top-20 -right-32 w-[500px] h-[320px] bg-rose-soft/40 blur-[80px] pointer-events-none animate-float" style={{ clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)" }} />
        <div className="absolute bottom-0 -left-24 w-[400px] h-[250px] bg-accent/20 blur-[80px] pointer-events-none animate-float" style={{ animationDelay: "2s", clipPath: "polygon(25% 0%, 75% 0%, 100% 40%, 85% 100%, 15% 100%, 0% 40%)" }} />

        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
          <div className="animate-reveal-up">
            <h1 className="font-display text-[28px] sm:text-[40px] lg:text-[50px] font-bold leading-[1.15] text-foreground">
              Tu fais un travail magnifique.
              <br />
              <span className="text-primary">Mais personne ne le voit.</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              L'outil de communication pensé pour les créatrices éthiques.
              <br />
              Branding, contenus, stratégie : l'IA fait le boulot,
              <br className="hidden sm:block" />
              toi tu restes authentique.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                to="#signup-section"
                onClick={scrollToSignup}
                className="inline-flex items-center justify-center gap-2 rounded-pill bg-primary text-primary-foreground px-8 py-3.5 font-medium shadow-cta hover:bg-bordeaux transition-all hover:-translate-y-0.5 group"
              >
                <Sparkles className="h-4 w-4 group-hover:rotate-12 transition-transform" /> Commencer gratuitement
              </Link>
              <button
                onClick={scrollToDemo}
                className="inline-flex items-center justify-center gap-2 rounded-pill border border-border px-8 py-3.5 font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <Play className="h-4 w-4" /> Voir la démo
              </button>
            </div>

            {/* Social proof counter */}
            <div className="mt-6 flex items-center gap-4">
              <div className="flex -space-x-2">
                {["N", "M", "B", "S"].map((l, i) => (
                  <div key={i} className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-rose-medium border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary-foreground">{l}</div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  <AnimatedCounter end={50} suffix="+" />
                </span>{" "}
                créatrices éthiques utilisent l'outil
              </p>
            </div>
          </div>

          {/* App mockup */}
          <div className="hidden lg:block animate-reveal-up" style={{ animationDelay: "0.2s" }}>
            <div className="relative">
              <div className="rounded-2xl bg-card border border-border shadow-strong p-5 transform rotate-1 hover:rotate-0 transition-transform duration-500">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-3 w-8 rounded-sm bg-primary/60" />
                  <div className="h-2 w-24 rounded-sm bg-muted" />
                  <div className="ml-auto h-6 w-20 rounded-pill bg-accent" />
                </div>
                <div className="space-y-2 mb-4">
                  {["Storytelling", "Coup de gueule", "Conseil"].map((label) => (
                    <div key={label} className="flex items-center gap-2">
                      <div className="h-7 rounded-pill bg-secondary px-3 flex items-center text-xs font-medium text-secondary-foreground">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="h-8 w-40 rounded-pill bg-primary/90 flex items-center justify-center text-xs font-medium text-primary-foreground animate-pulse-subtle">
                  ✨ Générer un post
                </div>
                <div className="mt-4 grid grid-cols-7 gap-1">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-6 rounded-sm border border-border transition-colors duration-300 ${
                        i === 3 || i === 9 ? "bg-cal-ready" : i === 7 ? "bg-cal-drafting" : i === 11 ? "bg-cal-published" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="absolute -z-10 -bottom-5 -right-5 w-full h-full bg-rose-soft/50 pointer-events-none" style={{ clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ LE PROBLÈME ═══ */}
      <section className="bg-rose-pale py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center mb-10">
            {[
              { emoji: "😩", title: "Tu postes au feeling", sub: "sans résultat" },
              { emoji: "😰", title: "Tu culpabilises", sub: "de te vendre" },
              { emoji: "😤", title: "Tu vois des projets moins bons", sub: "cartonner" },
            ].map((card, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="rounded-2xl bg-card border border-border p-6 shadow-card hover:shadow-card-hover transition-shadow">
                  <span className="text-4xl mb-3 block">{card.emoji}</span>
                  <p className="font-display text-base font-bold text-foreground">{card.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{card.sub}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.3}>
            <p className="font-display text-lg sm:text-xl font-bold text-foreground max-w-lg mx-auto leading-snug">
              Et si le problème c'était pas toi,
              <br />
              <span className="text-primary">mais ce qu'on t'a appris sur le marketing ?</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ COMMENT ÇA MARCHE ═══ */}
      <section className="py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-4">Comment ça marche</h2>
            <p className="text-muted-foreground mb-14 max-w-xl mx-auto">
              3 étapes pour passer de "j'sais pas quoi poster" à "j'ai un plan béton".
            </p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: "①", title: "Pose tes bases", desc: "Branding, cible, storytelling : l'IA te guide pas à pas.", color: "bg-accent" },
              { step: "②", title: "Crée ton contenu", desc: "Posts, Reels, Stories, bio : l'IA génère, toi tu personnalises.", color: "bg-rose-soft" },
              { step: "③", title: "Engage et convertis", desc: "Routine d'engagement, prospection douce, suivi de tes résultats.", color: "bg-secondary" },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 0.12} className="text-center">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${s.color} mb-5`}>
                  <span className="text-2xl font-bold text-foreground">{s.step}</span>
                </div>
                <h3 className="font-display text-lg font-bold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{s.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FONCTIONNALITÉS ═══ */}
      <section className="bg-rose-pale py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-6xl text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-4">Tout ce dont tu as besoin</h2>
            <p className="text-muted-foreground mb-12 max-w-xl mx-auto">Un seul outil, pas six abonnements.</p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {[
              { icon: <Palette className="h-6 w-6 text-primary" />, title: "Branding & identité", desc: "Pose ton positionnement, ta mission, ton ton de voix avec un atelier guidé." },
              { icon: <Search className="h-6 w-6 text-primary" />, title: "Audit Instagram", desc: "L'IA analyse ton profil et te donne des recommandations concrètes." },
              { icon: <PenTool className="h-6 w-6 text-primary" />, title: "Générateur de contenus", desc: "Posts, Reels, Stories, bio : du contenu personnalisé en 1 clic." },
              { icon: <Target className="h-6 w-6 text-primary" />, title: "Prospection douce", desc: "Un mini-CRM pour transformer tes abonné·es en client·es." },
              { icon: <BarChart3 className="h-6 w-6 text-primary" />, title: "Dashboard stats", desc: "Suis tes résultats, comprends ce qui marche et ce qui marche pas." },
              { icon: <Users className="h-6 w-6 text-primary" />, title: "Communauté", desc: "Échange avec d'autres créatrices éthiques qui avancent comme toi." },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div className="rounded-2xl bg-card border border-border p-6 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 h-full">
                  <div className="mb-4">{f.icon}</div>
                  <h3 className="font-display text-base font-bold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DÉMO CARROUSEL ═══ */}
      <section id="demo-section" className="py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-4">L'outil en action</h2>
            <p className="text-muted-foreground mb-12 max-w-xl mx-auto">Voici ce que tu obtiens dès ton inscription.</p>
          </Reveal>
          <Reveal delay={0.15}>
            <DemoCarousel />
          </Reveal>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF BAR ═══ */}
      <section className="bg-card border-y border-border py-10 px-4">
        <div className="mx-auto max-w-4xl grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {[
            { value: 50, suffix: "+", label: "Créatrices actives" },
            { value: 1200, suffix: "+", label: "Contenus générés" },
            { value: 98, suffix: "%", label: "Satisfaction" },
            { value: 7, suffix: "", label: "Modules complets" },
          ].map((s, i) => (
            <div key={i}>
              <p className="font-display text-2xl sm:text-3xl font-bold text-primary">
                <AnimatedCounter end={s.value} suffix={s.suffix} />
              </p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section className="bg-rose-pale py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-4">Choisis ton plan</h2>
            <p className="text-muted-foreground mb-12 max-w-xl mx-auto">Commence gratuitement, monte en puissance quand tu es prête.</p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Free */}
            <Reveal delay={0}>
              <div className="rounded-2xl bg-card border border-border p-6 text-left flex flex-col h-full hover:shadow-card-hover transition-shadow">
                <span className="text-2xl mb-2">🆓</span>
                <h3 className="font-display text-lg font-bold">Gratuit</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4">L'essentiel pour tester</p>
                <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
                  <li>✓ Branding guidé</li>
                  <li>✓ 3 générations IA / mois</li>
                  <li>✓ 1 audit / mois</li>
                  <li>✓ Recommandations</li>
                </ul>
                <Link to="#signup-section" onClick={scrollToSignup} className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors">
                  Commencer
                </Link>
              </div>
            </Reveal>

            {/* Outil */}
            <Reveal delay={0.1}>
              <div className="rounded-2xl bg-card border-2 border-primary p-6 text-left flex flex-col relative shadow-card-hover h-full">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-pill">Populaire</div>
                <span className="text-2xl mb-2">💎</span>
                <h3 className="font-display text-lg font-bold">Outil</h3>
                <p className="text-primary font-bold text-xl mt-1">39€<span className="text-sm font-normal text-muted-foreground">/mois</span></p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">Tout l'outil débloqué</p>
                <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
                  <li>✓ Générations IA illimitées</li>
                  <li>✓ Audits illimités</li>
                  <li>✓ Mini-CRM prospection</li>
                  <li>✓ Générateur commentaires + DM</li>
                  <li>✓ Dashboard stats complet</li>
                  <li>✓ Calendrier éditorial</li>
                </ul>
                <Link to="#signup-section" onClick={scrollToSignup} className="block text-center rounded-pill bg-primary text-primary-foreground py-2.5 font-medium hover:bg-bordeaux transition-colors shadow-cta">
                  S'abonner
                </Link>
              </div>
            </Reveal>

            {/* Now Studio */}
            <Reveal delay={0.2}>
              <div className="rounded-2xl bg-card border border-border p-6 text-left flex flex-col h-full hover:shadow-card-hover transition-shadow">
                <span className="text-2xl mb-2">🌟</span>
                <h3 className="font-display text-lg font-bold">Now Studio</h3>
                <p className="text-primary font-bold text-xl mt-1">250€<span className="text-sm font-normal text-muted-foreground">/mois × 6</span></p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">L'outil + l'accompagnement humain</p>
                <ul className="space-y-2 text-sm text-foreground mb-6 flex-1">
                  <li>✓ Tout le plan Outil</li>
                  <li>✓ Coaching individuel</li>
                  <li>✓ Validation par Laetitia</li>
                  <li>✓ Espace privé Studio</li>
                  <li>✓ Canal direct Laetitia</li>
                  <li>✓ Weekend Bourgogne inclus</li>
                </ul>
                <Link to="/plan" className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors">
                  En savoir plus
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ TÉMOIGNAGES ═══ */}
      <section className="py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-12">Elles utilisent l'outil</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { name: "Napperon", role: "Créatrice linge de maison", quote: "J'ai enfin une stratégie claire et je sais quoi poster chaque semaine. Plus de panne d'inspiration.", result: "Engagement ×3 en 2 mois" },
              { name: "Mazeh Paris", role: "Marque de bijoux éthiques", quote: "L'outil m'a permis de structurer ma com' sans sacrifier mon authenticité. Un vrai game-changer.", result: "Doublé son CA en 4 mois" },
              { name: "Boom Boom Dance", role: "Studio de danse", quote: "On est passé de 0 à 500 abonnées engagées. Le module de prospection douce fait des merveilles.", result: "+500 abonnées qualifiées" },
            ].map((t, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="rounded-2xl bg-card border border-border p-6 text-left shadow-card hover:shadow-card-hover transition-shadow h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-rose-medium flex items-center justify-center text-primary-foreground font-bold text-sm">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-display text-sm font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed italic mb-3">"{t.quote}"</p>
                  <p className="text-xs font-semibold text-primary">📈 {t.result}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ QUI SUIS-JE ═══ */}
      <section className="bg-rose-pale py-16 sm:py-24 px-4">
        <Reveal>
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-bordeaux mb-6">
              <span className="text-3xl text-primary-foreground font-bold">L</span>
            </div>
            <h2 className="font-display text-2xl sm:text-[28px] font-bold mb-4">Je suis Laetitia</h2>
            <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto mb-6">
              J'accompagne les créatrices éthiques depuis 10 ans à se rendre visibles sans renier leurs valeurs. Cet outil, c'est le condensé de tout ce que j'ai appris sur le terrain.
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-xs font-medium">
              <span className="bg-card border border-border rounded-pill px-4 py-2">🎓 Enseignante ENSAD-PSL, Sup de Pub, ISCPA</span>
              <span className="bg-card border border-border rounded-pill px-4 py-2">👥 50+ créatrices accompagnées</span>
              <span className="bg-card border border-border rounded-pill px-4 py-2">📰 Citée dans L'ADN, Capital, e-marketing</span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-10 text-center">Questions fréquentes</h2>
          </Reveal>
          <Accordion type="single" collapsible className="space-y-3">
            {[
              { q: "C'est quoi la différence avec Canva / Later / ChatGPT ?", a: "Ces outils font une seule chose. L'Assistant Com' combine branding, stratégie, création de contenu et suivi de résultats dans une méthode complète. Et l'IA est entraînée à ta marque, pas générique." },
              { q: "Est-ce que ça marche pour mon secteur ?", a: "Oui ! L'outil s'adapte à ton activité : artisanat, coaching, services, e-commerce éthique... L'IA personnalise tout à ton domaine et ta cible." },
              { q: "Je peux annuler quand je veux ?", a: "Oui, sans engagement. Tu peux annuler depuis ton espace en un clic. Ton compte repasse en gratuit et tu gardes tout ton contenu." },
              { q: "C'est quoi le Now Studio ?", a: "Le Now Studio, c'est l'accompagnement premium : tu as tout l'outil + un coaching individuel avec Laetitia, la validation de tes contenus, et un espace privé entre membres." },
              { q: "Mes données sont sécurisées ?", a: "Absolument. Tes données sont chiffrées, hébergées en Europe, et ne sont jamais partagées avec des tiers. L'IA n'utilise pas tes contenus pour s'entraîner." },
              { q: "Je suis débutante, c'est pour moi ?", a: "C'est justement fait pour toi ! L'outil te guide étape par étape depuis le branding jusqu'à la publication. Pas besoin d'expérience en marketing." },
            ].map((faq, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <AccordionItem value={`faq-${i}`} className="rounded-2xl border border-border bg-card px-5">
                  <AccordionTrigger className="text-left text-sm font-semibold text-foreground hover:no-underline py-4">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">{faq.a}</AccordionContent>
                </AccordionItem>
              </Reveal>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ═══ CTA FINAL + SIGNUP ═══ */}
      <section
        id="signup-section"
        className="relative py-16 sm:py-24 px-4 overflow-hidden"
        style={{ background: "linear-gradient(180deg, hsl(340 100% 97%) 0%, hsl(340 33% 99%) 100%)" }}
      >
        <div className="absolute -top-16 -left-24 w-[350px] h-[250px] bg-rose-soft/30 blur-[80px] pointer-events-none animate-float" style={{ clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)" }} />
        <Reveal>
          <div className="mx-auto max-w-2xl text-center relative">
            <h2 className="font-display text-2xl sm:text-[36px] font-bold mb-4">
              Ta com' mérite mieux que l'improvisation.
            </h2>
            <p className="text-muted-foreground mb-8 text-base">
              Rejoins L'Assistant Com' gratuitement et commence à structurer ta visibilité dès aujourd'hui.
            </p>
            <div className="text-left max-w-lg mx-auto">
              <SignupForm />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-foreground text-background py-10 px-4">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <span className="font-display text-lg font-bold">Nowadays</span>
            <span className="block text-sm text-background/60 mt-0.5">L'Assistant Com' par Nowadays Agency</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <Link to="/plan" className="text-background/70 hover:text-background transition-colors">Tarifs</Link>
            <Link to="/login" className="text-background/70 hover:text-background transition-colors">Se connecter</Link>
            <Link to="/legal-ia" className="text-background/70 hover:text-background transition-colors">Mentions légales</Link>
          </nav>
          <div className="flex items-center gap-4">
            <a href="https://instagram.com/nowadaysagency" target="_blank" rel="noopener noreferrer" className="text-background/70 hover:text-background transition-colors">
              <Instagram className="h-5 w-5" />
            </a>
            <a href="https://linkedin.com/company/nowadaysagency" target="_blank" rel="noopener noreferrer" className="text-background/70 hover:text-background transition-colors">
              <Linkedin className="h-5 w-5" />
            </a>
          </div>
        </div>
        <div className="mx-auto max-w-5xl mt-6 pt-6 border-t border-background/10 text-center text-xs text-background/40">
          © 2026 Nowadays Agency. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
