import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Check, X, ArrowRight, Sparkles, Star } from "lucide-react";

const CALENDLY_URL = "https://calendly.com/laetitia-mattioli/appel-decouverte";

function CalendlyCTA({ className = "" }: { className?: string }) {
  return (
    <a
      href={CALENDLY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-pill bg-primary text-primary-foreground px-8 py-3.5 font-semibold shadow-cta hover:bg-bordeaux transition-all hover:-translate-y-0.5 text-base ${className}`}
    >
      <Sparkles className="h-5 w-5" /> Réserver mon appel découverte
    </a>
  );
}

/* ─── Data ─── */
const BEFORE_AFTER = {
  before: [
    "Invisible malgré ses efforts",
    "Poste au feeling, sans plan",
    "Se sent seule et illégitime",
    "Ventes irrégulières",
  ],
  after: [
    "Visible auprès des bonnes personnes",
    "Un système de com' clair et tenable",
    "Fait partie d'un réseau de soutien",
    "Ventes régulières et stables",
  ],
};

const INCLUDES = [
  { emoji: "🛠️", title: "L'Assistant Com' Premium inclus", desc: "Valeur 39€/mois : 300 crédits IA, audits illimités, tout débloqué" },
  { emoji: "🎯", title: "6 sessions visio de 2h avec Laetitia", desc: "Sur-mesure, en visio. On fait ensemble." },
  { emoji: "💬", title: "Support WhatsApp jours ouvrés", desc: "Tu poses tes questions entre les sessions. Réponse sous 24-48h." },
  { emoji: "✅", title: "Validation de tes livrables", desc: "Laetitia valide ta bio, ton branding, ton calendrier, tes contenus." },
  { emoji: "📋", title: "Espace accompagnement dans l'outil", desc: "Sessions, livrables, journal de bord : tout au même endroit." },
  { emoji: "🧭", title: "Stratégie sur mesure (mois 1-2)", desc: "Branding, positionnement, persona, plan d'action 6 mois." },
  { emoji: "🚀", title: "Application accompagnée (mois 3-6)", desc: "On met en œuvre ensemble. Contenus, calendrier, profils optimisés." },
  { emoji: "📚", title: "Accès à vie au contenu", desc: "Replays, exercices, templates : tout reste accessible après les 6 mois." },
];

const COMPARISONS = [
  { vs: "Formations en ligne", diff: "On FAIT ensemble. Pas de vidéos que tu ne regardes jamais." },
  { vs: "Agences", diff: "Tu apprends, tu deviens autonome. 10× moins cher." },
  { vs: "Coachs business", diff: "Du concret, pas du mindset. Des livrables, pas des mantras." },
  { vs: "YouTube / gratuit", diff: "Structuré, personnalisé, accompagné. Pas perdu dans 1000 vidéos." },
];

const TESTIMONIALS = [
  {
    name: "Sarah",
    activity: "Napperon · Décoration éthique",
    quote: "En 3 mois j'ai enfin une stratégie claire. Je ne poste plus au hasard et mes ventes ont suivi.",
    result: "+120% de CA en 4 mois",
  },
  {
    name: "Amina",
    activity: "Mazeh Paris · Cosmétiques naturels",
    quote: "Laetitia m'a aidée à trouver MA voix. L'accompagnement avec elle, c'est le meilleur investissement que j'ai fait.",
    result: "3× plus de DM qualifiés",
  },
  {
    name: "Julie",
    activity: "Boom Boom Dance · Cours de danse",
    quote: "Avant je culpabilisais de vendre. Maintenant je communique avec joie et mes cours sont pleins.",
    result: "Cours complets 2 mois à l'avance",
  },
];

const FOR_YOU = [
  "Tu es solopreneuse, freelance, créatrice ou coach",
  "Tu portes un projet qui a du sens (éthique, engagé, artisanal, créatif, humain)",
  "Tu veux te rendre visible sans trahir tes valeurs",
  "Tu es prête à passer à l'action pendant 6 mois",
];
const NOT_FOR_YOU = [
  "Tu cherches du growth hacking ou des hacks viraux",
  "Tu veux déléguer ta com' sans apprendre",
  "Tu n'as pas 2h/semaine à consacrer au programme",
];

const OBJECTIONS = [
  { q: "250€/mois c'est trop cher pour moi", a: "C'est moins qu'un·e community manager freelance (800-2000€/mois). Et tu acquiers des compétences à vie. C'est un investissement, pas une dépense." },
  { q: "Je n'ai pas le temps", a: "L'accompagnement est conçu pour les entrepreneur·es débordé·es. 2-3h par semaine suffisent. L'outil automatise le reste." },
  { q: "Je suis débutant·e, c'est pour moi ?", a: "C'est même idéal ! Tu poses les bonnes bases dès le départ au lieu de perdre des mois à tâtonner." },
  { q: "Et si ça ne marche pas ?", a: "L'accompagnement est satisfait ou remboursé. Si tu appliques tout et que tu n'as pas de résultats, on te rembourse." },
  { q: "Je peux juste prendre l'outil à 39€ ?", a: "Bien sûr ! L'outil seul est déjà très complet. L'accompagnement Binôme ajoute l'humain pour aller plus vite et plus loin." },
  { q: "6 mois c'est un engagement long", a: "C'est le temps qu'il faut pour poser des fondations solides. Pas de raccourci, mais des résultats durables." },
  { q: "Qu'est-ce qui te différencie des autres ?", a: "10 ans d'expérience, enseignante en école de com', spécialisée solopreneur·es engagé·es. Et un outil IA sur-mesure : pas un Google Doc." },
];

export default function BinomeSalesPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-secondary/40" style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 0 100%)" }} />
        <div className="relative mx-auto max-w-4xl px-4 pt-20 pb-28 sm:pt-28 sm:pb-36 text-center">
          <span className="inline-block mb-4 text-sm font-semibold text-primary bg-primary/10 px-4 py-1.5 rounded-pill">
            🤝 Ta binôme de com
          </span>
          <h1 className="font-display text-[32px] sm:text-[48px] font-bold text-foreground leading-[1.15] mb-5">
            6 mois pour poser
            <br />
            <span className="text-primary">toute ta com'.</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
            L'outil fait le quotidien.
            <br className="hidden sm:block" />
            Moi je te débloque.
          </p>
          <CalendlyCTA />
          <p className="mt-4 text-sm text-muted-foreground">
            ✨ 30 minutes · Sans engagement
          </p>
        </div>
      </section>

      {/* ── LE PROBLÈME ── */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:py-20">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-4">
          Tu fais un travail magnifique.
          <br />
          <span className="text-primary">Mais personne ne le voit.</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-10">
          {[
            { emoji: "😩", text: "Tu postes au feeling sans résultat" },
            { emoji: "😔", text: "Tu culpabilises de « te vendre »" },
            { emoji: "🤷‍♀️", text: "Tu ne sais pas par où commencer" },
          ].map((item) => (
            <div key={item.text} className="rounded-2xl bg-card border border-border p-6 text-center">
              <span className="text-3xl mb-3 block">{item.emoji}</span>
              <p className="text-sm text-foreground font-medium">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRANSFORMATION ── */}
      <section className="bg-secondary/30 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-10">
            La transformation
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
              <h3 className="font-bold text-destructive mb-4 text-lg">Avant</h3>
              <ul className="space-y-3">
                {BEFORE_AFTER.before.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <h3 className="font-bold text-primary mb-4 text-lg">Après</h3>
              <ul className="space-y-3">
                {BEFORE_AFTER.after.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CE QUI EST INCLUS ── */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:py-20">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-10">
          Ce qui est inclus
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INCLUDES.map((item) => (
            <div key={item.title} className="flex gap-4 items-start rounded-2xl bg-card border border-border p-5">
              <span className="text-2xl shrink-0">{item.emoji}</span>
              <div>
                <p className="font-semibold text-foreground text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMPARAISON ── */}
      <section className="bg-secondary/30 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-10">
            Pourquoi pas juste une formation en ligne ?
          </h2>
          <div className="space-y-4">
            {COMPARISONS.map((c) => (
              <div key={c.vs} className="rounded-2xl bg-card border border-border p-5">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                  vs {c.vs}
                </p>
                <p className="text-sm text-foreground">{c.diff}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TÉMOIGNAGES ── */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:py-20">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-10">
          Elles l'ont fait
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="rounded-2xl bg-card border border-border p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-10 w-10 rounded-pill bg-secondary flex items-center justify-center font-bold text-primary text-sm">
                  {t.name[0]}
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.activity}</p>
                </div>
              </div>
              <p className="text-sm text-foreground leading-relaxed flex-1">« {t.quote} »</p>
              <div className="mt-4 rounded-xl bg-primary/10 px-3 py-2">
                <p className="text-xs font-bold text-primary">{t.result}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── POUR QUI / PAS POUR QUI ── */}
      <section className="bg-secondary/30 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-10">
            C'est pour toi si…
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-card border border-border p-6">
              <h3 className="font-bold text-primary mb-4">✅ Pour toi</h3>
              <ul className="space-y-3">
                {FOR_YOU.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-card border border-border p-6">
              <h3 className="font-bold text-destructive mb-4">❌ Pas pour toi</h3>
              <ul className="space-y-3">
                {NOT_FOR_YOU.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── OBJECTIONS ── */}
      <section className="mx-auto max-w-2xl px-4 py-16 sm:py-20">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-center mb-10">
          Tu te demandes sûrement…
        </h2>
        <Accordion type="single" collapsible className="space-y-3">
          {OBJECTIONS.map((o, i) => (
            <AccordionItem
              key={i}
              value={`obj-${i}`}
              className="rounded-2xl border border-border bg-card px-5"
            >
              <AccordionTrigger className="text-left text-sm font-semibold text-foreground hover:no-underline py-4">
                {o.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                {o.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* ── PRIX ── */}
      <section className="bg-secondary/30 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
            L'investissement
          </h2>
          <p className="text-4xl sm:text-5xl font-bold text-primary mb-2">
            250€<span className="text-lg font-normal text-muted-foreground">/mois × 6 mois</span>
          </p>
          <p className="text-muted-foreground mb-2">soit 1 500€ au total</p>
          <p className="text-sm font-semibold text-primary mb-6">Satisfaite ou remboursée.</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-8">
            Moins qu'un community manager. Des compétences à vie.
          </p>
          <CalendlyCTA />
          <p className="mt-4 text-xs text-muted-foreground">
            30 min pour faire le point sur ton projet. Sans engagement, sans pression.
          </p>
        </div>
      </section>

      {/* ── LAETITIA ── */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <div className="rounded-2xl bg-card border border-border p-8 sm:p-10 text-center">
          <div className="h-20 w-20 rounded-pill bg-secondary mx-auto mb-5 flex items-center justify-center text-3xl font-bold text-primary">
            L
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold mb-3">
            Je suis Laetitia
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-lg mx-auto mb-5">
            J'accompagne les solopreneuses engagées depuis 10 ans à devenir visibles
            sans trahir leurs valeurs. J'ai créé Nowadays pour que chacune ait
            accès à des outils de com' de qualité — sans budget d'agence.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {["Enseignante ENSAD-PSL, Sup de Pub, Bureau du Design", "+150 projets accompagnés", "Citée dans L'ADN, Capital, e-marketing"].map((item) => (
              <span
                key={item}
                className="text-xs bg-secondary text-foreground px-3 py-1.5 rounded-pill font-medium"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
          Prête ?
        </h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Réserve ton appel découverte. 30 minutes pour faire le point sur
          ton projet. Sans engagement, sans pression.
        </p>
        <CalendlyCTA />
      </section>

      {/* ── Footer link ── */}
      <footer className="border-t border-border py-8 text-center">
        <Link to="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
          ← Retour à l'accueil
        </Link>
      </footer>
    </div>
  );
}
