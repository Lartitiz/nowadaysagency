import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
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
} from "lucide-react";

import Reveal from "@/components/landing/Reveal";
import SignupForm from "@/components/landing/SignupForm";
import StickyCTA from "@/components/landing/StickyCTA";
import BrandMarquee from "@/components/landing/BrandMarquee";
import FounderPhoto from "@/components/landing/FounderPhoto";
import MiniDiagnostic from "@/components/landing/MiniDiagnostic";

/* ─── Features grid data ─── */
const FEATURES = [
  {
    emoji: "🎨",
    title: "Ton identité de marque",
    desc: "Mission, cible, ton, positionnement, storytelling, offres : pose les fondations de ta com' avec un atelier guidé. L'IA te pose les bonnes questions, tu réponds, et ta marque prend forme.",
    visual: "branding",
  },
  {
    emoji: "✍️",
    title: "Création de contenu IA",
    desc: "Choisis un format (carrousel, reel, post, story, newsletter…), un angle, et l'IA rédige pour toi. Avec TA voix, parce qu'elle connaît ton branding.",
    visual: "content",
  },
  {
    emoji: "📅",
    title: "Calendrier éditorial",
    desc: "Vue mensuelle, drag & drop, tags d'objectif. Tu vois ce qui est prévu, ce qui est publié, ce qui manque. Tu sais quoi poster et quand.",
    visual: "calendar",
  },
  {
    emoji: "🔍",
    title: "Audits Instagram et SEO",
    desc: "Colle ton @ ou ton URL, et l'outil analyse tout : bio, posts, régularité, hashtags, mots-clés, structure du site. Tu repars avec des actions concrètes.",
    visual: "audit",
  },
  {
    emoji: "📱",
    title: "Espaces par canal",
    desc: "Instagram, LinkedIn, Pinterest, Site web, Newsletter : chaque canal a son espace dédié avec ses guides, ses checklists et ses générateurs.",
    visual: "channels",
  },
];

const PAIN_POINTS = [
  {
    emoji: "📱",
    pain: "Tu ouvres Instagram, tu fixes l'écran, et tu refermes. Tu sais pas quoi poster, ni quand, ni comment.",
    flip: "L'outil te propose des idées adaptées à TON activité, et les place dans un calendrier. Tu sais quoi faire chaque semaine.",
    flipEmoji: "📅",
  },
  {
    emoji: "🎯",
    pain: "Tu postes un peu au feeling, un carrousel par-ci, une story par-là. Mais t'as aucune idée de si ça marche ou pas.",
    flip: "L'outil diagnostique ta com', identifie tes forces et tes failles, et te donne un plan d'action clair. Plus de bricolage.",
    flipEmoji: "🔍",
  },
  {
    emoji: "😶",
    pain: "Tu t'es formée, t'as regardé des tutos, lu des posts. Mais quand tu te retrouves seule devant ton écran, rien ne sort.",
    flip: "Chaque étape est guidée. Tu réponds à des questions, l'outil structure pour toi. Tu n'es plus seule face à ta page blanche.",
    flipEmoji: "✨",
  },
];

const TARGET_LIST = [
  "Tu es solopreneuse, freelance, créatrice, coach ou prestataire de services",
  "Tu veux te rendre visible sans trahir tes valeurs",
  "Tu en as marre du marketing agressif et tu cherches une approche qui te ressemble",
  "Tu as besoin de structure sans te sentir enfermée",
  "Tu veux un outil simple, pas une usine à gaz",
  "Tu veux gérer toute ta com' au même endroit (pas 10 outils différents)",
];

