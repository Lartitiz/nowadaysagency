import { useState, useEffect, useRef } from "react";
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
  Instagram,
  Linkedin,
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  Rocket,
  ExternalLink,
} from "lucide-react";

/* ─── useReveal ─── */
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

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useReveal();
  return (
    <div ref={ref} className={`${className} ${visible ? "animate-reveal-up" : "opacity-0"}`} style={{ animationDelay: `${delay}s` }}>
      {children}
    </div>
  );
}

/* ─── SignupForm ─── */
function SignupForm({ compact = false }: { compact?: boolean }) {
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
      toast({ title: "Compte créé !", description: "Vérifie tes emails pour confirmer ton inscription." });
    } catch (error: any) {
      const msg = error.message;
      if (msg === "User already registered") {
        toast({
          title: "Tu as déjà un compte !",
          description: (<span>Connecte-toi ici : <a href="/login" className="underline font-medium text-primary">page de connexion</a></span>) as any,
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
        <p className="text-sm text-muted-foreground">Un email de confirmation vient d'être envoyé. Clique sur le lien pour activer ton compte.</p>
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
        <Input value={activite} onChange={(e) => setActivite(e.target.value)} placeholder="Ex : photographe, coach, artisane..." className="rounded-xl h-12 bg-card border-border" />
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe (6 car. min.)" required minLength={6} className="rounded-xl h-12 bg-card border-border" />
      </div>
      <Button type="submit" disabled={loading} className="w-full sm:w-auto h-12 rounded-pill px-10 text-base font-medium">
        {loading ? "Un instant..." : "🚀 Commencer gratuitement"}
      </Button>
      <p className="text-xs text-muted-foreground">Gratuit. Sans carte bancaire. En 30 secondes.</p>
    </form>
  );
}

/* ─── StickyCTA ─── */
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
      <a href="#signup-section" onClick={(e) => { e.preventDefault(); document.getElementById("signup-section")?.scrollIntoView({ behavior: "smooth" }); }}
        className="block w-full text-center rounded-pill bg-primary text-primary-foreground py-3 font-medium shadow-cta">
        🚀 Accéder gratuitement
      </a>
    </div>
  );
}

/* ─── Marquee brands ─── */
const BRANDS = [
  "Napperon", "Mazeh Paris", "Boom Boom Dance", "Terra y Mar",
  "Atelier Tiket", "Hopla Studio", "File ton cuir",
  "Yza Handmade", "Awqa", "Ti Matelot",
];

