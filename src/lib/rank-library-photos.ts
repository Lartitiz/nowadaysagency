/**
 * rank-library-photos — classe les photos de la bibliothèque par PERTINENCE
 * pour un contenu donné, au lieu de les proposer par date.
 *
 * Audit du 14/08 : la bande « le fond de cette story » montrait les 4 photos
 * les plus RÉCENTES, les mêmes pour toutes les stories d'une séquence. Sur une
 * story qui parle d'un livre, elle proposait donc trois ordinateurs portables —
 * alors que le rapprochement automatique, lui, avait très bien su choisir le
 * livre. On avait un tri pertinent d'un côté, un tri par date de l'autre.
 *
 * Le classement est DÉTERMINISTE et gratuit : recoupement de mots entre la
 * demande (directive photo + texte de la story) et ce qu'on sait de la photo
 * (sa description, ses tags). Pas d'appel IA — le catalogue a déjà été trié
 * une fois côté serveur, il s'agit seulement de présenter la même intelligence
 * dans la bande.
 *
 * À égalité, l'ordre d'origine (le plus récent d'abord) est conservé.
 */

/** Mots trop courants pour discriminer quoi que ce soit. */
const MOTS_VIDES = new Set([
  "avec", "dans", "pour", "sans", "sous", "plus", "cette", "cette", "leur", "leurs",
  "mais", "donc", "elle", "elles", "nous", "vous", "tout", "tous", "toute", "toutes",
  "être", "etre", "avoir", "fait", "faire", "chez", "entre", "aussi", "comme", "quand",
  "photo", "image", "visuel", "fond", "story", "stories", "post", "contenu",
]);

/** Découpe en mots comparables : minuscules, sans accents, sans pluriel simple. */
export function motsUtiles(texte: string): Set<string> {
  const mots = texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/);
  const out = new Set<string>();
  for (const m of mots) {
    if (m.length < 4) continue;
    const racine = m.endsWith("s") && m.length > 4 ? m.slice(0, -1) : m;
    if (MOTS_VIDES.has(racine) || MOTS_VIDES.has(m)) continue;
    out.add(racine);
  }
  return out;
}

export interface PhotoClassable {
  description?: string | null;
  tags?: string[] | null;
}

/** Ce qu'on sait d'une photo, par défaut lu directement sur l'objet. */
function texteParDefaut(p: PhotoClassable): string {
  return `${p.description || ""} ${(p.tags || []).join(" ")}`;
}

/**
 * Trie une liste de photos par pertinence décroissante pour `demande`.
 * Tri STABLE : à score égal, l'ordre d'entrée (récence) est préservé.
 * Une demande vide renvoie la liste inchangée.
 *
 * `texteDe` permet de classer des objets qui EMBALLENT une photo (ex.
 * `{ row, url }` dans la bande des stories) sans les déballer à l'appel.
 */
export function classerParPertinence<T>(
  photos: readonly T[],
  demande: string,
  texteDe: (item: T) => string = (item) => texteParDefaut(item as PhotoClassable),
): T[] {
  const attendus = motsUtiles(demande || "");
  if (attendus.size === 0) return [...photos];

  return photos
    .map((photo, rang) => {
      const su = motsUtiles(texteDe(photo));
      let score = 0;
      for (const mot of attendus) if (su.has(mot)) score++;
      return { photo, rang, score };
    })
    .sort((a, b) => b.score - a.score || a.rang - b.rang)
    .map((x) => x.photo);
}
