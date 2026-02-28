import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

type Variant = "branding" | "dashboard";

interface Slide {
  emoji: string;
  title: string;
  text: string;
}

const SLIDES: Record<Variant, Slide[]> = {
  branding: [
    {
      emoji: "🎨",
      title: "Ton branding, c'est ta boussole",
      text: "Tout ce que l'outil génère s'appuie sur ton positionnement, ton ton de voix, ta cible. Plus tu remplis, plus les résultats sont justes.",
    },
    {
      emoji: "✨",
      title: "L'IA propose, tu décides",
      text: "Chaque contenu généré est une base. Tu ajustes, tu personnalises, tu gardes ta voix. L'outil ne parle jamais à ta place.",
    },
    {
      emoji: "🔗",
      title: "Tout est connecté",
      text: "Tu changes ton positionnement ? L'outil te propose de mettre à jour tes contenus. Ton branding reste vivant et cohérent.",
    },
    {
      emoji: "📝",
      title: "Commence par vérifier ton branding",
      text: "J'ai pré-rempli tes fiches à partir du diagnostic. Parcours-les, ajuste ce qui ne te ressemble pas, et valide.",
    },
  ],
  dashboard: [
    {
      emoji: "🏠",
      title: "Bienvenue dans ton espace",
      text: "Ton dashboard te montre où tu en es, ce qu'il te reste à faire, et te guide vers les bonnes actions au bon moment.",
    },
    {
      emoji: "📱",
      title: "Un espace par canal",
      text: "Instagram, LinkedIn, Pinterest, Site web, Newsletter : chaque canal a son espace dédié avec des outils spécifiques.",
    },
    {
      emoji: "💡",
      title: "Tes idées ne se perdent plus",
      text: "L'atelier créatif stocke tes idées. Tu les transformes en contenus quand tu es prête, et tu les envoies au calendrier.",
    },
    {
      emoji: "📅",
      title: "Ton calendrier éditorial",
      text: "Planifie tes publications, visualise ton mois, et crée directement depuis le calendrier. Fini les post-it volants.",
    },
    {
      emoji: "🔍",
      title: "Des audits pour progresser",
      text: "Audite ton Instagram, ton site, ton LinkedIn. L'outil analyse et te donne des actions concrètes à mettre en place.",
    },
    {
      emoji: "🚀",
      title: "C'est ton outil. Explore.",
      text: "Pas besoin de tout faire d'un coup. Commence par ce qui t'inspire. Le reste viendra.",
    },
  ],
};

interface RoomTourProps {
  open: boolean;
  onClose: () => void;
  variant: Variant;
}

export default function RoomTour({ open, onClose, variant }: RoomTourProps) {
  const [current, setCurrent] = useState(0);
  const slides = SLIDES[variant];
  const isLast = current === slides.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      setCurrent(0);
      onClose();
    } else {
      setCurrent((c) => c + 1);
    }
  }, [isLast, onClose]);

  const handleSkip = useCallback(() => {
    setCurrent(0);
    onClose();
  }, [onClose]);

  if (!open) return null;

  const slide = slides[current];

  return (
    <div className="fixed inset-0 z-[100] bg-background/98 backdrop-blur-md flex items-center justify-center px-4">
      <div className="w-full max-w-lg text-center space-y-6">
        {/* Slide content with animation */}
        <div
          key={current}
          className="animate-fade-in space-y-4"
        >
          <span className="text-5xl block">{slide.emoji}</span>
          <h2 className="font-display text-xl text-foreground">{slide.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
            {slide.text}
          </p>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                i === current ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* CTA */}
        <div className="space-y-2">
          <Button
            onClick={handleNext}
            className="rounded-full px-8 py-3"
            size="lg"
          >
            {isLast ? "C'est parti ! 🚀" : "Suivant →"}
          </Button>
          <button
            onClick={handleSkip}
            className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Passer
          </button>
        </div>
      </div>
    </div>
  );
}
