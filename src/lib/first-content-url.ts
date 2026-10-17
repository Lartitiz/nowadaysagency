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
  /** Fiche de cette idée : le carrousel s'enregistre DANS l'idée au lieu d'en
      créer une seconde (sinon l'idée reste « à placer » une fois le carrousel
      fait — passe du 16/10). */
  ideaId?: string | null;
}

/**
 * Construit l'URL de démarrage du 1er contenu.
 *
 * Le mode automatique attend les photos du site avant de lancer le carrousel
 * produit. Sans photo exploitable, le choix manuel reste disponible.
 */
export function buildFirstContentUrl({ sellsProducts, subject, ideaId }: FirstContentUrlOptions): string {
  const sujet = (subject ?? "").trim();
  // Sans sujet personnel, pas de fiche à relier (sujet générique).
  const fiche = sujet && ideaId ? ideaId : "";
  if (sellsProducts) {
    // Le sujet n'entre PAS comme `sujet` (le carrousel photo part des photos),
    // mais voyage en repli : sans photo exploitable (pas de site, site sans
    // photo), /creer bascule sur un carrousel texte avec cette idée au lieu de
    // laisser la nouvelle inscrite devant un mode photo vide (passe du 10/10).
    // La fiche ne voyage qu'avec ce repli : un carrousel de ses photos ne
    // parle pas de l'idée, il ne doit pas la marquer comme faite.
    return `/creer?format=carousel&carouselSubMode=photo&firstProduct=1&auto=1&sujetSansPhoto=${encodeURIComponent(
      sujet || SUJET_PREMIER_CONTENU_GENERIQUE,
    )}${fiche ? `&ideaSansPhoto=${encodeURIComponent(fiche)}` : ""}`;
  }
  return `/creer?sujet=${encodeURIComponent(
    sujet || SUJET_PREMIER_CONTENU_GENERIQUE,
  )}&format=carousel&carouselSubMode=text&auto=1${fiche ? `&idea_id=${encodeURIComponent(fiche)}` : ""}`;
}
