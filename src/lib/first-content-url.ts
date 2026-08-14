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
 * Mode photo : pas de `auto=1`. La génération a besoin des photos AVANT, donc
 * on atterrit sur l'étape qui les demande (et qui propose de les récupérer
 * depuis son site / Instagram) au lieu de lancer une génération à vide.
 */
export function buildFirstContentUrl({ sellsProducts, subject }: FirstContentUrlOptions): string {
  const sujet = (subject ?? "").trim();
  if (sellsProducts) {
    const suffixe = sujet ? `&sujet=${encodeURIComponent(sujet)}` : "";
    return `/creer?format=carousel&carouselSubMode=photo${suffixe}`;
  }
  return `/creer?sujet=${encodeURIComponent(
    sujet || SUJET_PREMIER_CONTENU_GENERIQUE,
  )}&format=carousel&auto=1`;
}
