// Pastille « Avant / Après » de la galerie (26/11/2026, choix de Laetitia sur
// maquette) : la personne dit dans la galerie qu'une paire de photos est un
// avant / après. Une touche : Avant ; une autre : Après ; une troisième : rien.
// Logique pure : src/features/creer/photo-context-step.ts.
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { cyclePairRole, pairChips, pairChipsUnbalanced, splitPairMark, withPairMark, type ContextStepPhoto } from "@/features/creer/photo-context-step";

/** Au moins deux photos choisies : la pastille a un sens. */
const enoughForPair = (photos: ContextStepPhoto[]) => photos.filter((p) => !p?.stockAmbient).length >= 2;

/** Champ « contexte » d'une vignette : le marqueur avant / après n'y apparaît pas et n'est pas perdu. */
export function PhotoContextInput({ value, pairMarks, onChange }: { value?: string; pairMarks?: boolean; onChange: (context: string) => void }) {
  return (
    <Input
      value={pairMarks ? splitPairMark(value).text : value ?? ""}
      onChange={(e) => onChange(pairMarks ? withPairMark(splitPairMark(value).role, e.target.value) : e.target.value)}
      placeholder="Ex : le moment, le lieu ou le détail à retenir"
      maxLength={200}
      className="h-8 text-xs px-2"
    />
  );
}

export function PhotoPairChip<T extends ContextStepPhoto>({ photos, index, onChange }: { photos: T[]; index: number; onChange: (next: T[]) => void }) {
  if (!enoughForPair(photos)) return null;
  const chip = pairChips(photos)[index];
  return (
    <button
      type="button"
      data-testid="photo-pair-chip"
      aria-label={`Photo ${index + 1} : ${chip.role ? chip.label : "ni avant ni après"}. Toucher pour changer.`}
      onClick={() => onChange(cyclePairRole(photos, index))}
      className={cn(
        "min-h-8 self-center rounded-full border px-3 text-xs transition-colors",
        chip.role ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/40",
      )}
    >
      {chip.label}
    </button>
  );
}

export function PhotoPairHint({ photos }: { photos: ContextStepPhoto[] }) {
  if (!enoughForPair(photos)) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="photo-pair-hint">
      {pairChipsUnbalanced(photos)
        ? "Il faut autant d'avants que d'après : marque l'autre photo de la paire, sinon je ne les relie pas."
        : "Un avant et un après ? Touche la pastille sous chaque photo : je les mets sur deux slides qui se suivent."}
    </p>
  );
}
