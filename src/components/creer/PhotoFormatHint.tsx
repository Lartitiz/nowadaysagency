// Petite ligne sous le choix du canal quand des photos sont déjà chargées.
// Le texte dépend du canal : sur LinkedIn, rien n'est masqué et le Reel
// n'existe pas (test LinkedIn d'Auriana, 12/11/2026 : « carrousel ou le Reel »
// alors que l'écran propose Post / Carrousel).

type Props = {
  channel: string;
  photoCount: number;
  forceShowAll: boolean;
  onForceShowAll: (value: boolean) => void;
};

export function photoFormatHintText(channel: string, photoCount: number): { text: string; canFilter: boolean } | null {
  if (photoCount <= 0) return null;
  const multi = photoCount >= 2;
  if (channel === "instagram") {
    return multi
      ? { text: "Avec plusieurs photos, on te propose le carrousel ou le Reel.", canFilter: true }
      : { text: "Quelques formats sont masqués car ils n'utilisent pas tes photos.", canFilter: true };
  }
  if (channel === "linkedin") {
    return multi ? { text: "Avec plusieurs photos, le carrousel les montre toutes.", canFilter: false } : null;
  }
  if (channel === "pinterest") {
    return { text: "Le format texte seul est masqué car il n'utilise pas tes photos.", canFilter: true };
  }
  return null;
}

export default function PhotoFormatHint({ channel, photoCount, forceShowAll, onForceShowAll }: Props) {
  const hint = photoFormatHintText(channel, photoCount);
  if (!hint) return null;
  if (!hint.canFilter) return <p className="text-xs text-muted-foreground -mt-1">{hint.text}</p>;
  return (
    <p className="text-xs text-muted-foreground -mt-1">
      {!forceShowAll ? (
        <>
          {hint.text}{" "}
          <button type="button" onClick={() => onForceShowAll(true)} className="text-primary hover:underline">
            Tout afficher quand même
          </button>
        </>
      ) : (
        <>
          Tous les formats sont affichés.{" "}
          <button type="button" onClick={() => onForceShowAll(false)} className="text-primary hover:underline">
            Masquer ceux qui n'utilisent pas mes photos
          </button>
        </>
      )}
    </p>
  );
}
