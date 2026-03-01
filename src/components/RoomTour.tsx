import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

const SLIDES = [
  {
    emoji: "✨",
    title: "Bienvenue dans ton outil de com'",
    text: "Tu viens de répondre à plein de questions sur toi, ton activité, ta cible, tes canaux. Et pendant ce temps, l'outil a bossé en coulisses. Il a analysé tout ça. Du coup maintenant, il te connaît. Et c'est ça qui change tout.",
  },
  {
    emoji: "⚡",
    title: "Ça change quoi pour toi ?",
    text: "Ça veut dire qu'à chaque fois que tu crées un contenu ici, tu ne repars pas de zéro. L'outil connaît ton projet. Il te propose des textes qui te ressemblent, avec les bonnes structures et les bons formats.\nCe qui te prenait une heure t'en prend vingt.",
  },
  {
    emoji: "🧠",
    title: "Derrière, il y a une vraie méthode",
    text: "C'est pas un ChatGPT qui écrit du texte générique. Chaque contenu est basé sur des structures qui fonctionnent (testées et approuvées ✅). Tu n'as pas besoin de maîtriser tout ça.\nPour que toi tu restes concentrée sur ton métier.",
  },
  {
    emoji: "🧭",
    title: "Et surtout, tu sais toujours quoi faire",
    text: "Fini le \"bon, je poste quoi aujourd'hui\u00a0?\". L'outil te dit\u00a0: voilà tes prochaines étapes, voilà ce qui va avoir le plus d'impact pour te rendre visible et attirer tes client·es, en fonction de ton objectif. Tu es guidée. Tu as un plan. Tu avances. Même quand t'as que 30 minutes devant toi.",
  },
  {
    emoji: "🗂️",
    title: "Tout est organisé, au même endroit",
    text: "Ton calendrier éditorial pour voir ton mois d'un coup d'œil. Ton atelier pour stocker tes idées. (Même celles de 2h du mat'.) Tes espaces pour bosser sur Instagram, ton site ou LinkedIn sans te disperser. Un seul endroit. Fini les 12 onglets, les post-it et les Google Docs oubliés.",
  },
  {
    emoji: "🚀",
    title: "On y va ?",
    text: "On va maintenant générer ton plan de com' personnalisé à partir de tout ce que tu m'as dit. Tes priorités, tes premiers contenus, ton calendrier\u00a0: tout se met en place.",
  },
];

function renderText(text: string) {
  // Split on parenthetical asides and quoted phrases to wrap them in <em>
  const parts: (string | JSX.Element)[] = [];
  // Match (…) or "…" segments
  const regex = /(\([^)]+\)|"[^"]+\??")/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<em key={key++} className="not-italic text-muted-foreground/70">{match[0]}</em>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

interface RoomTourProps {
  open: boolean;
  onClose: () => void;
  onGeneratePlan?: () => void;
}

export default function RoomTour({ open, onClose, onGeneratePlan }: RoomTourProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const isLast = currentSlide === SLIDES.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      setCurrentSlide(0);
      onClose();
    } else {
      setCurrentSlide((s) => s + 1);
    }
  }, [isLast, onClose]);

  const handleSkip = useCallback(() => {
    setCurrentSlide(0);
    onClose();
  }, [onClose]);

  if (!open) return null;

  const slide = SLIDES[currentSlide];

  return (
    <div className="fixed inset-0 z-[100] bg-background/98 backdrop-blur-md flex items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Slide content */}
        <div
          key={currentSlide}
          className="animate-fade-in space-y-4 text-center"
        >
          <span className="text-5xl block">{slide.emoji}</span>
          <h2 className="font-display text-xl text-foreground">{slide.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto font-sans">
            {renderText(slide.text)}
          </p>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-2">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                i === currentSlide ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* CTA */}
        <div className="space-y-2 text-center">
          {!isLast ? (
            <Button
              onClick={handleNext}
              className="rounded-full px-8 py-3 text-sm font-medium"
              size="lg"
            >
              Suivant →
            </Button>
          ) : (
            <Button
              onClick={onGeneratePlan || handleNext}
              className="rounded-full px-8 py-3 text-sm font-medium"
              size="lg"
            >
              Générer mon plan de com' →
            </Button>
          )}
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
