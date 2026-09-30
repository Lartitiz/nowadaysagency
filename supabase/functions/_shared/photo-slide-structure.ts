// Restauration DÉTERMINISTE de la structure confirmée sur les carrousels photo/mix.
//
// Audit carrousel photo 12/07/2026 : l'étape structure_proposal assigne finement
// photo_index + slide_type (répétitions de photos voulues, ex 1,1,2,3,3,4,4), puis
// l'écriture (express_full + confirmed_structure) renvoie photo_index null et
// slide_type absent (13/13 slides sur 2 runs — la consigne « le champ photo_index
// doit être présent » est désobéie). Personne ne restaurait : l'edge n'injectait la
// structure que dans le PROMPT, et le front retombait sur une assignation
// séquentielle avec bouclage → le texte écrit pour une photo se retrouvait posé
// sur une autre. Ici on recopie l'intention de la structure EN CODE, par
// slide_number, jamais par obéissance du modèle.
//
// Même patron que verbatim-guard / schema-limit : fonctions pures sur le JSON
// sérialisé, échec silencieux (contenu rendu tel quel si parsing impossible).

type AnySlide = Record<string, unknown>;

function extractJson(content: string): { parsed: any; jsonText: string } | null {
  if (!content) return null;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return { parsed: JSON.parse(jsonMatch[0]), jsonText: jsonMatch[0] };
  } catch {
    return null;
  }
}

function isPhotoType(t: unknown): boolean {
  return t === "photo_full" || t === "photo_integrated";
}

/** Nombre de slides du carrousel sérialisé (0 si illisible). */
export function countCarouselSlides(content: string): number {
  const doc = extractJson(content);
  const slides = doc?.parsed?.slides;
  return Array.isArray(slides) ? slides.length : 0;
}

/** Plus grand photo_index déclaré par une structure confirmée (0 si aucun). */
export function maxStructurePhotoIndex(structure: unknown): number {
  if (!Array.isArray(structure)) return 0;
  let max = 0;
  for (const s of structure) {
    const idx = (s as AnySlide)?.photo_index;
    if (Number.isInteger(idx) && (idx as number) > max) max = idx as number;
  }
  return max;
}

/** Premier carrousel produit : une image par slide tant que le stock le permet. */
export function assignDistinctStructurePhotos<T extends { slides?: AnySlide[]; total_slides?: number }>(
  proposal: T,
  photoCount: number,
): T {
  if (!Array.isArray(proposal?.slides) || photoCount < 2) return proposal;
  const slides = proposal.slides;
  // La consigne demande exactement autant de slides que de photos. Si le
  // modèle en ajoute, garder la conclusion plutôt qu'une fin tronquée.
  const kept = slides.length > photoCount
    ? [...slides.slice(0, photoCount - 1), slides[slides.length - 1]]
    : slides;
  const reserved = new Set<number>();
  const keepRequested = kept.map((slide) => {
    const index = slide.photo_index;
    if (!Number.isInteger(index) || (index as number) < 1 || (index as number) > photoCount || reserved.has(index as number)) return false;
    reserved.add(index as number);
    return true;
  });
  const used = new Set<number>();
  const nextSlides = kept.map((slide, i) => {
    const next = { ...slide };
    const requested = next.photo_index;
    const index = keepRequested[i]
      ? requested as number
      : Array.from({ length: photoCount }, (_, n) => n + 1).find((candidate) => !reserved.has(candidate) && !used.has(candidate))!;
    used.add(index);
    if (index !== requested) {
      // Ces observations concernaient l'ancienne image et ne doivent pas
      // guider la rédaction ou le placement sur une autre photo.
      delete next.photo_observation;
      delete next.visual_anchor;
      delete next.image_relation;
      delete next.overlay_position;
    }
    next.photo_index = index;
    next.slide_type = "photo_full";
    next.slide_number = i + 1;
    return next;
  });
  return { ...proposal, slides: nextSlides, total_slides: nextSlides.length };
}