const FAQ_DATA = [
  { q: "C'est quoi la différence avec Canva / Later / ChatGPT ?", a: "Ces outils font une chose. Nous on couvre toute ta com' avec une méthode pensée pour les solopreneuses engagées. Pas des templates génériques." },
  { q: "Est-ce que ça marche pour mon secteur ?", a: "Si tu es dans la mode, l'artisanat, le bien-être, le design, la food, la culture, le coaching, la communication, le graphisme ou n'importe quel métier de service : oui. L'outil s'adapte à ton activité, quel que soit ton secteur." },
  { q: "Je suis débutante, c'est pour moi ?", a: "Surtout pour toi. L'outil est pensé pour celles qui ne savent pas par où commencer." },
  { q: "C'est quoi « Ta binôme de com » ?", a: "Un accompagnement de 6 mois avec Laetitia. L'outil + des sessions visio individuelles + un support WhatsApp. Pour celles et ceux qui veulent structurer leur com' avec quelqu'un à leurs côtés." },
  { q: "Je peux annuler quand je veux ?", a: "Le plan Outil est sans engagement. Tu annules en 1 clic." },
  { q: "Mes données sont en sécurité ?", a: "Hébergées en Europe, chiffrées, jamais revendues. On est dans la com' éthique, pas dans la data." },
];

