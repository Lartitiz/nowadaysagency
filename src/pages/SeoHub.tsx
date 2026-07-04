import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const CARDS = [
  { emoji: "🔍", title: "Auditer mon site", desc: "Scanne ton site pour identifier les améliorations prioritaires.", to: "/seo/audit" },
  { emoji: "🔑", title: "Trouver des mots-clés", desc: "Découvre les mots-clés que tes client·es recherchent vraiment.", to: "/seo/idees" },
  { emoji: "📊", title: "Piloter mes mots-clés", desc: "Centralise et décide quels mots-clés cibler.", to: "/seo/cockpit" },
  { emoji: "📈", title: "Analyser mes mots-clés", desc: "Évalue le potentiel réel de tes mots-clés.", to: "/seo/analyser" },
  { emoji: "✏️", title: "Optimiser une page", desc: "Améliore concrètement le contenu de tes pages existantes.", to: "/seo/optimiser" },
  { emoji: "🏗️", title: "Structurer mon site", desc: "Organise tes pages en silos thématiques pour que Google comprenne ton univers.", to: "/seo/structure" },
  { emoji: "📰", title: "Trouver des contacts presse", desc: "Identifie les médias et blogs pertinents pour obtenir des backlinks.", to: "/seo/presse" },
  { emoji: "✅", title: "Compiler mon plan d'action", desc: "Compile le tout en un plan personnalisé sur 6 mois.", to: "/seo/plan" },
];

export default function SeoHub() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
        </Link>
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-3xl font-bold text-foreground">🔎 Mon SEO</h1>
          <p className="mt-1 text-base text-muted-foreground">Audite ton site, trouve tes mots-clés, optimise tes pages : l'objectif c'est que Google te trouve avant tes concurrent·es.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => (
            <Link key={card.to} to={card.to} className="group relative rounded-2xl border border-border bg-card p-6 hover:border-primary hover:shadow-md transition-all cursor-pointer">
              <span className="text-2xl mb-3 block">{card.emoji}</span>
              <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">{card.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