/**
 * Recopie photo_index / slide_type / role de la structure confirmée vers les
 * slides générées, appariées par slide_number (fallback : position). La structure validée prime sur les choix du modèle.
 */
export function mergeConfirmedStructure(content: string, structure: unknown, opts: { automatic?: boolean } = {}): string {
  if (!Array.isArray(structure) || structure.length === 0) return content;
  const doc = extractJson(content);
  if (!doc) return content;
  const slides = doc.parsed?.slides;
  if (!Array.isArray(slides) || slides.length === 0) return content;

  const byNumber = new Map<number, AnySlide>();
  for (const s of structure) {
    const n = (s as AnySlide)?.slide_number;
    if (Number.isInteger(n)) byNumber.set(n as number, s as AnySlide);
  }

  let merged = 0;
  slides.forEach((slide: AnySlide, i: number) => {
    if (!slide || typeof slide !== "object") return;
    const ref = byNumber.get(slide.slide_number as number) ?? (structure[i] as AnySlide | undefined);
    if (!ref) return;

    const refType = ref.slide_type || ref.type;
    if (typeof refType === "string" && refType && slide.slide_type !== refType) {
      slide.slide_type = refType;
      merged++;
    }
    const effectiveType = typeof slide.slide_type === "string" ? slide.slide_type : refType;

    // If the writer returned a different layout, keep its visible words available
    // in the fields consumed by the confirmed layout (never discard the source).
    if (effectiveType === "photo_full" && !slide.overlay_text) {
      const words = [slide.title, slide.body].filter(v => typeof v === "string" && v.trim());
      if (words.length) slide.overlay_text = words.join("\n\n");
    } else if ((effectiveType === "text_only" || effectiveType === "photo_integrated") && !slide.body && typeof slide.overlay_text === "string") {
      slide.body = slide.overlay_text;
    }

    const refIdx = ref.photo_index;
    const slideIdx = slide.photo_index;
    if (effectiveType === "text_only") {
      // Une slide texte ne porte jamais de photo (null explicite, jamais undefined).
      if (slideIdx !== null) slide.photo_index = null;
    } else if (Number.isInteger(refIdx) && slideIdx !== refIdx) {
      slide.photo_index = refIdx;
      merged++;
    }

    for (const field of ["photo_layout", "overlay_position"]) {
      if (typeof ref[field] === "string") slide[field] = ref[field];
    }
    if (!opts.automatic && typeof ref.role === "string" && ref.role) {
      slide.role = ref.role;
    }
  });

  if (merged > 0) {
    console.log(`[photo-slide-structure] structure confirmée restaurée sur ${merged} champ(s) (photo_index/slide_type)`);
  }
  return content.replace(doc.jsonText, JSON.stringify(doc.parsed, null, 2));
}

/**
 * Filet photo_index (successeur du normalizePhotoIndexes historique de carousel-ai).
 *
 * Corrige le trou constaté à l'audit 12/07 : en mode photo PUR le modèle omet
 * slide_type (3 runs/3), or l'ancien filet ne reconnaissait une slide photo que
 * par slide_type — il ne se déclenchait donc jamais sur ce chemin. Avec
 * `assumePhotoWhenTypeMissing`, une slide sans slide_type est traitée comme
 * photo_full (c'est ce que le renderer front fait déjà).
 *
 * Corrige uniquement les index absents ou hors plage. Une assignation valide —
 * y compris avec répétitions voulues — est respectée telle quelle.
 */
