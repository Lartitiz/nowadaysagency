/* ── Règle du « premier contenu » ─────────────────────────────────────────
   Module PUR (aucune dépendance navigateur ni Supabase) : c'est la règle
   métier, et c'est elle que les tests unitaires verrouillent. La lecture des
   données vit dans first-content-destination.ts, qui appelle ceci.

   Deux règles, décidées le 14/08 :
   1. le 1er contenu est TOUJOURS un carrousel (le post ressemble trop à ce
      qu'on écrit déjà à la main — le carrousel montre le travail d'un coup) ;
   2. si elle vend des PRODUITS, c'est un carrousel PHOTO : on part de ses
      photos, pas d'un sujet de conseil qui sonne consultante.

   Règle du canal, décidée le 01/11 : le 1er contenu part sur un canal qu'elle
   utilise ou veut utiliser (voir chooseFirstContentChannel).           ── */

export const SUJET_PREMIER_CONTENU_GENERIQUE =
  "3 erreurs fréquentes dans mon domaine (et comment les éviter)";

/** « choix » : elle a répondu, mais aucun de ses canaux n'a de format à créer
    ici (site seul, podcast, TikTok…) → écran de choix, sans génération. */
export type FirstContentChannel = "instagram" | "linkedin" | "newsletter" | "pinterest" | "choix";

/**
 * Ordre de choix du canal, en suivant `profiles.canaux` (l'onboarding y range
 * d'abord les canaux déjà utilisés, puis les canaux souhaités) :
 * 1. le premier canal qui a un carrousel (Instagram ou LinkedIn) ;
 * 2. sinon le premier canal qui a son propre format (newsletter, Pinterest) :
 *    pas de carrousel à publier là, elle choisit avant toute génération ;
 * 3. sinon, si elle a répondu : écran de choix, sans canal imposé ;
 * 4. aucune réponse, ou profil illisible : le canal de sa première idée s'il
 *    dit LinkedIn, sinon Instagram.
 */
export function chooseFirstContentChannel(canaux: unknown, ideaCanal?: string | null): FirstContentChannel {
  const declares: string[] = Array.isArray(canaux)
    ? canaux.filter((c): c is string => typeof c === "string" && c !== "none")
    : [];
  const carrousel = declares.find((c) => c === "instagram" || c === "linkedin");
  if (carrousel) return carrousel as FirstContentChannel;
  const autreFormat = declares.find((c) => c === "newsletter" || c === "pinterest");
  if (autreFormat) return autreFormat as FirstContentChannel;
  if (declares.length > 0) return "choix";
  return ideaCanal === "linkedin" ? "linkedin" : "instagram";
}

/** Le 1er contenu ne part avec un carrousel que sur Instagram ou LinkedIn. */
export function firstContentIsCarousel(channel: FirstContentChannel): boolean {
  return channel === "instagram" || channel === "linkedin";
}

/** Première idée du diagnostic écrite pour ce canal, sinon la toute première. */
export function pickFirstContentIdea<T extends { canal?: string | null }>(ideas: T[] | null | undefined, channel: FirstContentChannel): T | null {
  const liste = ideas ?? [];
  return liste.find((idea) => idea.canal === channel) ?? liste[0] ?? null;
}

export interface FirstContentUrlOptions {
  /** Vend des produits (ou « les deux ») → carrousel photo. */
  sellsProducts: boolean;
  /** Idée personnelle tirée du diagnostic, si déjà prête (enrichment async). */
  subject?: string | null;
  /** Fiche de cette idée : le carrousel s'enregistre DANS l'idée au lieu d'en
      créer une seconde (sinon l'idée reste « à placer » une fois le carrousel
      fait — passe du 16/10). */
  ideaId?: string | null;
  /** Canal choisi par chooseFirstContentChannel. Absent = Instagram. */
  channel?: FirstContentChannel;
}

/**
 * Construit l'URL de démarrage du 1er contenu.
 *
 * Le mode automatique attend les photos du site avant de lancer le carrousel
 * produit. Sans photo exploitable, le choix manuel reste disponible.
 */
export function buildFirstContentUrl({ sellsProducts, subject, ideaId, channel = "instagram" }: FirstContentUrlOptions): string {
  const sujet = (subject ?? "").trim();
  // Sans sujet personnel, pas de fiche à relier (sujet générique).
  const fiche = sujet && ideaId ? ideaId : "";
  if (!firstContentIsCarousel(channel)) {
    // Pas de carrousel sur ce canal : l'écran de choix s'ouvre avec le sujet et
    // le canal pré-réglés. Rien n'est généré (ni crédit dépensé) sans son accord.
    return `/creer?sujet=${encodeURIComponent(sujet || SUJET_PREMIER_CONTENU_GENERIQUE)}${
      channel === "choix" ? "" : `&canal=${channel}`
    }${fiche ? `&idea_id=${encodeURIComponent(fiche)}` : ""}`;
  }
  const canal = channel === "linkedin" ? "&canal=linkedin" : "";
  if (sellsProducts) {
    // Le sujet n'entre PAS comme `sujet` (le carrousel photo part des photos),
    // mais voyage en repli : sans photo exploitable (pas de site, site sans
    // photo), /creer bascule sur un carrousel texte avec cette idée au lieu de
    // laisser la nouvelle inscrite devant un mode photo vide (passe du 10/10).
    // La fiche ne voyage qu'avec ce repli : un carrousel de ses photos ne
    // parle pas de l'idée, il ne doit pas la marquer comme faite.
    return `/creer?format=carousel&carouselSubMode=photo&firstProduct=1&auto=1&sujetSansPhoto=${encodeURIComponent(
      sujet || SUJET_PREMIER_CONTENU_GENERIQUE,
    )}${fiche ? `&ideaSansPhoto=${encodeURIComponent(fiche)}` : ""}${canal}`;
  }
  return `/creer?sujet=${encodeURIComponent(
    sujet || SUJET_PREMIER_CONTENU_GENERIQUE,
  )}&format=carousel&carouselSubMode=text&auto=1${fiche ? `&idea_id=${encodeURIComponent(fiche)}` : ""}${canal}`;
}