/* ─── Feature Visual Component ─── */
function FeatureVisual({ type }: { type: string }) {
  const baseClass = "rounded-2xl bg-card border border-border shadow-card p-5";

  if (type === "branding") {
    return (
      <div className={baseClass}>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 font-mono">🎨 Mon identité</p>
        <div className="space-y-2.5">
          {[
            { label: "Mission", value: "Aider les femmes à lancer leur marque éthique", pct: 100 },
            { label: "Client·e idéal·e", value: "Créatrice 28-40 ans, éco-engagée", pct: 100 },
            { label: "Ton & style", value: "Chaleureux, direct, engagé", pct: 85 },
            { label: "Offres", value: "2 offres définies", pct: 60 },
          ].map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{item.label}</span>
                <span className="text-[10px] text-muted-foreground">{item.pct}%</span>
              </div>
              <div className="h-1.5 rounded-sm bg-border overflow-hidden">
                <div className="h-full rounded-sm bg-primary transition-all" style={{ width: `${item.pct}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "content") {
    return (
      <div className={baseClass}>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 font-mono">✍️ Générer un contenu</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {["Carrousel", "Reel", "Post photo", "Story", "Newsletter"].map((format) => (
            <span key={format} className="rounded-pill bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">{format}</span>
          ))}
        </div>
        <div className="rounded-xl bg-rose-pale/60 border border-border p-3 mb-3">
          <p className="text-[11px] text-foreground leading-relaxed">
            <span className="font-semibold">Hook :</span> Tu passes 2h sur un post pour 12 likes ?
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
            Voici 3 raisons pour lesquelles le problème n'est pas ton contenu…
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 rounded-pill bg-primary/90 px-3 flex items-center text-[10px] font-medium text-primary-foreground">✨ Régénérer</div>
          <div className="h-7 rounded-pill border border-border px-3 flex items-center text-[10px] font-medium text-foreground">📋 Copier</div>
        </div>
      </div>
    );
  }

  if (type === "calendar") {
    return (
      <div className={baseClass}>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 font-mono">📅 Mars 2026</p>
        <div className="grid grid-cols-7 gap-1">
          {["L", "M", "M", "J", "V", "S", "D"].map((j, idx) => (
            <span key={idx} className="text-[9px] text-muted-foreground text-center font-medium py-1">{j}</span>
          ))}
          {Array.from({ length: 28 }).map((_, idx) => {
            const hasPost = [2, 5, 9, 12, 16, 19, 23, 26].includes(idx);
            const isPublished = [2, 5, 9].includes(idx);
            const isDraft = [12].includes(idx);
            return (
              <div key={idx} className={`h-7 rounded-lg border text-center flex items-center justify-center text-[10px] ${
                hasPost
                  ? isPublished
                    ? "bg-green-100 border-green-200 text-green-700"
                    : isDraft
                      ? "bg-amber-100 border-amber-200 text-amber-700"
                      : "bg-pink-100 border-pink-200 text-pink-600"
                  : "border-border"
              }`}>
                {hasPost ? (isPublished ? "📸" : isDraft ? "📝" : "🎠") : ""}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-200" /> Publié</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-200" /> Brouillon</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-pink-200" /> Planifié</span>
        </div>
      </div>
    );
  }

  if (type === "audit") {
    return (
      <div className={baseClass}>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 font-mono">🔍 Audit Instagram</p>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" className="text-border" strokeWidth="3" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" className="text-primary" strokeWidth="3" strokeDasharray="68, 100" strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">68</span>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Score : 68/100</p>
            <p className="text-[11px] text-muted-foreground">4 forces · 3 axes d'amélioration</p>
          </div>
        </div>
        <div className="space-y-2">
          {[
            { label: "✅ Bio claire et engageante", good: true },
            { label: "✅ Identité visuelle cohérente", good: true },
            { label: "⚠️ Régularité de publication faible", good: false },
            { label: "⚠️ Pas de CTA dans les posts", good: false },
          ].map((item) => (
            <div key={item.label} className={`text-[11px] px-3 py-1.5 rounded-lg ${item.good ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "channels") {
    return (
      <div className={baseClass}>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 font-mono">📱 Tes canaux</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { emoji: "📸", name: "Instagram", status: "Audit fait", active: true },
            { emoji: "💼", name: "LinkedIn", status: "À configurer", active: false },
            { emoji: "📌", name: "Pinterest", status: "En cours", active: true },
            { emoji: "🌐", name: "Site web", status: "Audit fait", active: true },
            { emoji: "✉️", name: "Newsletter", status: "À configurer", active: false },
            { emoji: "🔍", name: "SEO", status: "En cours", active: true },
          ].map((canal) => (
            <div key={canal.name} className={`rounded-xl border p-3 ${canal.active ? "border-primary/30 bg-primary/[0.03]" : "border-border"}`}>
              <span className="text-lg block mb-1">{canal.emoji}</span>
              <p className="text-xs font-medium text-foreground">{canal.name}</p>
              <p className={`text-[10px] ${canal.active ? "text-primary" : "text-muted-foreground"}`}>{canal.status}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

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
    <div className="min-h-screen bg-background font-body text-foreground overflow-x-hidden pb-20 lg:pb-0">
      <StickyCTA />

      {/* ═══ NAVBAR ═══ */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
        <nav role="navigation" aria-label="Navigation principale" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <span className="font-display text-xl font-bold text-bordeaux tracking-tight">Nowadays</span>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" onClick={scrollTo("features")} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Fonctionnalités</a>
            <Link to="/pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link to="/binome" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Accompagnement</Link>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Se connecter</Link>
            <a href="#signup-section" onClick={scrollTo("signup-section")} className="rounded-pill bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium shadow-cta hover:bg-bordeaux transition-all hover:-translate-y-px">
              Commencer gratuitement
            </a>
          </div>
          <button className="md:hidden p-2" onClick={() => setMobileNav(!mobileNav)} aria-label="Ouvrir le menu de navigation" aria-expanded={mobileNav}>
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
        {mobileNav && (
          <div className="md:hidden border-t border-border bg-card px-4 py-4 space-y-3 animate-fade-in">
            <a href="#features" onClick={scrollTo("features")} className="block text-sm font-medium">Fonctionnalités</a>
            <Link to="/pricing" className="block text-sm font-medium">Pricing</Link>
            <Link to="/binome" className="block text-sm font-medium">Accompagnement</Link>
            <Link to="/login" className="block text-sm font-medium text-muted-foreground">Se connecter</Link>
            <a href="#signup-section" onClick={scrollTo("signup-section")} className="block text-center rounded-pill bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-cta">
              Commencer gratuitement
            </a>
          </div>
        )}
      </header>

      {/* ═══ HERO ═══ */}
      <main id="main-content" role="main">
      <section aria-label="Présentation de L'Assistant Com'" className="relative py-16 sm:py-24 lg:py-32 px-4 overflow-hidden">
        {/* Background shapes */}
        <div className="absolute -top-20 -right-32 w-[500px] h-[320px] bg-rose-soft/40 blur-[80px] pointer-events-none animate-float" style={{ clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)" }} />
        <div className="absolute bottom-0 -left-24 w-[400px] h-[250px] bg-accent/20 blur-[80px] pointer-events-none animate-float" style={{ animationDelay: "2s", clipPath: "polygon(25% 0%, 75% 0%, 100% 40%, 85% 100%, 15% 100%, 0% 40%)" }} />

        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="animate-reveal-up">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary/10 text-primary text-xs font-semibold px-4 py-1.5 mb-6">
              ✨ Pour solopreneuses créatives et éthiques
            </span>
            <h1 className="font-display text-[28px] sm:text-[40px] lg:text-[52px] font-bold leading-[1.12] text-foreground">
              L'outil de com' que t'aurais aimé avoir
              <br />
              <span className="text-primary">depuis le début.</span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
              Branding, création de contenu, calendrier éditorial, audits Instagram et SEO. Tout au même endroit, guidé pas à pas.
              <br className="hidden sm:block" />
              <strong className="text-foreground">Conçu pour les projets engagés. Avec une vraie méthode dedans.</strong>
              <span className="sr-only">Outil de communication tout-en-un pour solopreneuses, artisanes, coachs et freelances créatives.</span>
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
              <div className="rounded-2xl bg-card border border-border shadow-strong p-5 transform rotate-1 hover:rotate-0 transition-transform duration-500 space-y-4">

                {/* Mini calendrier semaine */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">📅 Calendrier éditorial</p>
                  <div className="grid grid-cols-7 gap-1.5">
                    {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((jour) => (
                      <span key={jour} className="text-[9px] text-muted-foreground text-center font-medium">{jour}</span>
                    ))}
                    <div className="h-8 rounded-lg bg-green-100 border border-green-200 flex items-center justify-center text-xs">📸</div>
                    <div className="h-8 rounded-lg border border-border" />
                    <div className="h-8 rounded-lg bg-pink-100 border border-pink-200 flex items-center justify-center text-xs">🎠</div>
                    <div className="h-8 rounded-lg border border-border" />
                    <div className="h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-xs">🎬</div>
                    <div className="h-8 rounded-lg border border-border" />
                    <div className="h-8 rounded-lg bg-green-100 border border-green-200 flex items-center justify-center text-xs">📱</div>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Générateur de contenu */}
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">✍️ Création de contenu</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {["Storytelling", "Conseil", "Coulisses"].map((pilier) => (
                      <span key={pilier} className="rounded-pill bg-secondary px-2.5 py-1 text-[10px] font-medium text-secondary-foreground">{pilier}</span>
                    ))}
                  </div>
                  <div className="h-8 w-36 rounded-pill bg-primary/90 flex items-center justify-center gap-1.5 text-[11px] font-medium text-primary-foreground animate-pulse-subtle">
                    ✨ Générer un post
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Score diagnostic */}
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" className="text-border" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" className="text-primary" strokeWidth="3" strokeDasharray="72, 100" strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">72</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">🔍 Score com'</p>
                    <p className="text-[11px] text-foreground mt-0.5">3 priorités identifiées</p>
                  </div>
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
      <section aria-label="Problèmes courants en communication" className="bg-rose-pale py-16 sm:py-24 px-4">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-[32px] font-bold text-center mb-12">Si tu te reconnais là-dedans…</h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            {PAIN_POINTS.map((p, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className="rounded-2xl bg-card border border-border shadow-card hover:shadow-card-hover transition-shadow h-full overflow-hidden">
                  {/* Partie haute : la douleur */}
                  <div className="p-6 pb-4">
                    <span className="text-3xl mb-3 block">{p.emoji}</span>
                    <p className="text-sm text-foreground leading-relaxed">{p.pain}</p>
                  </div>
                  {/* Séparateur */}
                  <div className="mx-6 h-px bg-border" />
                  {/* Partie basse : le retournement */}
                  <div className="p-6 pt-4 bg-primary/[0.03]">
                    <div className="flex items-start gap-2">
                      <span className="text-lg shrink-0 mt-0.5">{p.flipEmoji}</span>
                      <p className="text-sm text-primary font-medium leading-relaxed">{p.flip}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.3}>
            <blockquote className="text-center">
              <p className="font-display text-xl sm:text-2xl font-bold text-foreground leading-snug max-w-2xl mx-auto">
                "Le problème, c'est pas toi.
                <br />
                C'est que personne ne t'avait donné <span className="text-primary">un outil pensé pour ton quotidien.</span>"
              </p>
            </blockquote>
          </Reveal>
        </div>
      </section>

      {/* ═══ MINI DIAGNOSTIC ═══ */}
      <section aria-label="Mini diagnostic communication" className="py-12 sm:py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <MiniDiagnostic />
          </Reveal>
        </div>
      </section>

      {/* ═══ FEATURES GRID ═══ */}
      <section id="features" aria-label="Fonctionnalités de l'outil" className="py-16 sm:py-24 px-4">
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
      <section aria-label="La méthode Nowadays" className="bg-rose-pale py-16 sm:py-24 px-4">
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
      <section aria-label="À propos de Laetitia" className="py-16 sm:py-24 px-4">
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
      <section aria-label="Témoignages et références" className="bg-rose-pale py-16 sm:py-20 px-4">
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
      <section aria-label="À qui s'adresse l'outil" className="py-16 sm:py-24 px-4">
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
      <section aria-label="Feuille de route" className="bg-rose-pale py-16 sm:py-24 px-4">
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
      <section aria-label="Tarifs" className="py-16 sm:py-24 px-4">
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
            {/* Ton binôme de com' */}
            <Reveal delay={0.2}>
              <div className="rounded-2xl bg-card border border-border p-6 text-left flex flex-col h-full hover:shadow-card-hover transition-shadow">
                <span className="text-2xl mb-2">🤝</span>
                <h3 className="font-display text-lg font-bold">Ta binôme de com</h3>
                <p className="text-primary font-bold text-xl mt-1">250€<span className="text-sm font-normal text-muted-foreground">/mois × 6</span></p>
                <p className="text-sm text-muted-foreground mt-1 mb-6">L'outil + Laetitia à tes côtés. On fait ensemble.</p>
                <div className="flex-1" />
                <Link to="/binome" className="block text-center rounded-pill border border-border py-2.5 font-medium text-foreground hover:bg-secondary transition-colors text-sm">
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
      <section aria-label="Questions fréquentes" className="bg-rose-pale py-16 sm:py-24 px-4">
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
      <section id="signup-section" aria-label="Inscription gratuite" className="relative py-16 sm:py-24 px-4 overflow-hidden" style={{ background: "linear-gradient(180deg, hsl(340 100% 97%) 0%, hsl(var(--background)) 100%)" }}>
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
              <p className="text-sm text-background/60 mt-2 max-w-xs">L'assistant de communication éthique pour solopreneuses, créatrices et freelances. Branding, réseaux sociaux, SEO : tout pour se rendre visible sans trahir ses valeurs.</p>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Navigation</h4>
              <nav className="flex flex-col gap-2 text-sm text-background/60">
                <a href="#features" onClick={scrollTo("features")} className="hover:text-background transition-colors">Fonctionnalités</a>
                <Link to="/pricing" className="hover:text-background transition-colors">Pricing</Link>
                <Link to="/binome" className="hover:text-background transition-colors">Accompagnement</Link>
                <a href="#faq" onClick={scrollTo("faq")} className="hover:text-background transition-colors">FAQ</a>
              </nav>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-3">Légal</h4>
              <nav className="flex flex-col gap-2 text-sm text-background/60">
                <Link to="/mentions-legales" className="hover:text-background transition-colors">Mentions légales</Link>
                <Link to="/cgu-cgv" className="hover:text-background transition-colors">CGU / CGV</Link>
                <Link to="/confidentialite" className="hover:text-background transition-colors">Confidentialité</Link>
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
      </main>
    </div>
  );
}
