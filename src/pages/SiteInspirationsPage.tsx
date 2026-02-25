import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Badge } from "@/components/ui/badge";

const SECTION_TYPES = [
  { id: "hero", emoji: "🚀", title: "Section Hero", desc: "Titre + sous-titre + CTA + image", popular: true },
  { id: "benefits", emoji: "✨", title: "Section Bénéfices", desc: "3 colonnes icône + titre + texte" },
  { id: "testimonials", emoji: "💬", title: "Section Témoignages", desc: "Grille ou slider de citations" },
  { id: "how_it_works", emoji: "🗺️", title: "Comment ça marche", desc: "3 étapes numérotées" },
  { id: "pricing", emoji: "💰", title: "Section Prix / Offre", desc: "Card avec features + CTA" },
  { id: "faq", emoji: "❓", title: "Section FAQ", desc: "Accordéon questions/réponses" },
  { id: "about_mini", emoji: "👋", title: "À propos condensé", desc: "Photo + texte + CTA" },
  { id: "social_proof", emoji: "🏆", title: "Preuve sociale", desc: "Chiffres, logos, badges" },
  { id: "footer", emoji: "📍", title: "Footer", desc: "Liens + newsletter + réseaux" },
];

export default function SiteInspirationsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
        <SubPageHeader
          parentLabel="Mon Site Web"
          parentTo="/site"
          currentLabel="Inspirations visuelles"
        />

        <div className="space-y-2">
          <h1 className="text-2xl font-display font-bold text-foreground">🎨 Inspirations visuelles</h1>
          <p className="text-sm text-muted-foreground">
            Des templates de sections prêts à copier-coller dans ton site. Personnalisés avec ton branding.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SECTION_TYPES.map((section) => (
            <button
              key={section.id}
              onClick={() => navigate(`/site/inspirations/${section.id}`)}
              className="rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/40 hover:shadow-sm transition-all group space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{section.emoji}</span>
                {section.popular && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    Populaire
                  </Badge>
                )}
              </div>
              <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                {section.title}
              </h3>
              <p className="text-xs text-muted-foreground">{section.desc}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
