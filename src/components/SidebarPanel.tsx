import { Lightbulb } from "lucide-react";
import PlanMiniRecap from "@/components/PlanMiniRecap";

const CONSEILS = [
  "Tu n'as pas besoin de poster tous les jours. Tu as besoin de poster avec intention.",
  "Un bon post par semaine vaut mieux que 7 posts vides.",
  "Si ton post fait réagir 10 personnes qui correspondent à ta cible, c'est un succès.",
  "Arrête de te comparer aux comptes qui ont 50K abonné·es. Toi, tu construis une communauté, pas une audience.",
  "Le contenu parfait n'existe pas. Le contenu publié, oui.",
  "Ton expertise mérite d'être visible. Poster, c'est un acte de générosité.",
  "Les algorithmes changent, les vraies connexions restent.",
  "Raconte ton histoire : c'est la seule chose que personne ne peut copier.",
  "La régularité bat la perfection. Toujours.",
  "Ton audience ne veut pas du contenu lisse. Elle veut du vrai.",
  "Chaque post est une graine. Certaines germent tout de suite, d'autres dans 6 mois.",
  "Ta voix unique est ton meilleur atout marketing.",
  "Mieux vaut 100 abonné·es engagé·es que 10 000 fantômes.",
  "Créer du contenu, c'est documenter ton expertise, pas performer.",
  "L'authenticité n'est pas une stratégie, c'est un état d'esprit.",
];

export default function SidebarPanel() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const conseil = CONSEILS[dayOfYear % CONSEILS.length];

  return (
    <div className="space-y-5">
      {/* Mini plan recap */}
      <PlanMiniRecap />

      {/* Conseil */}
      <div className="rounded-2xl bg-rose-pale border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h3 className="font-display text-lg font-bold">Le conseil Nowadays</h3>
        </div>
        <p className="text-sm text-foreground leading-relaxed italic">"{conseil}"</p>
      </div>
    </div>
  );
}
