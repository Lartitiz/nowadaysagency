import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface LaunchStoriesDay {
  id: string;
  label: string;
  dayLabel: string;
  storiesRange: string;
  description: string;
  presets: {
    objective: string;
    subject: string;
    price_range?: string;
    structure_hint?: string;
  };
  hasGenerate: boolean;
}

const LAUNCH_STORIES_DAYS: LaunchStoriesDay[] = [
  {
    id: "j-7", label: "Teasing", dayLabel: "J-7", storiesRange: "3-5 stories",
    description: "Indices visuels, \"tu devines ?\", sondage curiosité, compte à rebours",
    presets: { objective: "amplification", subject: "Teasing du lancement", structure_hint: "teasing" },
    hasGenerate: true,
  },
  {
    id: "j-5", label: "Problème", dayLabel: "J-5", storiesRange: "5-7 stories",
    description: "Nommer le problème, identification, sondage \"ça te parle ?\", fausse solution vs vraie",
    presets: { objective: "education", subject: "Problème que mon offre résout", structure_hint: "probleme_solution" },
    hasGenerate: true,
  },
  {
    id: "j-3", label: "Preuve sociale", dayLabel: "J-3", storiesRange: "4-6 stories",
    description: "Témoignages, before/after, résultats concrets, \"regarde ce qu'on m'a envoyé\"",
    presets: { objective: "vente", subject: "Témoignages et preuves sociales", structure_hint: "vente_douce" },
    hasGenerate: true,
  },
  {
    id: "j-1", label: "FAQ + Objections", dayLabel: "J-1", storiesRange: "5-8 stories",
    description: "Questions fréquentes, \"j'ai pas le temps / le budget\", réponses face cam douces",
    presets: { objective: "education", subject: "FAQ et objections sur mon offre", structure_hint: "faq_live" },
    hasGenerate: true,
  },
  {
    id: "j0", label: "Vente complète", dayLabel: "JOUR J", storiesRange: "7-10 stories",
    description: "Séquence de vente complète : hook → problème → solution → offre → preuve → CTA",
    presets: { objective: "vente", price_range: "moyen", subject: "Séquence de vente complète" },
    hasGenerate: true,
  },
  {
    id: "j+1", label: "Preuve + urgence", dayLabel: "J+1 à J+3", storiesRange: "4-6 stories/jour",
    description: "Nouveaux témoignages, coulisses des inscriptions, \"il reste X places\"",
    presets: { objective: "vente", subject: "Preuve sociale post-lancement", structure_hint: "vente_douce" },
    hasGenerate: true,
  },
  {
    id: "last", label: "Last call", dayLabel: "Dernier jour", storiesRange: "5-7 stories",
    description: "\"Dernières heures\", récap de ce que tu rates, dernier témoignage, CTA final doux",
    presets: { objective: "vente", subject: "Last call", structure_hint: "vente_douce" },
    hasGenerate: true,
  },
];

