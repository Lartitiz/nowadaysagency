// Détection du format demandé à creative-flow : UNE seule règle pour tout le
// handler (fiche 3, lot F3, 14/10/2026). Avant, le format était deviné à
// plusieurs endroits avec des règles différentes (sous-chaîne du contentType
// brut ici, contentType + angle là) : la consigne pouvait être écrite pour
// LinkedIn et la température réglée pour Instagram. Toute nouvelle lecture du
// format passe par detectFormatFlags. Le mode photo (formats/photo.ts) garde
// sa propre lecture du contentType pour la consigne vision.
// Voir docs/creation-contenu/CARTE.md.

/**
 * Format qui choisit la branche de rédaction. Le format demandé par
 * l'utilisatrice (`contentType`) prime TOUJOURS ; `angle.format_livraison`
 * (suggestion IA du step "angles") ne sert que s'il n'y a pas de contentType.
 * Avant : format_livraison passait devant, un angle « carrousel » pouvait
 * faire rédiger un carrousel pour un post LinkedIn demandé.
 */
export function resolveFormatHint(contentType: string | null | undefined, angle: { format_livraison?: unknown } | null | undefined): string {
  const requested = typeof contentType === "string" ? contentType.trim().toLowerCase() : "";
  if (requested) return requested;
  return typeof angle?.format_livraison === "string" ? angle.format_livraison.toLowerCase() : "";
}

export type FormatFlags = {
  formatHint: string;
  isCarousel: boolean;
  isReel: boolean;
  isStories: boolean;
  isLinkedIn: boolean;
  isPinterest: boolean;
  isNewsletter: boolean;
  isCaption: boolean;
  isPhotoMode: boolean;
};

/** Drapeaux de format, par sous-chaîne du format résolu (même règle qu'avant dans le handler). */
export function detectFormatFlags(contentType: string | null | undefined, angle: { format_livraison?: unknown } | null | undefined, body?: { photo_mode?: unknown } | null): FormatFlags {
  const formatHint = resolveFormatHint(contentType, angle);
  const isCarousel = formatHint.includes("carrousel") || formatHint.includes("carousel");
  const isReel = formatHint.includes("reel") || formatHint.includes("script");
  const isStories = formatHint.includes("stories") || formatHint.includes("story");
  const isLinkedIn = formatHint.includes("linkedin") || contentType === "post_linkedin";
  const isPinterest = formatHint.includes("pinterest") || contentType === "post_pinterest";
  const isNewsletter = formatHint.includes("newsletter") || formatHint.includes("email") || contentType === "post_newsletter";
  const isCaption = !isCarousel && !isReel && !isStories && !isLinkedIn && !isPinterest && !isNewsletter;
  const isPhotoMode = body?.photo_mode === true;
  return { formatHint, isCarousel, isReel, isStories, isLinkedIn, isPinterest, isNewsletter, isCaption, isPhotoMode };
}

/** Canal du persona lu par getUserContext : LinkedIn, Instagram (post, carrousel, reel, stories) ou aucun. */
export function personaChannel(flags: FormatFlags): "linkedin" | "instagram" | undefined {
  if (flags.isLinkedIn) return "linkedin";
  if (flags.formatHint.includes("instagram") || flags.isCarousel || flags.isReel || flags.isStories) return "instagram";
  return undefined;
}