export function normalizePhotoIndexes(
  content: string,
  photoCount: number,
  opts: { assumePhotoWhenTypeMissing?: boolean } = {},
): string {
  if (!content || photoCount <= 0) return content;
  const doc = extractJson(content);
  if (!doc) return content;
  const slides = doc.parsed?.slides;
  if (!Array.isArray(slides) || slides.length === 0) return content;

  const isPhotoSlide = (s: AnySlide) =>
    isPhotoType(s?.slide_type) ||
    (opts.assumePhotoWhenTypeMissing === true && typeof s?.slide_type !== "string");

  const photoSlides = slides.filter((s: AnySlide) => s && isPhotoSlide(s));
  if (photoSlides.length === 0) {
    slides.forEach((s: AnySlide) => {
      if (s && s.slide_type === "text_only") s.photo_index = null;
    });
  } else {
    let cursor = 0;
    slides.forEach((s: AnySlide) => {
      if (!s) return;
      if (isPhotoSlide(s)) {
        const fallback = Math.min(++cursor, photoCount);
        const idx = s.photo_index;
        if (!Number.isInteger(idx) || (idx as number) < 1 || (idx as number) > photoCount) s.photo_index = fallback;
      } else if (s.slide_type === "text_only") s.photo_index = null;
    });
  }

  return content.replace(doc.jsonText, JSON.stringify(doc.parsed, null, 2));
}

/**
 * Appariement style/longueur des overlays (audit 12/07, lot E) : « minimal »
 * (pilule/très grand) et « technique » (étiquette) sont conçus pour des phrases
 * courtes — vu en live une phrase narrative de 23 mots rendue en pavé noir
 * d'étiquette. Au-delà de 18 mots, l'overlay bascule en « narratif » (carte
 * opaque lisible). Déterministe, aucune réécriture de texte.
 */
export function normalizeOverlayStyles(content: string): string {
  const doc = extractJson(content);
  if (!doc) return content;
  const slides = doc.parsed?.slides;
  if (!Array.isArray(slides) || slides.length === 0) return content;
  let fixes = 0;
  for (const s of slides as AnySlide[]) {
    const text = typeof s?.overlay_text === "string" ? s.overlay_text.trim() : "";
    if (!text) continue;
    const words = text.split(/\s+/).filter(Boolean).length;
    const style = s.overlay_style;
    if (words > 18 && (style === "minimal" || style === "technique")) {
      s.overlay_style = "narratif";
      fixes++;
    }
  }
  if (fixes > 0) {
    console.log(`[photo-slide-structure] ${fixes} overlay_style long(s) rebasculé(s) en narratif (minimal/technique ≤ 18 mots)`);
  }
  return content.replace(doc.jsonText, JSON.stringify(doc.parsed, null, 2));
}

export interface MixCompositionReport {
  total: number;
  photoSlides: number;
  photoRatio: number;
  maxConsecutiveSameType: number;
  violatesRatio: boolean;
  violatesRun: boolean;
}

/**
 * Mesure de composition d'un carrousel MIX (audit 12/07, lot D — télémétrie
 * seule, pas de correction auto) : le prompt exige ≥ 50 % de slides photo et
 * jamais 3 slides de même type d'affilée ; vu en live 33 % photo et 3 text_only
 * consécutives. On mesure et on loggue pour dimensionner un éventuel fix.
 */
export function analyzeMixComposition(content: string): MixCompositionReport | null {
  const doc = extractJson(content);
  const slides = doc?.parsed?.slides;
  if (!Array.isArray(slides) || slides.length === 0) return null;
  const types = (slides as AnySlide[]).map((s) =>
    isPhotoType(s?.slide_type) ? "photo" : s?.slide_type === "text_only" ? "text" : "autre",
  );
  const photoSlides = types.filter((t) => t === "photo").length;
  let maxRun = 1;
  let run = 1;
  for (let i = 1; i < types.length; i++) {
    run = types[i] === types[i - 1] ? run + 1 : 1;
    if (run > maxRun) maxRun = run;
  }
  const photoRatio = photoSlides / types.length;
  return {
    total: types.length,
    photoSlides,
    photoRatio: Math.round(photoRatio * 100) / 100,
    maxConsecutiveSameType: maxRun,
    violatesRatio: photoRatio < 0.4, // 50 % exigé, 40 % toléré
    violatesRun: maxRun >= 3,
  };
}