function BrandMarquee() {
  return (
    <div className="overflow-hidden relative py-4">
      <div className="flex animate-marquee whitespace-nowrap gap-8">
        {[...BRANDS, ...BRANDS].map((b, i) => (
          <span key={i} className="inline-block px-6 py-2.5 rounded-xl bg-card border border-border text-sm font-semibold text-foreground shrink-0">
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Founder photo ─── */
import laetitiaPhoto from "@/assets/laetitia-photo.jpg";

function FounderPhoto() {
  return (
    <img
      src={laetitiaPhoto}
      alt="Laetitia, fondatrice de Nowadays"
      className="w-full max-w-xs rounded-2xl shadow-strong object-cover aspect-[3/4]"
      loading="lazy"
    />
  );
}

/* ─── Features grid data ─── */
const FEATURES = [
  { emoji: "🎨", title: "Branding", sub: "Définis ta marque", desc: "Mission, cible, ton, positionnement : pose les fondations de ta com' avec un atelier guidé pas à pas.", soon: false },
  { emoji: "✍️", title: "Création de contenu", sub: "Trouve des idées et rédige", desc: "Formats, angles, accroches, rédaction guidée. De l'idée au post publié, sans panne d'inspiration.", soon: false },
  { emoji: "📅", title: "Calendrier éditorial", sub: "Planifie ta communication", desc: "Calendrier visuel avec tags d'objectif et jauge d'équilibre. Tu sais quoi poster et quand.", soon: false },
  { emoji: "📱", title: "Instagram", sub: "Optimise ton profil", desc: "Bio, stories à la une, audit de profil, routine d'engagement, prospection douce.", soon: false },
  { emoji: "💼", title: "LinkedIn", sub: "Développe ta présence pro", desc: "Audit de profil, optimisation, contenus adaptés au réseau professionnel.", soon: false },
  { emoji: "🔍", title: "SEO / Référencement", sub: "Sois trouvée sur Google", desc: "Mots-clés, optimisation de pages, stratégie de contenu pour le référencement naturel.", soon: false },
  { emoji: "📧", title: "Newsletter / Emailing", sub: "Crée ta liste et fidélise", desc: "Séquences email, newsletters, lead nurturing.", soon: true },
  { emoji: "🌐", title: "Site web / Pages de vente", sub: "Convertis tes visiteurs", desc: "Pages de vente, landing pages, optimisation.", soon: true },
  { emoji: "📰", title: "Relations presse", sub: "Fais parler de toi", desc: "Communiqués, fichier presse, stratégie médias.", soon: true },
];

const PAIN_POINTS = [
  { emoji: "😩", text: "Tu postes quand tu y penses, sans stratégie, et tu as l'impression que ça mène nulle part." },
  { emoji: "📱", text: "Tu passes des heures à chercher quoi dire. Tu ouvres Instagram et tu refermes sans rien publier." },
  { emoji: "🤷", text: "Tu sais que ta com' est importante mais tu ne sais pas par où commencer, ni comment t'organiser." },
];

const TARGET_LIST = [
  "Tu es solopreneuse, freelance, créatrice, coach ou prestataire de services",
  "Tu veux te rendre visible sans trahir tes valeurs",
  "Tu en as marre du marketing agressif et tu cherches une approche qui te ressemble",
  "Tu as besoin de structure sans te sentir enfermée",
  "Tu veux un outil simple, pas une usine à gaz",
  "Tu veux gérer toute ta com' au même endroit (pas 10 outils différents)",
];

const ROADMAP = {
  now: ["Branding & positionnement", "Atelier créatif (idées, rédaction)", "Calendrier éditorial", "Audit Instagram + optimisation", "Audit LinkedIn + optimisation", "Dashboard stats", "Prospection douce", "Communauté"],
  wip: ["SEO / Référencement naturel", "Newsletter & séquences email", "Pages de vente & landing pages"],
  soon: ["Relations presse", "Module Pinterest", "Analyse de la concurrence"],
};

const FAQ_DATA = [
  { q: "C'est quoi la différence avec Canva / Later / ChatGPT ?", a: "Ces outils font une chose. Nous on couvre toute ta com' avec une méthode pensée pour les solopreneuses engagées. Pas des templates génériques." },
  { q: "Est-ce que ça marche pour mon secteur ?", a: "Si tu es dans la mode, l'artisanat, le bien-être, le design, la food, la culture, le coaching, la communication, le graphisme ou n'importe quel métier de service : oui. L'outil s'adapte à ton activité, quel que soit ton secteur." },
  { q: "Je suis débutante, c'est pour moi ?", a: "Surtout pour toi. L'outil est pensé pour celles qui ne savent pas par où commencer." },
  { q: "C'est quoi le Now Studio ?", a: "Un accompagnement de 6 mois avec Laetitia. L'outil + des coachings individuels + une communauté premium. Pour celles qui veulent aller plus loin." },
  { q: "Je peux annuler quand je veux ?", a: "Le plan Outil est sans engagement. Tu annules en 1 clic." },
  { q: "Mes données sont en sécurité ?", a: "Hébergées en Europe, chiffrées, jamais revendues. On est dans la com' éthique, pas dans la data." },
];

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { user, loading } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);

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

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileNav(false);
  };

  return (
    <div className="min-h-screen bg-background font-body text-foreground overflow-x-hidden">
      <StickyCTA />

      {/* ═══ NAVBAR ═══ */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <span className="font-display text-xl font-bold text-bordeaux tracking-tight">Nowadays</span>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" onClick={scrollTo("features")} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Fonctionnalités</a>
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link to="/studio/discover" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Now Studio</Link>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Se connecter</Link>
            <a href="#signup-section" onClick={scrollTo("signup-section")} className="rounded-pill bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium shadow-cta hover:bg-bordeaux transition-all hover:-translate-y-px">
              Commencer gratuitement
            </a>
          </div>
          <button className="md:hidden p-2" onClick={() => setMobileNav(!mobileNav)} aria-label="Menu">
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
        {mobileNav && (
          <div className="md:hidden border-t border-border bg-card px-4 py-4 space-y-3 animate-fade-in">
            <a href="#features" onClick={scrollTo("features")} className="block text-sm font-medium">Fonctionnalités</a>
            <Link to="/pricing" className="block text-sm font-medium">Pricing</Link>
            <Link to="/studio/discover" className="block text-sm font-medium">Now Studio</Link>
            <Link to="/login" className="block text-sm font-medium text-muted-foreground">Se connecter</Link>
            <a href="#signup-section" onClick={scrollTo("signup-section")} className="block text-center rounded-pill bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-cta">
              Commencer gratuitement
            </a>
          </div>
        )}
      </header>

      {/* ═══ HERO ═══ */}
      <section className="relative py-16 sm:py-24 lg:py-32 px-4 overflow-hidden">
        {/* Background shapes — NO circles */}
        <div className="absolute -top-20 -right-32 w-[500px] h-[320px] bg-rose-soft/40 blur-[80px] pointer-events-none animate-float" style={{ clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)" }} />
        <div className="absolute bottom-0 -left-24 w-[400px] h-[250px] bg-accent/20 blur-[80px] pointer-events-none animate-float" style={{ animationDelay: "2s", clipPath: "polygon(25% 0%, 75% 0%, 100% 40%, 85% 100%, 15% 100%, 0% 40%)" }} />

        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="animate-reveal-up">
            <h1 className="font-display text-[28px] sm:text-[40px] lg:text-[52px] font-bold leading-[1.12] text-foreground">
              Ta com' te prend la tête ?
              <br />
              <span className="text-primary">On a créé l'outil qu'il te fallait.</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Définis ta marque, trouve des idées de contenu, planifie ta communication, optimise tes réseaux. Tout au même endroit.
              <br className="hidden sm:block" />
              <strong className="text-foreground">Basé sur une vraie méthode, pas du bullshit marketing.</strong>
            </p>
            <div className="mt-8">
              <a href="#signup-section" onClick={scrollTo("signup-section")}
                className="inline-flex items-center justify-center gap-2 rounded-pill bg-primary text-primary-foreground px-8 py-3.5 text-base font-medium shadow-cta hover:bg-bordeaux transition-all hover:-translate-y-0.5">
                <Rocket className="h-4 w-4" /> Accéder gratuitement
              </a>
              <p className="mt-3 text-xs text-muted-foreground">Gratuit. Sans carte bancaire. En 30 secondes.</p>
            </div>
          </div>

          {/* App screenshot mockup */}
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
                    <div key={i} className={`h-6 rounded-sm border border-border ${i === 3 || i === 9 ? "bg-cal-ready" : i === 7 ? "bg-cal-drafting" : i === 11 ? "bg-cal-published" : ""}`} />
                  ))}
                </div>
              </div>
              <div className="absolute -z-10 -bottom-4 -right-4 w-full h-full bg-accent/30 rounded-2xl pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Social proof banner */}
        <div className="mx-auto max-w-4xl mt-12 sm:mt-16">
          <Reveal>
            <p className="text-center text-sm text-muted-foreground leading-relaxed">
              Construit sur <strong className="text-foreground">10 ans d'expérience</strong> · <strong className="text-foreground">+150 projets accompagnés</strong> · Enseigné à l'<strong className="text-foreground">École des Arts Déco</strong>, <strong className="text-foreground">Sup de Pub</strong>, <strong className="text-foreground">Bureau du Design, de la Mode et des Métiers d'Art</strong>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ SI TU TE RECONNAIS ═══ */}
      <section className="bg-rose-pale py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold text-center mb-12">Si tu te reconnais là-dedans…</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            {PAIN_POINTS.map((p, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="rounded-2xl bg-card border border-border p-6 text-center shadow-card hover:shadow-card-hover transition-shadow h-full">
                  <span className="text-4xl mb-4 block">{p.emoji}</span>
                  <p className="text-sm text-foreground leading-relaxed">{p.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.3}>
            <blockquote className="text-center">
              <p className="font-display text-xl sm:text-2xl font-bold text-foreground leading-snug max-w-2xl mx-auto">
                "Le problème, c'est pas toi.
                <br />
                C'est qu'on ne t'a jamais donné <span className="text-primary">les bons outils.</span>"
              </p>
            </blockquote>
          </Reveal>
        </div>
      </section>

      {/* ═══ FEATURES GRID ═══ */}
      <section id="features" className="py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-4">Tout ce dont tu as besoin, au même endroit</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Pas un énième outil compliqué. Un espace qui te dit quoi faire, te propose des idées, et t'aide à rester régulière.</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <div className={`rounded-2xl border p-6 h-full transition-shadow ${f.soon ? "bg-muted/40 border-border/60 opacity-70" : "bg-card border-border shadow-card hover:shadow-card-hover"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{f.emoji}</span>
                    {f.soon && (
                      <span className="text-[10px] font-semibold bg-accent text-accent-foreground rounded-pill px-2.5 py-1">Coming soon</span>
                    )}
                  </div>
                  <h3 className="font-display text-base font-bold mb-0.5">{f.title}</h3>
                  <p className="text-sm font-medium text-primary mb-2">{f.sub}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ UNE VRAIE MÉTHODE ═══ */}
      <section className="bg-rose-pale py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-4">Pas un outil générique. Une vraie méthode dedans.</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">L'outil est construit sur la méthode Nowadays : 10 ans d'expérience en communication éthique, +150 projets accompagnés, des cours dans les plus grandes écoles.</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { emoji: "🎯", title: "Adapté à TON activité", desc: "Pas des conseils génériques. L'outil connaît ton projet, ta cible, ton ton." },
              { emoji: "💚", title: "Éthique par design", desc: "Zéro manipulation, zéro marketing d'urgence. De la com' humaine et sincère." },
              { emoji: "👩", title: "Créé par une experte", desc: "Derrière l'outil, il y a Laetitia, 10 ans de terrain." },
            ].map((c, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="rounded-2xl bg-card border border-border p-6 text-center shadow-card h-full">
                  <span className="text-4xl mb-4 block">{c.emoji}</span>
                  <h3 className="font-display text-base font-bold mb-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ QUI SUIS-JE ═══ */}
      <section className="py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-10 md:gap-14 items-center">
            <Reveal>
              <div className="flex justify-center md:justify-start">
                <FounderPhoto />
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div>
                <h2 className="font-display text-2xl sm:text-[28px] font-bold mb-6">Moi c'est Laetitia.</h2>
                <div className="space-y-4 text-muted-foreground leading-relaxed text-[15px]">
                  <p>Depuis 10 ans, j'accompagne les solopreneuses engagées à se rendre visibles sans trahir leurs valeurs.</p>
                  <p>J'ai enseigné la communication à l'<strong className="text-foreground">École des Arts Décoratifs (ENSAD-PSL)</strong>, <strong className="text-foreground">Sup de Pub</strong>, <strong className="text-foreground">Bureau du Design, de la Mode et des Métiers d'Art</strong>, et j'ai accompagné +150 solopreneuses : créatrices, artisanes, coachs, freelances en communication, consultantes…</p>
                  <p>J'ai créé cet outil parce que je voyais toujours le même problème : <strong className="text-foreground">des projets magnifiques, invisibles.</strong> Et des femmes qui croyaient que c'était de leur faute.</p>
                  <p className="font-display font-bold text-foreground text-lg">Spoiler : c'est pas toi le problème.</p>
                </div>
                <div className="flex items-center gap-4 mt-6">
                  <a href="https://instagram.com/nowadaysagency" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                    <Instagram className="h-4 w-4" /> Instagram
                  </a>
                  <a href="https://www.linkedin.com/in/laetitiamattioli/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                    <Linkedin className="h-4 w-4" /> LinkedIn
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF ═══ */}
      <section className="bg-rose-pale py-16 sm:py-20 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-10">Elles ont fait confiance à Nowadays</h2>
          </Reveal>
          <BrandMarquee />
          <Reveal delay={0.2}>
            <p className="text-sm text-muted-foreground mt-8 mb-6">+ des dizaines de créatrices, coachs, freelances et solopreneuses accompagnées depuis 2017.</p>
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Enseignante :</strong> ENSAD-PSL · Sup de Pub · Bureau du Design, de la Mode et des Métiers d'Art · CESACOM
              <br />
              <strong className="text-foreground">Citée dans :</strong> L'ADN · Capital · e-marketing.fr · Le Bonbon
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ C'EST POUR TOI SI ═══ */}
      <section className="py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold text-center mb-10">C'est pour toi si…</h2>
          </Reveal>
          <div className="space-y-4">
            {TARGET_LIST.map((item, i) => (
              <Reveal key={i} delay={i * 0.06}>
                <div className="flex items-start gap-3 rounded-xl bg-card border border-border p-4">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground leading-relaxed">{item}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ ROADMAP ═══ */}
      <section className="bg-rose-pale py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-3">L'outil grandit avec toi</h2>
              <p className="text-muted-foreground">On construit en continu. Voilà ce qui arrive bientôt.</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Reveal>
              <div className="rounded-2xl bg-card border border-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">✅</span>
                  <h3 className="font-display text-sm font-bold">Disponible maintenant</h3>
                </div>
                <ul className="space-y-2">
                  {ROADMAP.now.map((item, i) => (
                    <li key={i} className="text-sm text-foreground flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-sm bg-primary shrink-0" />{item}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="rounded-2xl bg-card border border-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">🔨</span>
                  <h3 className="font-display text-sm font-bold">En développement</h3>
                </div>
                <ul className="space-y-2">
                  {ROADMAP.wip.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-sm bg-accent shrink-0" />{item}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="rounded-2xl bg-card border border-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">🔜</span>
                  <h3 className="font-display text-sm font-bold">Bientôt</h3>
                </div>
                <ul className="space-y-2">
                  {ROADMAP.soon.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-sm bg-border shrink-0" />{item}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.3}>
            <p className="text-center mt-8 text-sm text-muted-foreground">
              💡 Une idée ? Dis-nous ce que tu voudrais voir dans l'outil →{" "}
              <a href="https://instagram.com/nowadaysagency" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">Proposer une fonctionnalité</a>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section className="py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-4">Commence gratuitement. Upgrade quand tu es prête.</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
            {/* Free */}
            <Reveal delay={0}>
              <div className="rounded-2xl bg-card border border-border p-6 text-left flex flex-col h-full hover:shadow-card-hover transition-shadow">
                <span className="text-2xl mb-2">🆓</span>
                <h3 className="font-display text-lg font-bold">Gratuit</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-6">L'essentiel pour tester</p>
                <div className="flex-1" />
                <a href="#signup-section" onClick={scrollTo("signup-section")} className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors text-sm">
                  Commencer
                </a>
              </div>
            </Reveal>
            {/* Outil */}
            <Reveal delay={0.1}>
              <div className="rounded-2xl bg-card border-2 border-primary p-6 text-left flex flex-col relative shadow-card-hover h-full">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-pill">Populaire</div>
                <span className="text-2xl mb-2">💎</span>
                <h3 className="font-display text-lg font-bold">Outil</h3>
                <p className="text-primary font-bold text-xl mt-1">39€<span className="text-sm font-normal text-muted-foreground">/mois</span></p>
                <p className="text-sm text-muted-foreground mt-1 mb-6">Tout l'outil débloqué</p>
                <div className="flex-1" />
                <a href="#signup-section" onClick={scrollTo("signup-section")} className="block text-center rounded-pill bg-primary text-primary-foreground py-2.5 font-medium hover:bg-bordeaux transition-colors shadow-cta text-sm">
                  S'abonner
                </a>
              </div>
            </Reveal>
            {/* Now Studio */}
            <Reveal delay={0.2}>
              <div className="rounded-2xl bg-card border border-border p-6 text-left flex flex-col h-full hover:shadow-card-hover transition-shadow">
                <span className="text-2xl mb-2">🌟</span>
                <h3 className="font-display text-lg font-bold">Now Studio</h3>
                <p className="text-primary font-bold text-xl mt-1">250€<span className="text-sm font-normal text-muted-foreground">/mois</span></p>
                <p className="text-sm text-muted-foreground mt-1 mb-6">L'outil + l'accompagnement humain</p>
                <div className="flex-1" />
                <Link to="/studio/discover" className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors text-sm">
                  En savoir plus
                </Link>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.3}>
            <Link to="/pricing" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline mt-8">
              Voir le détail des plans <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="bg-rose-pale py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold mb-10 text-center">Questions fréquentes</h2>
          </Reveal>
          <Accordion type="single" collapsible className="space-y-3">
            {FAQ_DATA.map((faq, i) => (
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
      <section id="signup-section" className="relative py-16 sm:py-24 px-4 overflow-hidden" style={{ background: "linear-gradient(180deg, hsl(340 100% 97%) 0%, hsl(var(--background)) 100%)" }}>
        <Reveal>
          <div className="mx-auto max-w-2xl text-center relative">
            <h2 className="font-display text-2xl sm:text-[36px] font-bold mb-4">
              Ta com' mérite mieux que du bricolage.
              <br />
              <span className="text-primary">Essaie gratuitement, tu verras.</span>
            </h2>
            <p className="text-muted-foreground mb-8 text-base">Rejoins l'outil et commence à structurer ta visibilité dès aujourd'hui.</p>
            <div className="text-left max-w-lg mx-auto">
              <SignupForm />
            </div>
          </div>
        </Reveal>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="bg-foreground text-background py-12 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
            <div className="sm:col-span-2">
              <span className="font-display text-xl font-bold">Nowadays</span>
              <p className="text-sm text-background/60 mt-2 max-w-xs">L'outil de communication pour les solopreneuses et freelances qui veulent se rendre visibles sans trahir leurs valeurs.</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Navigation</h4>
              <nav className="flex flex-col gap-2 text-sm text-background/60">
                <a href="#features" onClick={scrollTo("features")} className="hover:text-background transition-colors">Fonctionnalités</a>
                <Link to="/pricing" className="hover:text-background transition-colors">Pricing</Link>
                <Link to="/studio/discover" className="hover:text-background transition-colors">Now Studio</Link>
                <a href="#faq" onClick={scrollTo("faq")} className="hover:text-background transition-colors">FAQ</a>
              </nav>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Légal</h4>
              <nav className="flex flex-col gap-2 text-sm text-background/60">
                <Link to="/legal-ia" className="hover:text-background transition-colors">Mentions légales</Link>
                <Link to="/legal-ia" className="hover:text-background transition-colors">CGV</Link>
                <Link to="/legal-ia" className="hover:text-background transition-colors">Confidentialité</Link>
              </nav>
              <div className="flex items-center gap-3 mt-4">
                <a href="https://instagram.com/nowadaysagency" target="_blank" rel="noopener noreferrer" className="text-background/60 hover:text-background transition-colors">
                  <Instagram className="h-5 w-5" />
                </a>
                <a href="https://www.linkedin.com/in/laetitiamattioli/" target="_blank" rel="noopener noreferrer" className="text-background/60 hover:text-background transition-colors">
                  <Linkedin className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-background/10 text-center text-xs text-background/40">
            © 2026 Nowadays Agency · Joigny, Bourgogne
          </div>
        </div>
      </footer>
    </div>
  );
}
