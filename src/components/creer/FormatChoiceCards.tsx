import { Badge } from "@/components/ui/badge";
import ContentFormatPreview from "./ContentFormatPreview";

export interface FormatChoice {
  /** Format envoyé à handleFormatSelect (« carousel », « linkedin », « pinterest_visual »…). */
  id: string;
  label: string;
  desc: string;
  /** Illustration : un format de ContentFormatPreview, ou une icône courte. */
  preview?: string;
  emoji?: string;
  comingSoon?: boolean;
}

/**
 * Choix du format en cartes compactes (chantier B, 15/10/2026) : l'écran tient sans
 * défiler. Le format conseillé porte un badge ; « Suivant » le choisit.
 */
export default function FormatChoiceCards({ title, choices, recommendedId, recommendedReason, onPick }: {
  title: string;
  choices: FormatChoice[];
  recommendedId?: string;
  recommendedReason?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-2 animate-fade-in">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className={`grid grid-cols-2 gap-2 ${choices.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        {choices.map((c) => {
          const isRecommended = c.id === recommendedId && !c.comingSoon;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              disabled={c.comingSoon}
              data-testid={`creer-format-${c.id}`}
              className={`relative rounded-xl border-2 p-2 text-center transition-all ${
                c.comingSoon
                  ? "opacity-40 cursor-not-allowed border-border bg-muted"
                  : isRecommended
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40"
              }`}
            >
              {c.preview ? <ContentFormatPreview format={c.preview} compact /> : <span className="flex h-16 sm:h-20 mb-2 items-center justify-center rounded-lg bg-rose-pale/60 text-2xl" aria-hidden="true">{c.emoji}</span>}
              <span className="block text-sm font-semibold text-foreground">{c.label}</span>
              <span className="block text-2xs text-muted-foreground mt-0.5 leading-snug">{c.desc}</span>
              {isRecommended && <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary">Conseillé</span>}
              {c.comingSoon && <Badge variant="secondary" className="absolute top-1 right-1 text-2xs">Bientôt</Badge>}
            </button>
          );
        })}
      </div>
      {recommendedId && recommendedReason && (
        <p className="text-xs text-muted-foreground" data-testid="creer-format-recommendation">Conseillé pour ton idée : {recommendedReason.charAt(0).toLowerCase() + recommendedReason.slice(1)}</p>
      )}
    </div>
  );
}