const STRUCTURE_DETAILS: Record<string, string[]> = {
  "j-7": [
    "Story 1 : Indice visuel flou / mystérieux 👀",
    "Story 2 : \"Tu devines ce que je prépare ?\" + sondage",
    "Story 3 : 2ème indice un peu plus clair",
    "Story 4 : \"Active le rappel pour ne rien louper\" + ⏰ compte à rebours",
  ],
  "j-5": [
    "Story 1 : Hook émotionnel \"Tu te reconnais ?\"",
    "Story 2 : Nommer le problème précisément",
    "Story 3 : Pourquoi les \"fausses solutions\" ne marchent pas",
    "Story 4 : Sondage \"Ça te parle ?\"",
    "Story 5 : Teaser de la vraie solution (sans la nommer)",
    "Story 6 : \"J'en reparle bientôt...\" + question ouverte",
  ],
  "j-3": [
    "Story 1 : \"Regarde ce qu'on m'a envoyé\" (screenshot DM / témoignage)",
    "Story 2 : Contexte du before de la personne",
    "Story 3 : Le résultat concret obtenu",
    "Story 4 : 2ème témoignage ou résultat",
    "Story 5 : \"Tu veux la même chose ?\" + CTA doux",
  ],
  "j-1": [
    "Story 1 : \"Je réponds à vos questions les plus fréquentes 👇\"",
    "Story 2 : Objection 1 \"J'ai pas le temps\" → réponse",
    "Story 3 : Objection 2 \"C'est trop cher\" → réponse",
    "Story 4 : Objection 3 \"Je peux faire seul·e\" → réponse",
    "Story 5 : Question fréquente → réponse",
    "Story 6 : \"D'autres questions ? Écris-moi 💬\"",
  ],
  "j0": [
    "Story 1 : Hook fort \"Aujourd'hui c'est le jour\"",
    "Story 2 : Le problème que tu résous",
    "Story 3 : Ta solution (nom de l'offre + tagline)",
    "Story 4-5 : Ce que contient l'offre",
    "Story 6 : Pour qui c'est fait",
    "Story 7 : Témoignage / preuve",
    "Story 8 : Pratique (prix, durée, dates)",
    "Story 9 : CTA \"Écris [MOT] en DM\" ou lien",
    "Story 10 : Bonus / urgence douce",
  ],
  "j+1": [
    "Story 1 : \"Les inscriptions arrivent 🔥\" + capture écran",
    "Story 2 : Nouveau témoignage reçu depuis l'ouverture",
    "Story 3 : Coulisses (toi qui lis les inscriptions)",
    "Story 4 : \"Il reste X places\" (si applicable)",
    "Story 5 : CTA rappel",
  ],
  "last": [
    "Story 1 : \"Dernières heures ⏰\"",
    "Story 2 : Récap de tout ce que tu obtiens",
    "Story 3 : Ce que tu rates si tu ne rejoins pas",
    "Story 4 : Dernier témoignage (le plus fort)",
    "Story 5 : \"C'est maintenant ou jamais\" + CTA final",
    "Story 6 : \"Merci à toutes celles qui ont rejoint 💛\"",
  ],
};

interface Props {
  launchName?: string;
}

export default function LaunchStoriesPlanning({ launchName }: Props) {
  const navigate = useNavigate();
  const [expandedStructure, setExpandedStructure] = useState<string | null>(null);

  const handleGenerate = (day: LaunchStoriesDay) => {
    const presets = { ...day.presets };
    if (launchName) {
      presets.subject = presets.subject.replace("mon offre", launchName);
    }
    navigate("/instagram/stories", {
      state: {
        fromHighlights: true,
        ...presets,
        face_cam: "mixte",
        time_available: "30min",
        is_launch: true,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-l-[3px] border-l-[#8B5CF6] bg-card p-5">
        <h2 className="font-display text-lg font-bold text-foreground mb-1">📱 Planning stories de lancement</h2>
        <p className="text-sm text-muted-foreground">
          Chaque jour de lancement a sa séquence stories dédiée.
        </p>
      </div>

      {LAUNCH_STORIES_DAYS.map((day) => (
        <div key={day.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{day.dayLabel}</span>
            <span className="text-sm font-semibold text-foreground">{day.label}</span>
            <span className="text-xs text-muted-foreground ml-auto">{day.storiesRange}</span>
          </div>
          <p className="text-xs text-muted-foreground">{day.description}</p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" className="rounded-full text-xs gap-1" onClick={() => handleGenerate(day)}>
              ✨ Générer
            </Button>
            <Button
              variant="ghost" size="sm" className="rounded-full text-xs gap-1"
              onClick={() => setExpandedStructure(expandedStructure === day.id ? null : day.id)}
            >
              📖 {expandedStructure === day.id ? "Masquer" : "Voir la structure"}
            </Button>
          </div>

          {expandedStructure === day.id && STRUCTURE_DETAILS[day.id] && (
            <div className="mt-2 rounded-xl bg-muted/30 p-3 space-y-1 animate-fade-in">
              {STRUCTURE_DETAILS[day.id].map((line, i) => (
                <p key={i} className="text-xs text-foreground">{line}</p>
              ))}
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                💡 Clique sur "Générer" pour que l'IA crée cette séquence complète avec tes textes personnalisés.
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
