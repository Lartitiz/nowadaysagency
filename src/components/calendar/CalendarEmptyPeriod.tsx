import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

/** Contenu le plus proche HORS de la période affichée (voir Calendar.tsx). */
export type NearestOutsidePost = { date: string; direction: "future" | "past" };

/* ── État vide d'une période du calendrier ──
   Partagé par les 4 rendus du calendrier (mois/semaine × desktop/mobile).
   Une grille nue ne dit rien : ni que la période est vide, ni qu'il y a du
   contenu ailleurs. Le dashboard sait déjà nommer le prochain contenu — on dit
   la même chose ici, avec le raccourci pour y aller.

   🔑 Un seul composant EXPRÈS : l'état vide n'existait à l'origine que dans la
   branche mobile du mois (cf. PR #658). Deux rendus = deux occasions d'oublier. */
export function CalendarEmptyPeriod({
  periodLabel,
  isMobile,
  filtersActive,
  nearestOutsidePost,
  onJumpToDate,
}: {
  /** « ce mois-ci » / « cette semaine » — se glisse tel quel dans les phrases. */
  periodLabel: string;
  isMobile: boolean;
  filtersActive?: boolean;
  nearestOutsidePost?: NearestOutsidePost | null;
  onJumpToDate?: (dateStr: string) => void;
}) {
  // Une période « vide » à cause d'un filtre n'est pas vide : le dire, sinon on
  // invite à créer un contenu qui existe déjà mais qui est masqué.
  if (filtersActive) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <CalendarIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Aucun contenu ne correspond à tes filtres {periodLabel}. Enlève un filtre pour voir le reste.
        </p>
      </div>
    );
  }

  const nearestLabel = nearestOutsidePost
    ? format(new Date(nearestOutsidePost.date + "T00:00:00"), "EEEE d MMMM", { locale: fr })
    : null;

  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center">
      <CalendarIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Rien de prévu {periodLabel}. {isMobile ? "Touche" : "Clique"} <span className="font-semibold text-foreground">＋</span> sur un jour pour planifier un contenu 🌸
      </p>
      {nearestOutsidePost && nearestLabel && (
        <p className="mt-3 text-sm text-muted-foreground">
          {nearestOutsidePost.direction === "future" ? "Ton prochain contenu est le " : "Ton dernier contenu était le "}
          <span className="font-medium text-foreground">{nearestLabel}</span>.{" "}
          {onJumpToDate && (
            <button
              type="button"
              onClick={() => onJumpToDate(nearestOutsidePost.date)}
              className="font-medium text-primary-text underline underline-offset-2 hover:text-primary transition-colors"
            >
              {nearestOutsidePost.direction === "future" ? "Y aller" : "Le revoir"}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
