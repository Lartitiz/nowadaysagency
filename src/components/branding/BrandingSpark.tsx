import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw } from "lucide-react";

const SPARKS: Record<string, string[]> = {
  story: [
    "Si ta meilleure amie devait raconter pourquoi tu as lancé ton projet à une inconnue dans un café, qu'est-ce qu'elle dirait ?",
    "Quel moment précis t'a fait te dire : ok, j'y vais, je me lance ?",
    "Qu'est-ce que tu faisais avant, et pourquoi ça ne te suffisait plus ?",
  ],
  persona: [
    "Pense à ta dernière cliente préférée. Celle qui t'a fait te dire : c'est pour elle que je fais tout ça. Décris-la.",
    "Qu'est-ce que ta cliente idéale tape sur Google à 23h quand elle n'arrive pas à dormir ?",
    "Si tu devais lui écrire un message pour lui dire que tu as exactement ce qu'il lui faut, tu dirais quoi ?",
  ],
  value_proposition: [
    "Ta cliente hésite entre toi et une alternative moins chère. Qu'est-ce qui fait qu'elle te choisit quand même ?",
    "Si tu devais expliquer ce que tu fais à un enfant de 10 ans, tu dirais quoi ?",
    "Quelle transformation concrète ta cliente vit grâce à toi ? Avant/après ?",
  ],
  tone_style: [
    "Si ton projet avait un podcast, quel serait le titre du premier épisode ?",
    "Imagine que quelqu'un reposte ton contenu sans te créditer. À quoi on reconnaît que c'est toi ?",
    "Quels sont les 3 mots que tes clientes utilisent le plus souvent pour te décrire ?",
  ],
  content_strategy: [
    "Quel post as-tu vu récemment qui t'a fait penser : ça, c'est exactement ce que je voudrais faire ?",
    "Si tu ne pouvais parler que de 3 sujets pendant 1 an, ce serait lesquels ?",
    "Quel sujet te met tellement en feu que tu pourrais en parler pendant 2h sans t'arrêter ?",
  ],
};

interface BrandingSparkProps {
  section: string;
  onDismiss: () => void;
}

export default function BrandingSpark({ section, onDismiss }: BrandingSparkProps) {
  const sparks = SPARKS[section] || SPARKS.story;
  const [index, setIndex] = useState(() => Math.floor(Math.random() * sparks.length));

  const regenerate = useCallback(() => {
    setIndex((prev) => {
      let next = Math.floor(Math.random() * sparks.length);
      if (sparks.length > 1) while (next === prev) next = Math.floor(Math.random() * sparks.length);
      return next;
    });
  }, [sparks.length]);

  const handleDismiss = () => {
    try { localStorage.setItem(`spark_dismissed_${section}`, "1"); } catch {}
    onDismiss();
  };

  return (
    <div className="rounded-2xl border border-primary/10 bg-primary/5 p-5 sm:p-6 mb-6">
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">✨</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground mb-2">Pour t'aider à démarrer...</p>
          <p className="text-[15px] italic text-foreground/80 leading-relaxed">{sparks[index]}</p>
          <div className="flex items-center gap-3 mt-4">
            <Button size="sm" onClick={handleDismiss} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              C'est parti !
            </Button>
            <Button variant="ghost" size="sm" onClick={regenerate} className="gap-1.5 text-xs">
              <RefreshCw className="h-3 w-3" />
              Autre question
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
