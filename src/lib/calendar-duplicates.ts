/**
 * Garde-fou anti-doublon du calendrier éditorial.
 *
 * Constaté le 01/08 : le même contenu ("Les 3 erreurs qui font que les
 * solopreneurs…") posé **11 fois** sur le 15 août, sans que l'app ne bronche.
 * Chaque passage dans un parcours de création reprogrammait le même sujet au
 * même endroit, et la case du calendrier finissait par déborder.
 *
 * On ne pose PAS de contrainte en base : dupliquer un contenu est une action
 * légitime et volontaire (bouton « Dupliquer » du calendrier, un même sujet
 * décliné sur deux réseaux…). Le garde-fou vit donc côté parcours : il
 * s'applique là où un doublon est ACCIDENTEL (programmer, planifier sa semaine,
 * cartes de l'assistant, ajout en lot, plan de lancement), jamais sur une
 * duplication demandée.
 */

export interface PlannedLike {
  date: string;
  theme?: string | null;
  canal?: string | null;
}

/**
 * Deux contenus sont « le même » s'ils tombent le même jour, sur le même
 * réseau, avec le même sujet. La casse, les espaces de bord et les espaces
 * multiples ne comptent pas : c'est le même sujet retapé, pas un autre.
 */
export function plannedKey(row: PlannedLike): string {
  const theme = String(row.theme ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const canal = String(row.canal ?? "").trim().toLowerCase();
  return `${row.date}|${canal}|${theme}`;
}

/** Un contenu sans sujet ne peut pas être jugé en double : on le laisse passer. */
export function isComparable(row: PlannedLike): boolean {
  return Boolean(row.date && String(row.theme ?? "").trim());
}

export interface PlannedScope {
  userId: string;
  /** workspace_id quand on travaille sur l'espace d'une cliente, sinon undefined */
  workspaceId?: string | null;
}

/**
 * Clés déjà présentes au calendrier, pour les dates concernées uniquement
 * (une requête, bornée aux jours qu'on s'apprête à remplir).
 */
export async function fetchPlannedKeys(
  rows: PlannedLike[],
  scope: PlannedScope,
): Promise<Set<string>> {
  const dates = Array.from(new Set(rows.filter(isComparable).map((r) => r.date)));
  if (dates.length === 0) return new Set();

  // Import différé : ce module doit rester chargeable hors navigateur (le
  // client Supabase lit `localStorage` dès son import, ce qui casse les tests
  // unitaires en Node — et la logique pure ci-dessus mérite d'être testée).
  const { supabase } = await import("@/integrations/supabase/client");
  const query = supabase.from("calendar_posts").select("date, theme, canal").in("date", dates);
  const scoped =
    scope.workspaceId && scope.workspaceId !== scope.userId
      ? query.eq("workspace_id", scope.workspaceId)
      : query.eq("user_id", scope.userId);

  const { data, error } = await scoped;
  // En cas d'erreur réseau on préfère laisser passer : bloquer une
  // programmation parce que la vérification a échoué serait pire que le doublon.
  if (error || !data) return new Set();
  return new Set(data.map((r) => plannedKey(r as PlannedLike)));
}

export interface SplitResult<T> {
  /** À insérer : rien d'identique au calendrier, et pas de doublon dans le lot */
  fresh: T[];
  /** Écartés parce que déjà prévus ce jour-là */
  duplicates: T[];
}

/**
 * Sépare ce qui est nouveau de ce qui est déjà prévu — y compris les doublons
 * INTERNES au lot (deux fois la même ligne dans un même plan).
 */
export function splitAlreadyPlanned<T extends PlannedLike>(
  rows: T[],
  existingKeys: Set<string>,
): SplitResult<T> {
  const seen = new Set(existingKeys);
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const row of rows) {
    if (!isComparable(row)) {
      fresh.push(row);
      continue;
    }
    const key = plannedKey(row);
    if (seen.has(key)) {
      duplicates.push(row);
    } else {
      seen.add(key);
      fresh.push(row);
    }
  }
  return { fresh, duplicates };
}

/** Message court et humain à afficher quand on a écarté des doublons. */
export function duplicateMessage(count: number, total: number): string {
  if (count <= 0) return "";
  if (count === total) {
    return total === 1
      ? "C'est déjà prévu ce jour-là — rien de nouveau ajouté."
      : "Tout ça est déjà prévu à ces dates — rien de nouveau ajouté.";
  }
  return count === 1
    ? "1 contenu était déjà prévu : il n'a pas été ajouté deux fois."
    : `${count} contenus étaient déjà prévus : ils n'ont pas été ajoutés deux fois.`;
}

/**
 * Raccourci pour les parcours qui posent un lot : va chercher l'existant puis
 * sépare. Les appelants qui ont déjà les clés utilisent splitAlreadyPlanned.
 */
export async function dropAlreadyPlanned<T extends PlannedLike>(
  rows: T[],
  scope: PlannedScope,
): Promise<SplitResult<T>> {
  const existing = await fetchPlannedKeys(rows, scope);
  return splitAlreadyPlanned(rows, existing);
}
