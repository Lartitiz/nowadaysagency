import AppHeader from "@/components/AppHeader";
import { Link } from "react-router-dom";
import { PenLine, Star, Search, Lightbulb, CalendarDays, Rocket } from "lucide-react";

const CARDS = [
  { icon: PenLine, emoji: "✍️", title: "Optimiser ma bio", desc: "Première impression parfaite.", to: "/instagram/bio" },
  { icon: Star, emoji: "⭐", title: "Stories à la une", desc: "Organise tes highlights.", to: "/instagram/highlights" },
  { icon: Search, emoji: "🔍", title: "M'inspirer", desc: "Observe et apprends.", to: "/instagram/inspiration" },
  { icon: Lightbulb, emoji: "💡", title: "Trouver des idées", desc: "Direction l'atelier.", to: "/atelier?canal=instagram" },
  { icon: CalendarDays, emoji: "📅", title: "Mon calendrier Insta", desc: "Planifie tes posts.", to: "/calendrier?canal=instagram" },
  { icon: Rocket, emoji: "🚀", title: "Préparer un lancement", desc: "Plan de lancement guidé.", to: "/instagram/lancement" },
];

export default function InstagramHub() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-6 py-8 max-md:px-4">
        <div className="mb-8">
          <h1 className="font-display text-[26px] sm:text-3xl font-bold text-foreground">Mon Instagram</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tout ce dont tu as besoin pour structurer et animer ton compte Instagram.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CARDS.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-2xl border border-border bg-card p-6 hover:border-primary hover:shadow-md transition-all"
            >
              <span className="text-2xl mb-3 block">{card.emoji}</span>
              <h3 className="font-display text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                {card.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
