import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface BaseReminderProps {
  variant?: "atelier" | "stories" | "reels" | "bio" | "newsletter";
}

const VARIANTS: Record<string, { title: string; items: string[] }> = {
  atelier: {
    title: "C'est une base, pas un produit fini.",
    items: [
      "Une anecdote perso (que l'IA ne connaît pas)",
      "Tes mots à toi (remplace ce qui sonne \"pas toi\")",
      "Une opinion tranchée (que l'IA n'a pas)",
      "Un trait d'humour si ça se prête",
    ],
  },
  stories: {
    title: "Séquence prête. Maintenant fais-la sonner comme toi.",
    items: [
      "Tes mots à toi dans chaque story",
      "Une touche perso (anecdote, réaction, détail du jour)",
      "Ton énergie du moment (adapte le ton)",
    ],
  },
  reels: {
    title: "Script prêt. Quand tu le dis face cam, fais-le tien.",
    items: [
      "Reformule avec tes mots naturels",
      "Ajoute une anecdote que l'IA ne connaît pas",
      "Adapte le rythme à ta manière de parler",
    ],
  },
  bio: {
    title: "Version proposée. Ajuste les mots pour que ça sonne 100% toi.",
    items: [
      "Vérifie que chaque mot te ressemble",
      "Remplace ce qui sonne trop \"IA\"",
    ],
  },
  newsletter: {
    title: "Premier jet. C'est dans la personnalisation que la magie opère.",
    items: [
      "Une anecdote perso en intro",
      "Tes mots et ton humour",
      "Un angle que seule toi pourrais donner",
    ],
  },
};

export default function BaseReminder({ variant = "atelier" }: BaseReminderProps) {
  const config = VARIANTS[variant] || VARIANTS.atelier;
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  return (
    <div className="rounded-xl border-l-[3px] border-l-accent bg-accent/5 px-4 py-3 mt-4">
      <p className="text-sm font-medium text-muted-foreground mb-2">
        🚲 {config.title}
      </p>
      <p className="text-xs text-muted-foreground mb-2">Avant de publier, pense à ajouter :</p>
      <div className="space-y-1.5">
        {config.items.map((item, i) => (
          <label key={i} className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={!!checked[i]}
              onCheckedChange={(v) => setChecked(prev => ({ ...prev, [i]: !!v }))}
              className="h-3.5 w-3.5"
            />
            <span className="text-xs text-muted-foreground">{item}</span>
          </label>
        ))}
      </div>
      <p className="text-2xs text-muted-foreground/60 italic mt-2">L'IA structure. Toi, tu incarnes.</p>
    </div>
  );
}
