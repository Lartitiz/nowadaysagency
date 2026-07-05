/**
 * Gardes de publication directe (Instagram / LinkedIn) — logique PURE extraite
 * de CreerUnifie (lot 4 de la dé-monolithisation, cf src/features/creer/).
 * Aucune dépendance React : tout est calculé à partir du résultat de génération.
 */

/** Résultat brut de génération (result.raw ou result) — forme libre selon le format. */
type RawResult = Record<string, any> | null | undefined;

/**
 * Première URL d'image publiable trouvée dans le résultat (https public
 * uniquement : Instagram refuse blob:/data:/URLs privées).
 */
export function findPublishableImageUrl(raw: RawResult, uploadedPhotoPreview?: string | null): string | null {
  const r: any = raw;
  if (!r) return null;
  const candidates: any[] = [
    r.image_url, r.imageUrl, r.cover_url, r.coverUrl, r.photo_url, r.photoUrl,
    r.photo?.url, r.pexels?.url, r.image?.url,
    r.slides?.[0]?.image_url, r.slides?.[0]?.imageUrl, r.slides?.[0]?.photo?.url,
    uploadedPhotoPreview,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^https:\/\//i.test(c) && !c.startsWith("blob:") && !c.startsWith("data:")) {
      return c;
    }
  }
  return null;
}

/** Texte à publier sur Instagram (inclut le champ caption, string ou objet). */
export function extractInstagramCaption(raw: RawResult): string {
  const r: any = raw;
  return (
    r?.edited_text ||
    r?.full_text ||
    r?.content ||
    (typeof r?.caption === "string" ? r.caption : (r?.caption?.text || r?.caption?.full || "")) ||
    [r?.hook, r?.body, r?.cta].filter(Boolean).join("\n\n").trim() ||
    ""
  );
}

/** Texte à publier sur LinkedIn (chaîne historique, sans le champ caption). */
export function extractLinkedInText(raw: RawResult): string {
  const r: any = raw;
  return (
    r?.edited_text ||
    r?.full_text ||
    r?.content ||
    [r?.hook, r?.body, r?.cta].filter(Boolean).join("\n\n").trim() ||
    ""
  );
}

/** Raison pour laquelle la publication Instagram est désactivée, ou null si publiable. */
export function instagramPublishDisabledReason(args: {
  selectedFormat: string | null | undefined;
  isCarousel: boolean;
  visualSlidesCount: number;
  publishableImageUrl: string | null;
}): string | null {
  const { selectedFormat, isCarousel, visualSlidesCount, publishableImageUrl } = args;
  if (selectedFormat?.startsWith("pinterest") || selectedFormat === "linkedin" || selectedFormat === "newsletter") {
    return "Publication Instagram disponible uniquement pour les formats Instagram.";
  }
  if (isCarousel) {
    return visualSlidesCount >= 2 ? null : "Génère les visuels du carrousel pour pouvoir le publier.";
  }
  if (!publishableImageUrl) return "Aucune image publique trouvée. Une image avec une URL https publique est requise.";
  return null;
}

/** Raison pour laquelle la publication LinkedIn est désactivée, ou null si publiable. */
export function linkedInPublishDisabledReason(args: {
  isLinkedInTextPost: boolean;
  raw: RawResult;
}): string | null {
  if (!args.isLinkedInTextPost) return null; // bouton non affiché dans ce cas
  if (!extractLinkedInText(args.raw).trim()) return "Génère ton post LinkedIn pour pouvoir le publier.";
  return null;
}
