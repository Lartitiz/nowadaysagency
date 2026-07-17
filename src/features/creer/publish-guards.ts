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
  const direct =
    r?.edited_text ||
    r?.full_text ||
    r?.content ||
    (typeof r?.caption === "string" ? r.caption : "");
  if (direct && String(direct).trim()) return String(direct);

  // Caption structurée {hook, body, cta, hashtags} (carrousel /creer). Avant, ce
  // cas ne lisait que caption.text/full (absents ici) → la légende ET les hashtags
  // édités ne partaient pas. On préserve la priorité text/full, puis on assemble
  // hook+body+cta et on ajoute les hashtags à la fin.
  const c: any = r?.caption && typeof r.caption === "object" ? r.caption : null;
  if (c) {
    if (typeof c.text === "string" && c.text.trim()) return c.text;
    if (typeof c.full === "string" && c.full.trim()) return c.full;
    const parts = [c.hook, c.body, c.cta].filter(Boolean).map((s: string) => String(s).trim());
    let text = parts.join("\n\n").trim();
    if (Array.isArray(c.hashtags) && c.hashtags.length > 0) {
      const tagLine = c.hashtags
        .map((h: string) => `#${String(h).replace(/^#+/, "").replace(/\s+/g, "")}`)
        .filter((h: string) => h.length > 1)
        .join(" ");
      if (tagLine) text = text ? `${text}\n\n${tagLine}` : tagLine;
    }
    if (text) return text;
  }

  return [r?.hook, r?.body, r?.cta].filter(Boolean).join("\n\n").trim() || "";
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

/**
 * Le contenu affiché est-il destiné au canal Instagram ? Conditionne l'AFFICHAGE
 * du bouton « Publier sur Instagram » : un post LinkedIn, une épingle Pinterest ou
 * une newsletter ne doivent pas le montrer du tout (même désactivé). Le crosspost
 * vers un autre canal passe par /linkedin/crosspost (régénération), pas par ici.
 */
export function isInstagramPublishTarget(args: {
  selectedFormat: string | null | undefined;
  isLinkedInCarousel?: boolean;
}): boolean {
  const { selectedFormat, isLinkedInCarousel } = args;
  if (!selectedFormat) return false;
  // Un carrousel généré pour LinkedIn a selectedFormat="carousel" : sans ce test,
  // il passerait pour un format Instagram.
  if (isLinkedInCarousel) return false;
  return ["carousel", "post", "story", "reel"].includes(selectedFormat);
}

/** Raison pour laquelle la publication Instagram est désactivée, ou null si publiable. */
export function instagramPublishDisabledReason(args: {
  selectedFormat: string | null | undefined;
  isCarousel: boolean;
  visualSlidesCount: number;
  publishableImageUrl: string | null;
  isLinkedInCarousel?: boolean;
}): string | null {
  const { selectedFormat, isCarousel, visualSlidesCount, publishableImageUrl, isLinkedInCarousel } = args;
  if (!isInstagramPublishTarget({ selectedFormat, isLinkedInCarousel })) {
    return "Publication Instagram disponible uniquement pour les formats Instagram.";
  }
  // L'edge social-instagram-publish ne gère que le feed (image simple + carrousel),
  // pas media_type=STORIES : sans ce garde, une story partirait en post feed.
  if (selectedFormat === "story") {
    return "La publication directe des stories arrive bientôt — en attendant, télécharge le visuel et publie-le depuis l'app Instagram.";
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
