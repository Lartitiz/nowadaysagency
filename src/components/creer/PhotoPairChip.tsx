// Pastille « Avant / Après » de la galerie (26/11/2026, choix de Laetitia sur
// maquette) : la personne dit dans la galerie qu'une paire de photos est un
// avant / après. Une touche : Avant ; une autre : Après ; une troisième : rien.
// Logique pure : src/features/creer/photo-context-step.ts.
// 28/11/2026 (Loom de Laetitia : « ça ne parle qu'à une typologie de personne ») :
// la pastille n'est plus montrée sous chaque photo. On marque un avant / après
// depuis le menu « … » de la photo ; la pastille n'apparaît qu'une fois posée.
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cyclePairRole, pairChips, pairChipsUnbalanced, splitPairMark, withPairMark, type ContextStepPhoto, type PairRole } from "@/features/creer/photo-context-step";

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

/** Pose (ou retire) le rôle avant / après d'une photo, sans toucher à son texte. */
function setPairRole<T extends ContextStepPhoto>(photos: T[], index: number, role: PairRole | null): T[] {
  return photos.map((p, i) => (i === index ? { ...p, context: withPairMark(role, splitPairMark(p.context).text) } : p));
}

/** Pastille d'une photo DÉJÀ marquée avant ou après (touche : rôle suivant). Rien sinon. */
export function PhotoPairChip<T extends ContextStepPhoto>({ photos, index, onChange }: { photos: T[]; index: number; onChange: (next: T[]) => void }) {
  if (!enoughForPair(photos)) return null;
  const chip = pairChips(photos)[index];
  if (!chip.role) return null;
  return (
    <button
      type="button"
      data-testid="photo-pair-chip"
      aria-label={`Photo ${index + 1} : ${chip.label}. Toucher pour changer.`}
      onClick={() => onChange(cyclePairRole(photos, index))}
      className={cn("min-h-8 self-center rounded-full border px-3 text-xs transition-colors", "border-primary bg-primary text-primary-foreground")}
    >
      {chip.label}
    </button>
  );
}

/** Menu « … » d'une photo : marquer un avant / après (rangé là, il ne sert qu'à certaines). */
export function PhotoPairMenu<T extends ContextStepPhoto>({ photos, index, onChange }: { photos: T[]; index: number; onChange: (next: T[]) => void }) {
  if (!enoughForPair(photos)) return null;
  const role = pairChips(photos)[index].role;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid="photo-more-menu" aria-label={`Plus d'options pour la photo ${index + 1}`}
          className="min-h-9 min-w-9 rounded-full text-muted-foreground hover:bg-muted flex items-center justify-center">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {role !== "before" && <DropdownMenuItem onClick={() => onChange(setPairRole(photos, index, "before"))}>C'est un « avant »</DropdownMenuItem>}
        {role !== "after" && <DropdownMenuItem onClick={() => onChange(setPairRole(photos, index, "after"))}>C'est un « après »</DropdownMenuItem>}
        {role && <DropdownMenuItem onClick={() => onChange(setPairRole(photos, index, null))}>Ni avant ni après</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phrase d'aide : seulement quand un avant / après a commencé à être marqué. */
export function PhotoPairHint({ photos }: { photos: ContextStepPhoto[] }) {
  if (!enoughForPair(photos)) return null;
  if (!pairChips(photos).some((c) => c.role)) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="photo-pair-hint">
      {pairChipsUnbalanced(photos)
        ? "Il faut autant d'avants que d'après : marque l'autre photo de la paire avec « … », sinon je ne les relie pas."
        : "Je mets chaque avant et son après sur deux slides qui se suivent."}
    </p>
  );
}
