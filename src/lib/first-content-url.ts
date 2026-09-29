/* ── Règle du « premier contenu » ─────────────────────────────────────────
   Module PUR (aucune dépendance navigateur ni Supabase) : c'est la règle
   métier, et c'est elle que les tests unitaires verrouillent. La lecture des
   données vit dans first-content-destination.ts, qui appelle ceci.

   Deux règles, décidées le 14/08 :
   1. le 1er contenu est TOUJOURS un carrousel (le post ressemble trop à ce
      qu'on écrit déjà à la main — le carrousel montre le travail d'un coup) ;
   2. si elle vend des PRODUITS, c'est un carrousel PHOTO : on part de ses
      photos, pas d'un sujet de conseil qui sonne consultante.        ── */

export const SUJET_PREMIER_CONTENU_GENERIQUE =
  "3 erreurs fréquentes dans mon domaine (et comment les éviter)";

export interface FirstContentUrlOptions {
  /** Vend des produits (ou « les deux ») → carrousel photo. */
  sellsProducts: boolean;
  /** Idée personnelle tirée du diagnostic, si déjà prête (enrichment async). */
  subject?: string | null;
}

/**
 * Construit l'URL de démarrage du 1er contenu.
 *
 * Le mode automatique attend les photos du site avant de lancer le carrousel
 * produit. Sans photo exploitable, le choix manuel reste disponible.
 */
export function buildFirstContentUrl({ sellsProducts, subject }: FirstContentUrlOptions): string {
  const sujet = (subject ?? "").trim();
  if (sellsProducts) {
    return "/creer?format=carousel&carouselSubMode=photo&firstProduct=1&auto=1";
  }
  return `/creer?sujet=${encodeURIComponent(
    sujet || SUJET_PREMIER_CONTENU_GENERIQUE,
  )}&format=carousel&carouselSubMode=text&auto=1`;
}
